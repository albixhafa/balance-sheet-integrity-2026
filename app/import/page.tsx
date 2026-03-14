"use client";

import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, ChevronRight, Loader2, Lock } from 'lucide-react';
import { getLoggedInUser } from '@/app/actions/auth';
import Papa from 'papaparse';
import { processLedgerImport } from '@/app/actions/import';

// --- Types ---
interface ParsedRow {
  entityCode: string;           
  period: string;               
  transactionDate: string;      
  transactionReference: string; 
  description: string;          
  gl: string;                   
  amount: string;               
  subAccounts: (string | null)[]; 
}

export default function ImportPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'success' | 'uploading' | 'error' | 'complete'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importResults, setImportResults] = useState<{ success: number, duplicate: number, error: number } | null>(null);
  
  // --- Auth State ---
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getLoggedInUser().then(data => {
      setUser(data);
      setLoadingUser(false);
    });
  }, []);

  const canImport = user?.role === 'ASSEMBLER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // --- Drag and Drop Handlers ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!canImport) return; 
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (!canImport || !e.dataTransfer.files?.[0]) return; 
    processFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (!canImport || !e.target.files?.[0]) return; 
    processFile(e.target.files[0]);
  };

  // --- LIVE PAPAPARSE LOGIC ---
  const processFile = (uploadedFile: File) => {
    setFile(uploadedFile);
    setStatus('parsing');
    setErrorMessage('');

    if (!uploadedFile.name.endsWith('.csv')) {
      setStatus('error');
      setErrorMessage('Invalid file type. Please upload a .csv file.');
      return;
    }

    Papa.parse(uploadedFile, {
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedRow[] = [];
        let formattingErrors = 0;

        results.data.forEach((row: any) => {
          // We need at least the first 7 columns. Sub accounts can be blank/missing.
          if (Array.isArray(row) && row.length >= 7) {
            const [
              entityCode, period, transactionDate, transactionReference, 
              description, gl, amount, 
              sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8, sub9, sub10
            ] = row;

            // Basic validation to ensure core fields exist
            if (entityCode && period && gl && amount) {
              rows.push({
                entityCode: String(entityCode).trim(),
                period: String(period).trim(),
                transactionDate: String(transactionDate).trim(),
                transactionReference: String(transactionReference || '').trim(),
                description: String(description || '').trim(),
                gl: String(gl).trim(),
                amount: String(amount).trim(),
                subAccounts: [sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8, sub9, sub10]
                  .map(sub => sub && String(sub).trim() !== '' ? String(sub).trim().toUpperCase() : null)
              });
            } else {
              formattingErrors++;
            }
          } else {
            formattingErrors++;
          }
        });

        if (rows.length === 0) {
          setStatus('error');
          setErrorMessage('Could not find any valid rows matching the strict 17-column format.');
          return;
        }

        if (formattingErrors > 0) {
          console.warn(`Skipped ${formattingErrors} malformed rows.`);
        }

        setParsedData(rows);
        setStatus('success');
      },
      error: (err) => {
        setStatus('error');
        setErrorMessage(`CSV Parsing Error: ${err.message}`);
      }
    });
  };

  const clearFile = () => {
    setFile(null);
    setParsedData([]);
    setStatus('idle');
    setErrorMessage('');
    setImportResults(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // --- SEND DATA TO DATABASE ---
  const handleImportSubmit = async () => {
    setStatus('uploading');
    try {
      const results = await processLedgerImport(parsedData);
      setImportResults(results);
      setStatus('complete');
    } catch (error: any) {
      setStatus('error');
      setErrorMessage(error.message || "Failed to communicate with database.");
    }
  };

  if (loadingUser) return <div className="p-8 flex items-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Loading import module...</div>;
  if (!user) return <div className="p-8 text-rose-500 font-semibold bg-rose-50 rounded-lg border border-rose-200">Access Denied.</div>;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 bg-slate-50 min-h-full">
      
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import Activity</h1>
        <p className="text-sm text-slate-500 mt-1 mb-3">Upload flat files to update GL balances and sub-account activity.</p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800">
          <Lock size={16} className="text-blue-600" /> Note: The import function is restricted to Assembly and Admin users.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* --- LEFT COLUMN: Rules --- */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              Required CSV Format
            </h2>
            <p className="text-sm text-slate-600 mb-4">Your upload must be a valid <strong>.csv</strong> file without a header row. Exactly <strong>17 columns</strong> in order.</p>
            
            <ul className="space-y-3">
              <li className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="bg-white border border-slate-200 w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">1</div>
                <div><p className="text-sm font-bold text-slate-900">Entity Code</p><p className="text-xs text-slate-500">Must match database exactly (e.g. ABC001)</p></div>
              </li>
              <li className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="bg-white border border-slate-200 w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">2</div>
                <div><p className="text-sm font-bold text-slate-900">Period</p><p className="text-xs text-slate-500">6-digit date format (YYYYMM)</p></div>
              </li>
              <li className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="bg-white border border-slate-200 w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">3</div>
                <div><p className="text-sm font-bold text-slate-900">Transaction Date</p><p className="text-xs text-slate-500">8-digit date format (YYYYMMDD)</p></div>
              </li>
              <li className="flex items-start gap-3 p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                <div className="bg-white border border-amber-200 w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-amber-600 shrink-0">4</div>
                <div><p className="text-sm font-bold text-slate-900">Transaction Ref</p><p className="text-xs text-slate-500 text-amber-800 mt-1">Invoice, wire, or journal ID.</p></div>
              </li>
              <li className="flex items-start gap-3 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                <div className="bg-white border border-emerald-200 w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-emerald-600 shrink-0">5</div>
                <div><p className="text-sm font-bold text-slate-900">Description</p><p className="text-xs text-slate-500 text-emerald-800 mt-1">Detail of the line item.</p></div>
              </li>
              <li className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="bg-white border border-slate-200 w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">6</div>
                <div><p className="text-sm font-bold text-slate-900">GL Number</p><p className="text-xs text-slate-500">Must exist in database.</p></div>
              </li>
              <li className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="bg-white border border-slate-200 w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">7</div>
                <div><p className="text-sm font-bold text-slate-900">Amount</p><p className="text-xs text-slate-500 text-blue-800 mt-1">Numbers only. Supports negative values.</p></div>
              </li>
              <li className="flex items-start gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                <div className="bg-white border border-blue-200 w-8 h-6 rounded flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">8-17</div>
                <div><p className="text-sm font-bold text-slate-900">Sub Accounts (1-10)</p><p className="text-xs text-slate-500 text-blue-800 mt-1">Max 10 chars. Leave blank for null.</p></div>
              </li>
            </ul>
          </div>
        </div>

        {/* --- RIGHT COLUMN: Dropzone & Output --- */}
        <div className="lg:col-span-2 space-y-6">
          
          {status === 'idle' && (
            <div 
              className={`border-2 rounded-xl transition-all duration-200 ease-in-out flex flex-col items-center justify-center p-12 text-center min-h-[300px]
                ${!canImport ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' : dragActive ? 'border-blue-500 bg-blue-50 scale-[1.01] border-dashed' : 'bg-white border-slate-300 hover:border-slate-400 hover:bg-slate-50 border-dashed'}`}
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            >
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${canImport ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400'}`}>
                <UploadCloud size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">{canImport ? 'Drag and drop your CSV here' : 'Import restricted to Assembly users'}</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-sm">Ensure your file follows the strict format and contains no headers.</p>
              
              <input ref={inputRef} type="file" accept=".csv" onChange={handleChange} className="hidden" id="file-upload" disabled={!canImport}/>
              <label htmlFor="file-upload" className={`${canImport ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-70'} bg-white border border-slate-300 text-slate-700 font-medium py-2.5 px-6 rounded-lg transition-colors shadow-sm text-sm`}>Browse Files</label>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-rose-50 border border-rose-200 p-6 rounded-xl flex items-start gap-4">
              <AlertCircle size={24} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-base font-bold text-rose-900">Import Failed</h3>
                <p className="text-sm text-rose-700 mt-1">{errorMessage}</p>
              </div>
              <button onClick={clearFile} className="text-rose-500 hover:text-rose-700 p-1"><X size={20} /></button>
            </div>
          )}

          {status === 'parsing' && (
            <div className="bg-white border border-slate-200 p-12 rounded-xl flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
              <h3 className="text-base font-bold text-slate-900">Reading CSV...</h3>
              <p className="text-sm text-slate-500">Validating strict 17-column layout across all rows.</p>
            </div>
          )}

          {status === 'uploading' && (
            <div className="bg-white border border-slate-200 p-12 rounded-xl flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
              <h3 className="text-base font-bold text-slate-900">Writing to Database...</h3>
              <p className="text-sm text-slate-500">Bypassing duplicate records and inserting {parsedData.length} rows.</p>
            </div>
          )}

          {status === 'complete' && importResults && (
            <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4"><CheckCircle2 size={32} /></div>
              <h2 className="text-xl font-bold text-emerald-900 mb-2">Import Successful</h2>
              
              <div className="flex gap-4 mt-4">
                <div className="bg-white px-6 py-3 rounded-lg border border-emerald-100 shadow-sm">
                  <div className="text-2xl font-black text-emerald-600">{importResults.success}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase">Inserted</div>
                </div>
                <div className="bg-white px-6 py-3 rounded-lg border border-amber-100 shadow-sm">
                  <div className="text-2xl font-black text-amber-500">{importResults.duplicate}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase">Duplicates Skipped</div>
                </div>
                <div className="bg-white px-6 py-3 rounded-lg border border-rose-100 shadow-sm">
                  <div className="text-2xl font-black text-rose-500">{importResults.error}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase">Errors</div>
                </div>
              </div>

              <button onClick={clearFile} className="mt-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-8 rounded-lg shadow-sm transition-colors">Import Another File</button>
            </div>
          )}

          {status === 'success' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-emerald-500" />
                  <div>
                    <h2 className="text-base font-bold text-slate-900">File Validated Successfully</h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{file?.name} • {parsedData.length} Valid Rows</p>
                  </div>
                </div>
                <button onClick={clearFile} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-200 transition-colors">Cancel File</button>
              </div>

              <div className="p-6">
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[1000px]">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Entity / GL</th>
                        <th className="px-4 py-3 font-semibold">Period / Date</th>
                        <th className="px-4 py-3 font-semibold text-amber-700">Txn Ref</th>
                        <th className="px-4 py-3 font-semibold text-emerald-700 w-1/4">Description</th>
                        <th className="px-4 py-3 font-semibold text-right">Amount</th>
                        <th className="px-4 py-3 font-semibold">Sub Accounts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedData.slice(0, 100).map((row, index) => { // Render preview limit for performance
                        const activeSubs = row.subAccounts.filter(sub => sub !== null);
                        const isNegative = row.amount.startsWith('-');
                        return (
                          <tr key={index} className="hover:bg-slate-50/50">
                            <td className="px-4 py-4 align-top">
                              <span className="font-bold text-slate-900 block">{row.entityCode}</span>
                              <span className="text-slate-500 font-mono text-xs">{row.gl}</span>
                            </td>
                            <td className="px-4 py-4 text-slate-600 font-mono text-xs align-top">
                              {row.period}<br/><span className="text-slate-400">{row.transactionDate}</span>
                            </td>
                            <td className="px-4 py-4 text-slate-700 font-mono text-xs align-top truncate max-w-[150px]">{row.transactionReference}</td>
                            <td className="px-4 py-4 text-slate-600 text-xs align-top truncate max-w-[200px]">{row.description}</td>
                            <td className={`px-4 py-4 font-mono font-medium text-right align-top ${isNegative ? 'text-slate-900' : 'text-emerald-700'}`}>
                              {isNegative ? `-$${row.amount.substring(1)}` : `$${row.amount}`}
                            </td>
                            <td className="px-4 py-4 align-top">
                              {activeSubs.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                                  {activeSubs.map((sub, i) => <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">{sub}</span>)}
                                </div>
                              ) : <span className="text-slate-300 italic text-xs">None</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {parsedData.length > 100 && (
                    <div className="p-3 text-center text-xs font-semibold text-slate-500 bg-slate-50 border-t border-slate-200">Showing first 100 rows of {parsedData.length}</div>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <button onClick={handleImportSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-8 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    Commit to Ledger <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}