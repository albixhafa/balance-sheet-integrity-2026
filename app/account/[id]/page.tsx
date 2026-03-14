"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Paperclip, FileText, CheckCircle2, UploadCloud, PlusSquare, MinusSquare, UserCheck, ShieldCheck, Clock, Lock, AlertCircle, XCircle, Loader2, Save, CheckSquare } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation'; 
import { getAccountDetails, signOff, rejectWorkflow, saveAdjustments, toggleClearedStatus, unsign } from '@/app/actions/account';

const formatPeriod = (p: string) => {
  if (!p || p.length !== 6) return p;
  const year = p.substring(0, 4);
  const monthNum = parseInt(p.substring(4, 6), 10);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[monthNum - 1]} ${year}`;
};

export default function AccountDetails() {
  const params = useParams();
  const router = useRouter(); 
  
  const glId = (params?.id as string) || ''; 

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false); 
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accountData, setAccountData] = useState<any>(null);
  
  const [currentPeriodId, setCurrentPeriodId] = useState<string>('');
  const [currentRows, setCurrentRows] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any>({ assembler: null, reviewer: null, approver: null });
  const [historicalData, setHistoricalData] = useState<any[]>([]);

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]); 
  const [showSubs, setShowSubs] = useState(false); 
  const [expandedHistory, setExpandedHistory] = useState<string[]>([]);
  const [isCurrentPeriodExpanded, setIsCurrentPeriodExpanded] = useState(true);

  const loadData = async () => {
    if (!glId) return; 

    setLoading(true);
    try {
      const data = await getAccountDetails(glId);
      
      setCurrentUser(data.currentUser);
      setAccountData(data.glAccount);
      setCurrentPeriodId(data.currentPeriodId);
      
      // --- Map supportFileUrl to 'file' so the UI can read it! ---
      const mappedCurrent = data.currentTransactions.map((t: any) => ({
        ...t,
        file: t.supportFileUrl || null
      }));
      setCurrentRows(mappedCurrent);

      const mappedHistorical = data.historicalPeriods.map((h: any) => ({
        ...h,
        transactions: h.transactions.map((t: any) => ({
          ...t,
          file: t.supportFileUrl || null
        }))
      }));
      setHistoricalData(mappedHistorical);

      // --- THE FIX: Safely check if the date exists before calling new Date() ---
      setSignatures({
        assembler: data.currentRecon?.assembler && data.currentRecon.assembledAt
          ? { name: data.currentRecon.assembler.name, date: new Date(data.currentRecon.assembledAt).toLocaleString() } 
          : null,
        reviewer: data.currentRecon?.reviewer && data.currentRecon.reviewedAt
          ? { name: data.currentRecon.reviewer.name, date: new Date(data.currentRecon.reviewedAt).toLocaleString() } 
          : null,
        approver: data.currentRecon?.approver && data.currentRecon.approvedAt
          ? { name: data.currentRecon.approver.name, date: new Date(data.currentRecon.approvedAt).toLocaleString() } 
          : null,
      });
    } catch (error: any) {
      console.error("Failed to load account details", error);
      alert(error.message || "You do not have access to this page.");
      router.push('/'); 
    }
    setLoading(false);
  };

  useEffect(() => {
    if (glId) loadData(); 
  }, [glId]);

  const currentClearedTxns = currentRows.filter(r => r.cleared);
  const clearedNetTotal = currentClearedTxns.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const isClearedNetZero = currentRows.length === 0 || Math.abs(clearedNetTotal) < 0.01;

  const currentPeriodTotal = currentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const historicalTotal = historicalData.reduce((sum, hist) => sum + hist.transactions.reduce((s: number, r: any) => s + Number(r.amount || 0), 0), 0);
  const ytdTotal = currentPeriodTotal + historicalTotal;
  const derivedStatus = signatures.approver ? 'Completed' : signatures.assembler ? 'In Progress' : 'Pending';

  const selectedRowsData = currentRows.filter(row => selectedRowIds.includes(row.id));
  const selectedNetTotal = selectedRowsData.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const allSelectedAreCleared = selectedRowsData.length > 0 && selectedRowsData.every(r => r.cleared);
  const isNetZero = selectedRowsData.length > 0 && Math.abs(selectedNetTotal) < 0.01;
  const selectedRowsWithFiles = selectedRowsData.filter(r => r.file);
  const fileToShare = selectedRowsWithFiles.length > 0 ? selectedRowsWithFiles[0].file : null;

  const sortedRows = [...currentRows].sort((a, b) => {
    if (a.cleared === b.cleared) return a.txnDate.localeCompare(b.txnDate); 
    return a.cleared ? 1 : -1; 
  });

  const handleSignOff = async (role: 'assembler' | 'reviewer' | 'approver') => {
    const firstConfirm = window.confirm(`Are you sure you want to officially sign off as the ${role.toUpperCase()}?`);
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(`FINAL VERIFICATION: By clicking OK, you legally confirm you have reviewed all balances and attached support for this period.`);
    if (!secondConfirm) return;

    setIsSaving(true);
    setSignatures((prev: any) => ({
      ...prev,
      [role]: { name: currentUser?.name || 'System Admin', date: new Date().toLocaleString() }
    }));

    try {
      await signOff(glId, currentPeriodId, role);
      router.refresh(); 
      await loadData(); 
    } catch (error: any) {
      console.error("Failed to sign off:", error);
      alert(error.message || "Database Error: Failed to save signature.");
      await loadData(); 
    }
    setIsSaving(false);
  };

  const handleUnsign = async (role: 'assembler' | 'reviewer' | 'approver') => {
    const confirmUndo = window.confirm(
      role === 'approver' 
      ? `WARNING: Uncleared items have already rolled forward to the next period. Undoing this signature will NOT pull them back. Continue?`
      : `Are you sure you want to completely UNDO this signature? This will drop the workflow status.`
    );
    
    if (!confirmUndo) return;

    setIsSaving(true);
    setSignatures((prev: any) => ({
      ...prev,
      [role]: null
    }));

    try {
      await unsign(glId, currentPeriodId, role);
      router.refresh();
      await loadData(); 
    } catch (error) {
      console.error("Failed to unsign:", error);
      alert("Failed to undo sign-off.");
      await loadData();
    }
    setIsSaving(false);
  };

  const handleReject = async (level: 'reviewer' | 'approver') => {
    const confirmReject = window.confirm(`Are you sure you want to REJECT this ledger? This will erase previous signatures.`);
    if (!confirmReject) return;

    setIsSaving(true);
    try {
      await rejectWorkflow(glId, currentPeriodId, level);
      await loadData(); 
      router.refresh(); 
    } catch (error) {
      console.error("Failed to reject:", error);
    }
    setIsSaving(false);
  };

  const toggleHistoryAccordion = (periodId: string) => {
    setExpandedHistory(prev => prev.includes(periodId) ? prev.filter(p => p !== periodId) : [...prev, periodId]);
  };
  
  const handleSelectRow = (id: string) => setSelectedRowIds(prev => prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]);
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => e.target.checked ? setSelectedRowIds(currentRows.map(r => r.id)) : setSelectedRowIds([]);

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsSaving(true);
    setCurrentRows(prev => prev.map(row => selectedRowIds.includes(row.id) ? { ...row, file: file.name } : row));
    try {
      const payload = selectedRowIds.map(id => ({ id, file: file.name }));
      await saveAdjustments(payload);
    } catch (err) { console.error(err); }
    setIsSaving(false);
  };

  const handleSingleUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsSaving(true);
    setCurrentRows(prev => prev.map(row => row.id === id ? { ...row, file: file.name } : row));
    try {
      await saveAdjustments([{ id, file: file.name }]);
    } catch (err) { console.error(err); }
    setIsSaving(false);
  };

  const handleShareExistingFile = async () => {
    if (!fileToShare) return;
    
    setIsSaving(true);
    setCurrentRows(prev => prev.map(row => selectedRowIds.includes(row.id) ? { ...row, file: fileToShare } : row));
    try {
      const payload = selectedRowIds.map(id => ({ id, file: fileToShare }));
      await saveAdjustments(payload);
    } catch (err) { console.error(err); }
    setIsSaving(false);
  };

  const handleViewFile = (fileName: string) => {
    alert(`In a production environment, clicking this would open [${fileName}] securely from your connected AWS S3 bucket or cloud storage!`);
  };

  const handleSaveAdjustments = async () => {
    setIsSaving(true);
    try {
      const payload = currentRows.map(row => ({ id: row.id, file: row.file || null }));
      await saveAdjustments(payload);
      router.refresh(); 
      await loadData(); 
    } catch (error) {
      console.error("Failed to save adjustments", error);
    }
    setIsSaving(false);
  };

  const handleToggleCleared = async (clearedStatus: boolean) => {
    setIsSaving(true);
    try {
      const payload = currentRows.map(row => ({ id: row.id, file: row.file || null }));
      await saveAdjustments(payload);

      await toggleClearedStatus(selectedRowIds, clearedStatus);
      router.refresh(); 
      await loadData();
      setSelectedRowIds([]); 
    } catch (error) {
      console.error("Failed to toggle cleared status", error);
    }
    setIsSaving(false);
  };

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';
  const canAssemble = isAdmin || currentUser?.role === 'ASSEMBLER';
  const canReview = isAdmin || currentUser?.role === 'REVIEWER';
  const canApprove = isAdmin || currentUser?.role === 'APPROVER';

  if (loading) return <div className="flex h-screen items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-3" size={24} /> Loading Ledger Data...</div>;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 bg-slate-50 min-h-full">
      
      {/* --- Header --- */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1">
            ← Back to Ledger
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Account Details</h1>
        </div>
        
        <button 
          onClick={handleSaveAdjustments}
          disabled={isSaving || !!signatures.approver}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium py-2 px-6 rounded-lg transition-colors shadow-sm flex items-center gap-2"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isSaving ? 'Saving...' : 'Save Adjustments'}
        </button>
      </div>

      {/* --- Top Form Fields --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Entity</label>
            <input type="text" value={accountData ? `${accountData.entityCode} - ${accountData.entity?.name}` : "Unknown Entity"} disabled className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-700 outline-none cursor-not-allowed" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">GL Number</label>
              <input type="text" value={glId} disabled className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 font-mono font-medium text-slate-900 outline-none cursor-not-allowed" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex justify-between">
                <span>GL Amount</span>
                <span className="text-blue-600">(All-Time)</span>
              </label>
              <input type="text" value={`$${currentPeriodTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} disabled className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 font-mono font-medium text-slate-900 outline-none cursor-not-allowed" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">GL Description</label>
            <input type="text" value={accountData?.description || "Unknown Description"} disabled className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-700 outline-none cursor-not-allowed" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Current Period</label>
              <input type="text" value={formatPeriod(currentPeriodId)} disabled className="w-full border border-slate-200 rounded-lg p-2.5 bg-blue-50/50 text-blue-800 font-bold outline-none cursor-not-allowed" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Reconciliation Status</label>
              <div className={`w-full border rounded-lg p-2.5 font-bold flex items-center gap-2 ${
                derivedStatus === 'Completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                derivedStatus === 'In Progress' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                {derivedStatus === 'Completed' && <CheckCircle2 size={18} />}
                {derivedStatus === 'In Progress' && <Clock size={18} />}
                {derivedStatus === 'Pending' && <Lock size={18} />}
                {derivedStatus}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- WORKFLOW TRACKER WIDGET --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck size={18} className="text-blue-600" /> Period Sign-Off Workflow
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          
          {/* ASSEMBLY BLOCK */}
          <div className={`p-6 flex flex-col items-center text-center transition-colors ${signatures.assembler ? 'bg-emerald-50/30' : ''}`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${signatures.assembler ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><UserCheck size={24} /></div>
            <h3 className="font-bold text-slate-900 mb-1">1. Assembly</h3>
            {signatures.assembler ? (
              <div className="text-sm text-slate-600 flex flex-col items-center">
                <p className="font-medium text-emerald-700 flex items-center justify-center gap-1.5 mb-0.5"><CheckCircle2 size={14}/> Signed off</p>
                <p className="font-bold">{signatures.assembler.name}</p>
                <p className="text-xs text-slate-400 mt-1 mb-2">{signatures.assembler.date}</p>
                {!signatures.reviewer && canAssemble && (
                  <button onClick={() => handleUnsign('assembler')} disabled={isSaving} className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors">Undo Sign-Off</button>
                )}
              </div>
            ) : (
              <div className="mt-2 w-full">
                {canAssemble ? (
                  <div className="flex flex-col gap-1.5">
                    <button 
                      onClick={() => handleSignOff('assembler')} 
                      disabled={isSaving || !isClearedNetZero} 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? 'Signing...' : 'Sign Off as Assembler'}
                    </button>
                    {!isClearedNetZero && (
                      <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider text-center bg-rose-50 py-1 rounded border border-rose-100">
                        Cleared Items Must Net to $0.00
                      </span>
                    )}
                  </div>
                ) : <p className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-100 py-2 rounded-lg">Awaiting Assembler</p>}
              </div>
            )}
          </div>

          {/* REVIEW BLOCK */}
          <div className={`p-6 flex flex-col items-center text-center transition-colors ${signatures.reviewer ? 'bg-emerald-50/30' : ''}`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${signatures.reviewer ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><UserCheck size={24} /></div>
            <h3 className="font-bold text-slate-900 mb-1">2. Review</h3>
            {signatures.reviewer ? (
              <div className="text-sm text-slate-600 flex flex-col items-center">
                <p className="font-medium text-emerald-700 flex items-center justify-center gap-1.5 mb-0.5"><CheckCircle2 size={14}/> Signed off</p>
                <p className="font-bold">{signatures.reviewer.name}</p>
                <p className="text-xs text-slate-400 mt-1 mb-2">{signatures.reviewer.date}</p>
                {!signatures.approver && canReview && (
                  <button onClick={() => handleUnsign('reviewer')} disabled={isSaving} className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors">Undo Sign-Off</button>
                )}
              </div>
            ) : (
              <div className="mt-2 w-full">
                {!signatures.assembler ? <p className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border border-slate-100 py-2 rounded-lg">Locked</p> : canReview ? (
                  <div className="flex gap-2 w-full">
                    <button onClick={() => handleSignOff('reviewer')} disabled={isSaving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50">{isSaving ? 'Signing...' : 'Sign Off'}</button>
                    <button onClick={() => handleReject('reviewer')} className="bg-rose-100 hover:bg-rose-200 text-rose-700 text-sm font-medium px-3 py-2 rounded-lg shadow-sm"><XCircle size={18} /></button>
                  </div>
                ) : <p className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-100 py-2 rounded-lg">Awaiting Reviewer</p>}
              </div>
            )}
          </div>

          {/* APPROVAL BLOCK */}
          <div className={`p-6 flex flex-col items-center text-center transition-colors ${signatures.approver ? 'bg-emerald-50/30' : ''}`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${signatures.approver ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><ShieldCheck size={24} /></div>
            <h3 className="font-bold text-slate-900 mb-1">3. Final Approval</h3>
            {signatures.approver ? (
              <div className="text-sm text-slate-600 flex flex-col items-center">
                <p className="font-medium text-emerald-700 flex items-center justify-center gap-1.5 mb-0.5"><CheckCircle2 size={14}/> Account Locked</p>
                <p className="font-bold">{signatures.approver.name}</p>
                <p className="text-xs text-slate-400 mt-1 mb-2">{signatures.approver.date}</p>
                {canApprove && (
                   <button onClick={() => handleUnsign('approver')} disabled={isSaving} className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors">Unlock Account</button>
                )}
              </div>
            ) : (
              <div className="mt-2 w-full">
                {!signatures.reviewer ? <p className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border border-slate-100 py-2 rounded-lg">Locked</p> : canApprove ? (
                  <div className="flex gap-2 w-full">
                    <button onClick={() => handleSignOff('approver')} disabled={isSaving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50">{isSaving ? 'Signing...' : 'Authorize'}</button>
                    <button onClick={() => handleReject('approver')} className="bg-rose-100 hover:bg-rose-200 text-rose-700 text-sm font-medium px-3 py-2 rounded-lg shadow-sm"><XCircle size={18} /></button>
                  </div>
                ) : <p className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-100 py-2 rounded-lg">Awaiting Approver</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- SECTION 1: EXPANDABLE CURRENT PERIOD --- */}
      <div className="border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-blue-50">
        
        {/* Current Period Accordion Header */}
        <button 
          onClick={() => setIsCurrentPeriodExpanded(!isCurrentPeriodExpanded)}
          className="w-full flex items-center justify-between p-4 bg-blue-50/30 hover:bg-blue-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {isCurrentPeriodExpanded ? <ChevronDown size={20} className="text-blue-600" /> : <ChevronRight size={20} className="text-blue-600" />}
            <div className="text-left">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Current Period Activity
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase tracking-wider font-bold border border-blue-200">Live DB Sync</span>
              </h2>
              <p className="text-sm text-slate-500 font-medium">{formatPeriod(currentPeriodId)}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">2026 YTD Activity</span>
            <span className="text-lg font-bold text-blue-600">${ytdTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </button>

        {/* Current Period Table Body */}
        {isCurrentPeriodExpanded && (
          <div className="border-t border-blue-100 flex flex-col relative">
            
            {/* BULK BANNER */}
            {selectedRowIds.length > 0 && !signatures.approver && (
              <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between shadow-md transition-all z-10 w-full">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-white/20 px-2 py-0.5 rounded text-sm font-bold">{selectedRowIds.length}</span>
                    <span className="text-sm font-medium">selected</span>
                  </div>
                  <div className="h-4 w-px bg-blue-400"></div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    Net Total: 
                    <span className={`font-mono font-bold px-2 py-0.5 rounded tracking-wide ${isNetZero ? 'bg-emerald-500 text-white' : 'bg-blue-800 text-blue-100'}`}>
                      ${Math.abs(selectedNetTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    {isNetZero && <span className="text-[10px] bg-emerald-500 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">Perfect Match</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedRowIds([])} className="text-sm text-blue-100 hover:text-white mr-2">Cancel</button>
                  {allSelectedAreCleared ? (
                    <button onClick={() => handleToggleCleared(false)} className="bg-amber-500 hover:bg-amber-400 text-white px-4 py-1.5 rounded-md text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
                      <MinusSquare size={16} /> Un-clear
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleToggleCleared(true)} 
                      disabled={!isNetZero || isSaving}
                      title={!isNetZero ? "Selected items must net to $0.00 to clear" : ""}
                      className={`px-4 py-1.5 rounded-md text-sm font-bold shadow-sm transition-colors flex items-center gap-2 ${!isNetZero ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-70' : 'bg-emerald-500 hover:bg-emerald-400 text-white'} ${isSaving ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      <CheckSquare size={16} /> {isSaving ? 'Saving...' : 'Mark Cleared'}
                    </button>
                  )}
                  {fileToShare && (
                    <button onClick={handleShareExistingFile} disabled={isSaving} className="bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50">
                      <Paperclip size={16} /> Apply {fileToShare} to All Selected
                    </button>
                  )}
                  <label className={`cursor-pointer bg-white text-blue-700 hover:bg-blue-50 px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 shadow-sm transition-colors ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}>
                    <UploadCloud size={16} />
                    {fileToShare ? 'Upload New for All Selected' : 'Attach Backup to All Selected'}
                    <input type="file" className="hidden" onChange={handleBulkUpload} disabled={isSaving} />
                  </label>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className={`w-full text-sm text-left transition-all duration-300 ${showSubs ? 'min-w-[2000px]' : 'min-w-[1000px]'}`}>
                <thead className="text-xs text-slate-500 uppercase font-semibold border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="p-4 w-12 text-center sticky left-0 bg-slate-50 z-20 border-r border-slate-200">
                      <input type="checkbox" onChange={handleSelectAll} checked={selectedRowIds.length === currentRows.length && currentRows.length > 0} disabled={!!signatures.approver} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer disabled:opacity-50" />
                    </th>
                    <th className="p-4 w-32 sticky left-12 bg-slate-50 z-20 border-r border-slate-200">Date</th>
                    <th className="p-4 w-40 text-amber-700">Reference</th>
                    <th className="p-4 w-64 text-emerald-700">Description</th>
                    <th className="p-4 w-32 text-right">Amount</th>
                    
                    {showSubs ? (
                      <>
                        <th className="p-4 w-32 bg-blue-50/50 border-l border-blue-200 text-blue-800 font-bold"><button onClick={() => setShowSubs(false)} className="flex items-center gap-1.5 hover:text-blue-600 w-full"><MinusSquare size={16} /> Sub 1</button></th>
                        {Array.from({ length: 9 }).map((_, i) => <th key={i} className="p-4 w-32 bg-blue-50/50 text-blue-800">Sub {i + 2}</th>)}
                      </>
                    ) : (
                      <th className="p-4 w-16 border-l border-slate-200 text-center bg-slate-50"><button onClick={() => setShowSubs(true)} className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-1 rounded"><PlusSquare size={18} /></button></th>
                    )}
                    
                    <th className="p-4 w-64 border-l border-slate-200">Support Attachment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentRows.length === 0 && (
                    <tr><td colSpan={17} className="p-8 text-center text-slate-500 italic">No transactions found for {formatPeriod(currentPeriodId)}. Upload a CSV to populate.</td></tr>
                  )}
                  {sortedRows.map((row) => {
                    const isSelected = selectedRowIds.includes(row.id);
                    const isCleared = row.cleared; 
                    const isNegative = row.amount < 0;
                    const allSubs = [row.sub1Value, row.sub2Value, row.sub3Value, row.sub4Value, row.sub5Value, row.sub6Value, row.sub7Value, row.sub8Value, row.sub9Value, row.sub10Value].filter(Boolean);

                    return (
                      <tr key={row.id} className={`transition-colors ${isSelected ? 'bg-blue-50/50' : isCleared ? 'bg-slate-50/60 opacity-70' : 'hover:bg-slate-50/50'}`}>
                        <td className={`p-4 text-center sticky left-0 z-10 border-r border-slate-200 ${isSelected ? 'bg-blue-50' : isCleared ? 'bg-slate-50' : 'bg-white'}`}>
                          <input type="checkbox" disabled={!!signatures.approver} checked={isSelected} onChange={() => handleSelectRow(row.id)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer disabled:opacity-50" />
                        </td>
                        
                        <td className={`p-4 sticky left-12 z-10 border-r border-slate-200 ${isSelected ? 'bg-blue-50' : isCleared ? 'bg-slate-50' : 'bg-white'}`}>
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-xs text-slate-700">{row.txnDate}</span>
                            {isCleared && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 uppercase tracking-wider px-1.5 py-0.5 rounded w-fit border border-emerald-200 flex items-center gap-1"><CheckCircle2 size={10}/> Cleared</span>}
                          </div>
                        </td>

                        <td className="p-4"><span className={`font-mono text-xs block truncate max-w-[140px] ${isCleared ? 'text-slate-500' : 'text-slate-700'}`}>{row.reference}</span></td>
                        <td className="p-4"><span className={`text-xs block truncate max-w-[240px] ${isCleared ? 'text-slate-500' : 'text-slate-700'}`}>{row.description}</span></td>
                        <td className={`p-4 text-right font-mono font-medium ${isNegative ? (isCleared ? 'text-slate-600' : 'text-slate-900') : (isCleared ? 'text-emerald-600' : 'text-emerald-700')}`}>
                          {isNegative ? `-$${Math.abs(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `$${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        </td>
                        
                        {showSubs ? (
                          Array.from({ length: 10 }).map((_, i) => {
                            const subVal = row[`sub${i + 1}Value` as keyof typeof row] as string;
                            return <td key={i} className={`p-4 ${i === 0 ? 'border-l border-blue-200 bg-blue-50/10' : 'bg-blue-50/10'}`}>{subVal ? <span className="font-mono text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 uppercase">{subVal}</span> : <span className="text-slate-300">-</span>}</td>
                          })
                        ) : (
                          <td className="p-4 border-l border-slate-200 text-center">
                            {allSubs.length > 0 ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 ring-1 ring-blue-200 cursor-help" title={`Mapped: ${allSubs.join(', ')}`}>{allSubs.length}</span> : <span className="text-slate-300">-</span>}
                          </td>
                        )}

                        <td className="p-4 border-l border-slate-200">
                          {row.file ? (
                            <div className={`flex items-center gap-2 text-sm p-2 rounded-md border ${isCleared ? 'text-slate-600 bg-slate-100 border-slate-200' : 'text-blue-600 bg-blue-50 border-blue-100'}`}>
                              <Paperclip size={14} className="shrink-0" />
                              <button onClick={() => handleViewFile(row.file)} className="truncate font-medium hover:underline hover:text-blue-800 text-left" title="Click to view attachment">{row.file}</button>
                              {!signatures.approver && !isCleared && (
                                <button 
                                  disabled={isSaving}
                                  onClick={async () => {
                                    setIsSaving(true);
                                    setCurrentRows(prev => prev.map(r => r.id === row.id ? { ...r, file: null } : r));
                                    try { await saveAdjustments([{ id: row.id, file: null }]); } catch(e) {}
                                    setIsSaving(false);
                                  }} 
                                  className="text-blue-400 hover:text-blue-700 ml-auto p-0.5 disabled:opacity-50" title="Remove attachment"
                                >
                                  <XCircle size={14} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2 w-full">
                              {signatures.assembler && !isCleared && <span className="text-xs font-bold text-rose-600 flex items-center gap-1 bg-rose-50 px-2 py-1 rounded border border-rose-200 w-fit"><AlertCircle size={14} /> Missing Backup</span>}
                              {signatures.approver || isCleared ? (
                                <span className="text-xs text-slate-400 italic flex items-center gap-1"><Lock size={12}/> Locked</span>
                              ) : (
                                <input type="file" disabled={isSaving} onChange={(e) => handleSingleUpload(row.id, e)} className="text-xs w-full file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer transition-colors disabled:opacity-50" />
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* --- SECTION 2: HISTORICAL ACCORDION --- */}
      <div className="pt-4 border-t border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Historical Activity (Closed Periods)</h2>
        
        {historicalData.length === 0 ? (
          <div className="text-sm text-slate-500 italic p-4 bg-slate-100 rounded-lg">No historical closed periods found.</div>
        ) : (
          <div className="space-y-3">
            {historicalData.map((hist) => {
              const isExpanded = expandedHistory.includes(hist.periodId);
              const histTotal = hist.transactions.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
              
              return (
                <div key={hist.periodId} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <button 
                    onClick={() => toggleHistoryAccordion(hist.periodId)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
                      <span className="font-bold text-slate-800">{formatPeriod(hist.periodId)}</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"><CheckCircle2 size={12}/> Closed</span>
                    </div>
                    <span className="font-mono font-bold text-slate-700">
                       ${histTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200 overflow-x-auto p-4 bg-white">
                      <div className="flex gap-4 mb-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div><strong className="text-slate-700">Assembled By:</strong> {hist.recon?.assembler?.name || 'Unknown'}</div>
                        <div><strong className="text-slate-700">Reviewed By:</strong> {hist.recon?.reviewer?.name || 'Unknown'}</div>
                        <div><strong className="text-slate-700">Approved By:</strong> {hist.recon?.approver?.name || 'Unknown'}</div>
                      </div>

                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase font-semibold border-b border-slate-200 bg-slate-50">
                          <tr>
                            <th className="p-3 w-32 border-r border-slate-200">Date</th>
                            <th className="p-3 w-40 text-amber-700">Reference</th>
                            <th className="p-3 w-64 text-emerald-700">Description</th>
                            <th className="p-3 w-32 text-right">Amount</th>
                            <th className="p-3 w-64 border-l border-slate-200">Support Attachment</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {hist.transactions.map((row: any) => (
                            <tr key={row.id} className="hover:bg-slate-50/50">
                              <td className="p-3 border-r border-slate-200 font-mono text-xs text-slate-500">{row.txnDate}</td>
                              <td className="p-3 font-mono text-xs text-slate-500">{row.reference}</td>
                              <td className="p-3 text-xs text-slate-500">{row.description}</td>
                              <td className="p-3 text-right font-mono font-medium text-slate-500">
                                {row.amount < 0 ? `-$${Math.abs(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `$${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                              </td>
                              <td className="p-3 border-l border-slate-200">
                                {row.file ? (
                                  <div className="flex items-center gap-2 text-sm p-1.5 rounded border text-slate-500 bg-slate-50 border-slate-200 w-fit">
                                    <Paperclip size={14} className="shrink-0" />
                                    <button onClick={() => handleViewFile(row.file)} className="truncate hover:underline" title="Click to view attachment">{row.file}</button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">No Support Attached</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  );
}