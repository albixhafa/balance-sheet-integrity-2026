"use client";

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock, AlertCircle, FileText, Search, Filter, Loader2 } from 'lucide-react';
import { getLoggedInUser } from '@/app/actions/auth';

export default function StatusPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the user to check their entity permissions
  useEffect(() => {
    getLoggedInUser().then(data => {
      setUser(data);
      setLoading(false);
    });
  }, []);

  // Dummy data (we will replace this with real database data later)
  const statusData = [
    { id: 1, entity: 'ABC001', gl: '1000 - Cash', preparer: 'Kendal Brock', status: 'COMPLETED', updated: 'Today, 10:30 AM' },
    { id: 2, entity: 'ABC001', gl: '1200 - AR', preparer: 'Jordan Mike', status: 'IN_REVIEW', updated: 'Today, 9:15 AM' },
    { id: 3, entity: 'XYZ123', gl: '2000 - AP', preparer: 'Kendal Brock', status: 'PENDING', updated: 'Yesterday' },
    { id: 4, entity: 'XYZ123', gl: '3000 - Equity', preparer: 'Unassigned', status: 'NOT_STARTED', updated: '--' },
  ];

  if (loading) {
    return <div className="p-8 flex items-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Loading status...</div>;
  }

  if (!user) {
    return <div className="p-8 text-rose-500 font-semibold bg-rose-50 rounded-lg border border-rose-200">Access Denied. Please log in to view reconciliation status.</div>;
  }

  // --- FILTER THE DATA BASED ON USER PERMISSIONS ---
  const visibleData = statusData.filter(row => {
    // 1. Admins and Super Admins see everything
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
    
    // 2. Other users only see rows where the entity matches their assigned entities
    if (user.entities && user.entities.length > 0) {
      return user.entities.some((ent: any) => ent.code === row.entity);
    }

    // 3. If they have no entities assigned, they see nothing
    return false;
  });

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-8 bg-slate-50 min-h-full">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reconciliation Status</h1>
          <p className="text-sm text-slate-500 mt-1">Track month-end close progress across your assigned entities.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search accounts..." 
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64 bg-white"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            <Filter size={16} /> Filter
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Accounts</p>
            <p className="text-2xl font-bold text-slate-900">{visibleData.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-bold text-slate-900">{visibleData.filter(d => d.status === 'COMPLETED').length}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center shrink-0">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">In Review</p>
            <p className="text-2xl font-bold text-slate-900">{visibleData.filter(d => d.status === 'IN_REVIEW').length}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center shrink-0">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Not Started</p>
            <p className="text-2xl font-bold text-slate-900">{visibleData.filter(d => d.status === 'NOT_STARTED').length}</p>
          </div>
        </div>
      </div>

      {/* Status Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Entity</th>
                <th className="px-6 py-4 font-semibold">GL Account</th>
                <th className="px-6 py-4 font-semibold">Preparer</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Last Updated</th>
                <th className="px-6 py-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No reconciliation tasks found for your assigned entities.
                  </td>
                </tr>
              ) : (
                visibleData.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{row.entity}</td>
                    <td className="px-6 py-4 text-slate-700 font-medium">{row.gl}</td>
                    <td className="px-6 py-4 text-slate-600">{row.preparer}</td>
                    <td className="px-6 py-4">
                      {row.status === 'COMPLETED' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> Approved</span>}
                      {row.status === 'IN_REVIEW' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200"><Clock size={12} /> Reviewing</span>}
                      {row.status === 'PENDING' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200"><Clock size={12} /> Working</span>}
                      {row.status === 'NOT_STARTED' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200"><AlertCircle size={12} /> Not Started</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{row.updated}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs transition-colors">View Details</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}