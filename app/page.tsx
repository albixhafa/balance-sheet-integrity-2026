"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, CheckCircle2, ChevronRight, Activity } from 'lucide-react';
import { getUserEntities, getBalanceSheetData } from '@/app/actions/account';

const formatPeriod = (p: string | null, fallback: string = '-') => {
  if (!p || p.length !== 6) return fallback;
  const year = p.substring(0, 4);
  const monthNum = parseInt(p.substring(4, 6), 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[monthNum - 1]} ${year}`;
};

export default function BalanceSheetDashboard() {
  const [entities, setEntities] = useState<any[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [glAccounts, setGlAccounts] = useState<any[]>([]);
  
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Load entities on mount
  useEffect(() => {
    const loadEntities = async () => {
      try {
        const userEntities = await getUserEntities();
        setEntities(userEntities);
        if (userEntities.length > 0) {
          setSelectedEntity(userEntities[0].code); 
        }
      } catch (err: any) {
        setError(err.message || "Failed to load entities.");
      }
      setLoadingInitial(false);
    };
    loadEntities();
  }, []);

  // 2. Automatically fetch data whenever the selected entity changes
  useEffect(() => {
    if (!selectedEntity) return;

    const fetchReport = async () => {
      setIsRunning(true);
      setError(null);
      try {
        const data = await getBalanceSheetData(selectedEntity);
        setGlAccounts(data);
      } catch (err: any) {
        setError(err.message || "Failed to pull ledger data.");
        setGlAccounts([]);
      }
      setIsRunning(false);
    };

    fetchReport();
  }, [selectedEntity]); // This dependency array is the magic that triggers the auto-load

  if (loadingInitial) {
    return <div className="flex h-screen items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-3" size={24} /> Loading Dashboard...</div>;
  }

  const selectedEntityName = entities.find(e => e.code === selectedEntity)?.name || selectedEntity;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 bg-slate-50 min-h-full">
      
      {/* HEADER & COMPACT FILTER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Account Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-1">Review and reconcile general ledger balances for your assigned entities.</p>
        </div>

        {/* Compact Auto-Updating Dropdown */}
        {/* ... rest of the dropdown code remains exactly the same ... */}

        {/* Compact Auto-Updating Dropdown */}
        <div className="flex items-center gap-3">
          {isRunning && (
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
              <Loader2 size={14} className="animate-spin" /> Updating...
            </span>
          )}
          
          <div className="bg-white border border-slate-200 shadow-sm rounded-lg flex items-center p-1 pl-3 transition-colors focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Entity:</span>
            <select 
              value={selectedEntity} 
              onChange={(e) => setSelectedEntity(e.target.value)}
              disabled={isRunning}
              className="bg-slate-50 border-none rounded-md py-1.5 px-3 text-sm font-bold text-slate-800 outline-none cursor-pointer min-w-[220px] disabled:opacity-50"
            >
              {entities.map(ent => (
                <option key={ent.code} value={ent.code}>{ent.code} - {ent.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-700 border border-rose-200 p-4 rounded-xl flex items-center gap-3 font-medium">
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {/* RESULTS TABLE */}
      {glAccounts.length > 0 && (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-opacity duration-200 ${isRunning ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
          
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
               {selectedEntity} - {selectedEntityName}
            </h2>
            <span className="bg-slate-200 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              {glAccounts.length} Accounts
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase font-semibold border-b border-slate-200 bg-white">
                <tr>
                  <th className="p-4 w-40 border-r border-slate-100">GL Number</th>
                  <th className="p-4 w-auto">GL Description</th>
                  <th className="p-4 w-48 text-center bg-emerald-50/30 text-emerald-800 border-l border-slate-100">Last Closed Period</th>
                  <th className="p-4 w-40 text-center bg-blue-50/30 text-blue-800 border-l border-blue-100/50">Active Period</th>
                  <th className="p-4 w-48 text-right bg-blue-50/20 text-blue-900 border-r border-blue-100/50">Current Balance</th>
                  <th className="p-4 w-32 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {glAccounts.map((gl) => (
                  <tr key={gl.glNumber} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4 border-r border-slate-100 font-mono font-bold text-slate-800">{gl.glNumber}</td>
                    <td className="p-4 text-slate-600 font-medium">{gl.description}</td>
                    
                    {/* LAST CLOSED PERIOD (GREEN) */}
                    <td className="p-4 text-center bg-emerald-50/10 border-l border-slate-100/50">
                      {gl.lastClosedPeriod ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
                          <CheckCircle2 size={14} />
                          {formatPeriod(gl.lastClosedPeriod)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          Never Closed
                        </span>
                      )}
                    </td>

                    {/* ACTIVE PERIOD (BLUE) */}
                    <td className="p-4 text-center bg-blue-50/10 border-l border-blue-100/50">
                      <span className="font-mono text-xs font-bold text-blue-800 flex items-center justify-center gap-1.5">
                         <Activity size={14} className="text-blue-500" />
                         {gl.activePeriodId ? formatPeriod(gl.activePeriodId) : 'No Activity'}
                      </span>
                    </td>

                    {/* CURRENT BALANCE (BLUE TINT) */}
                    <td className={`p-4 text-right font-mono font-bold bg-blue-50/5 border-r border-blue-100/50 ${gl.currentPeriodBalance < 0 ? 'text-slate-900' : 'text-blue-700'}`}>
                      {gl.currentPeriodBalance < 0 
                        ? `-$${Math.abs(gl.currentPeriodBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}` 
                        : `$${gl.currentPeriodBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>

                    {/* ACTION BUTTON */}
                    <td className="p-4 text-center">
                      <Link href={`/account/${gl.glNumber}`} className="inline-flex items-center justify-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-4 py-1.5 rounded-lg transition-colors w-full">
                        Review <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isRunning && glAccounts.length === 0 && selectedEntity && !error && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 font-medium">No General Ledger accounts found for this entity.</p>
          <p className="text-sm text-slate-400 mt-1">Make sure you have seeded accounts into the database for {selectedEntity}.</p>
        </div>
      )}

    </div>
  );
}