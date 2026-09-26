"use client";

import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { UploadCloud, FileText, CheckCircle2, X, Loader2, Lock, AlertTriangle } from "lucide-react";
import { getMe } from "@/app/actions/auth";
import { importLedger } from "@/app/actions/import";
import { ErrorBanner, handleAuthLoss } from "@/components/ui";

const MAX_BYTES = 5 * 1024 * 1024;
const COLUMNS = [
  ["Entity code", "6 characters, e.g. ABC001 - must be assigned to you"],
  ["Period", "YYYYMM, e.g. 202604 - cannot be a closed period"],
  ["Transaction date", "YYYYMMDD, a real calendar date"],
  ["Reference", "Invoice, wire or journal id (optional)"],
  ["Description", "Detail of the line (optional)"],
  ["GL number", "12 digits, must belong to the entity"],
  ["Amount", "e.g. 1234.56, -1,234.56 or (1,234.56)"],
  ["Sub-accounts 1-10", "Optional dimension values"],
];

type Outcome = { imported: number; duplicates: number[]; errors: { row: number; message: string }[]; errorCount: number; headerSkipped: boolean; rejected: boolean };

export default function ImportPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMe().then((res) => {
      const u = res.ok ? res.data : null;
      setAllowed(Boolean(u && !u.isReadOnly && (u.role === "ASSEMBLER" || u.role === "ADMIN" || u.role === "SUPER_ADMIN")));
    });
  }, []);

  const reset = () => { setFile(null); setRows([]); setError(null); setOutcome(null); if (input.current) input.current.value = ""; };

  const take = (f: File) => {
    reset();
    if (!f.name.toLowerCase().endsWith(".csv")) { setError("Upload a .csv file."); return; }
    if (f.size > MAX_BYTES) { setError("The file is larger than 5 MB. Split it into smaller files."); return; }
    setFile(f);
    Papa.parse<string[]>(f, {
      skipEmptyLines: "greedy",
      complete: (r) => {
        if (r.errors.length) { setError(`The CSV could not be read: ${r.errors[0].message} (row ${(r.errors[0].row ?? 0) + 1}).`); setFile(null); return; }
        if (!r.data.length) { setError("The file is empty."); setFile(null); return; }
        setRows(r.data.map((row) => row.map((c) => String(c ?? ""))));
      },
      error: (e) => { setError(`The CSV could not be read: ${e.message}`); setFile(null); },
    });
  };

  const submit = async () => {
    if (!file || !rows.length) return;
    setBusy(true); setError(null);
    const res = await importLedger(rows, file.name);
    setBusy(false);
    if (!res.ok) { if (!handleAuthLoss(res)) setError(res.error); return; }
    setOutcome(res.data);
  };

  if (allowed === null) return <div className="p-8 flex items-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Loading…</div>;
  if (!allowed) return (
    <div className="p-8 max-w-2xl">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex gap-3 text-slate-600"><Lock className="text-slate-400 shrink-0" /> Importing activity is limited to Assemblers and Admins with write access.</div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-[1500px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import GL Activity</h1>
        <p className="text-sm text-slate-500 mt-1">Every row is validated before anything is saved. If any row fails, nothing is imported and each problem is listed.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
          <h2 className="text-base font-semibold text-slate-800 mb-1 flex items-center gap-2"><FileText size={18} className="text-blue-600" /> CSV format</h2>
          <p className="text-sm text-slate-500 mb-4">7 to 17 columns in this order. A header row is optional and detected automatically.</p>
          <ol className="space-y-2">
            {COLUMNS.map(([name, help], i) => (
              <li key={name} className="flex gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <span className="w-6 h-6 rounded bg-white border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center shrink-0">{i < 7 ? i + 1 : "8+"}</span>
                <span><span className="block text-sm font-bold text-slate-900">{name}</span><span className="block text-xs text-slate-500">{help}</span></span>
              </li>
            ))}
          </ol>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <ErrorBanner message={error} onClose={() => setError(null)} />

          {!file && (
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) take(f); }}
              onClick={() => input.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-xl p-12 text-center transition-colors ${drag ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white hover:border-blue-400"}`}>
              <UploadCloud size={40} className="mx-auto text-blue-500 mb-3" />
              <p className="font-semibold text-slate-800">Drop a CSV here, or click to choose</p>
              <p className="text-sm text-slate-500 mt-1">Up to 5 MB and 5,000 rows</p>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f); }} />
            </div>
          )}

          {file && !outcome && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div><p className="font-semibold text-slate-800">{file.name}</p><p className="text-xs text-slate-500">{rows.length.toLocaleString()} rows read</p></div>
                <button onClick={reset} className="text-slate-400 hover:text-slate-700" aria-label="Remove file"><X size={20} /></button>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-xs font-mono">
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i}>{r.slice(0, 7).map((c, j) => <td key={j} className="px-3 py-2 whitespace-nowrap text-slate-700">{c}</td>)}{r.length > 7 && <td className="px-3 py-2 text-slate-400">+{r.length - 7}</td>}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && <p className="px-5 py-2 text-xs text-slate-400 border-t border-slate-100">Showing the first 8 of {rows.length.toLocaleString()} rows.</p>}
              <div className="px-5 py-4 border-t border-slate-200 flex justify-end">
                <button onClick={submit} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-70">
                  {busy ? <><Loader2 size={18} className="animate-spin" /> Validating and importing…</> : "Validate and import"}
                </button>
              </div>
            </div>
          )}

          {outcome && outcome.rejected && (
            <div className="bg-white rounded-xl border border-rose-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 bg-rose-50 border-b border-rose-200 flex items-center gap-3">
                <AlertTriangle className="text-rose-600" />
                <div><p className="font-bold text-rose-900">Nothing was imported</p>
                  <p className="text-sm text-rose-800">{outcome.errorCount.toLocaleString()} row{outcome.errorCount === 1 ? " has a problem" : "s have problems"}. Fix {outcome.errorCount === 1 ? "it" : "them"} and upload the file again.</p></div>
              </div>
              <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto text-sm">
                {outcome.errors.map((e, i) => <li key={i} className="px-5 py-2.5 flex gap-3"><span className="font-mono font-bold text-slate-500 w-16 shrink-0">Row {e.row}</span><span className="text-slate-700">{e.message}</span></li>)}
              </ul>
              {outcome.errorCount > outcome.errors.length && <p className="px-5 py-2 text-xs text-slate-500 border-t">…and {outcome.errorCount - outcome.errors.length} more.</p>}
              <div className="px-5 py-4 border-t border-slate-200"><button onClick={reset} className="text-sm font-semibold text-blue-600">Upload another file</button></div>
            </div>
          )}

          {outcome && !outcome.rejected && (
            <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-600" size={28} /><p className="text-lg font-bold text-slate-900">Import complete</p></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4"><p className="text-xs font-bold uppercase text-emerald-700">Imported</p><p className="text-2xl font-bold text-emerald-800">{outcome.imported.toLocaleString()}</p></div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4"><p className="text-xs font-bold uppercase text-amber-700">Duplicates skipped</p><p className="text-2xl font-bold text-amber-800">{outcome.duplicates.length.toLocaleString()}</p></div>
              </div>
              {outcome.duplicates.length > 0 && (
                <p className="text-sm text-slate-600">Skipped rows already in the ledger (same entity, GL, date, reference and amount): {outcome.duplicates.slice(0, 40).join(", ")}{outcome.duplicates.length > 40 ? "…" : ""}</p>
              )}
              {outcome.headerSkipped && <p className="text-xs text-slate-500">The first row looked like a header and was skipped.</p>}
              <button onClick={reset} className="text-sm font-semibold text-blue-600">Import another file</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
