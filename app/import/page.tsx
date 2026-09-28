"use client";

import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { UploadCloud, FileSpreadsheet, CheckCircle2, X, Lock, AlertTriangle } from "lucide-react";
import { getMe } from "@/app/actions/auth";
import { importLedger } from "@/app/actions/import";
import { Page, PageHeader, Card, CardHeader, Button, EmptyState, PageLoading, ErrorBanner, handleAuthLoss, cx } from "@/components/ui";

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

  if (allowed === null) return <PageLoading />;
  if (!allowed) return (
    <Page width="narrow">
      <PageHeader title="Import activity" />
      <Card><EmptyState icon={<Lock size={18} />} title="Importing is limited">Only Assemblers and Admins with write access can import GL activity.</EmptyState></Card>
    </Page>
  );

  return (
    <Page>
      <PageHeader title="Import activity" description="Every row is validated before anything is saved. If any row fails, nothing is imported and each problem is listed." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ErrorBanner message={error} onClose={() => setError(null)} />

          {!file && (
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) take(f); }}
              onClick={() => input.current?.click()}
              className={cx("flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center transition-colors",
                drag ? "border-brand-500 bg-brand-50" : "border-stone-300 bg-white hover:border-stone-400 hover:bg-stone-50/60")}>
              <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-stone-100 text-stone-500"><UploadCloud size={20} /></div>
              <p className="font-medium text-stone-900">Drop a CSV here, or <span className="text-brand-700 underline decoration-brand-200 underline-offset-4">browse</span></p>
              <p className="mt-1 text-sm text-stone-500">Up to 5 MB and 5,000 rows</p>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f); }} />
            </div>
          )}

          {file && !outcome && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-3.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><FileSpreadsheet size={18} /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-stone-900">{file.name}</p><p className="num text-xs text-stone-500">{rows.length.toLocaleString()} rows read</p></div>
                <button onClick={reset} className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Remove file"><X size={18} /></button>
              </div>
              <div className="max-h-72 overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <tbody className="divide-y divide-stone-100">
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td className="num w-10 bg-stone-50 px-3 py-2 text-right text-stone-400">{i + 1}</td>
                        {r.slice(0, 7).map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-2 text-stone-700">{c}</td>)}
                        {r.length > 7 && <td className="px-3 py-2 text-stone-400">+{r.length - 7}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-5 py-3">
                <p className="text-xs text-stone-500">{rows.length > 8 ? `Showing the first 8 of ${rows.length.toLocaleString()} rows.` : " "}</p>
                <Button variant="primary" onClick={submit} loading={busy}>{busy ? "Validating and importing…" : "Validate and import"}</Button>
              </div>
            </Card>
          )}

          {outcome && outcome.rejected && (
            <Card className="overflow-hidden">
              <div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50/60 px-5 py-4">
                <AlertTriangle size={18} className="mt-0.5 text-rose-600" />
                <div><p className="font-medium text-rose-900">Nothing was imported</p>
                  <p className="text-sm text-rose-800">{outcome.errorCount.toLocaleString()} row{outcome.errorCount === 1 ? " has a problem" : "s have problems"}. Fix {outcome.errorCount === 1 ? "it" : "them"} and upload the file again.</p></div>
              </div>
              <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto text-sm">
                {outcome.errors.map((e, i) => <li key={i} className="flex gap-4 px-5 py-2.5"><span className="num w-16 shrink-0 font-mono text-xs text-stone-500">Row {e.row}</span><span className="text-stone-700">{e.message}</span></li>)}
              </ul>
              {outcome.errorCount > outcome.errors.length && <p className="border-t border-stone-100 px-5 py-2 text-xs text-stone-500">…and {outcome.errorCount - outcome.errors.length} more.</p>}
              <div className="border-t border-stone-100 px-5 py-3"><Button onClick={reset}>Upload another file</Button></div>
            </Card>
          )}

          {outcome && !outcome.rejected && (
            <Card className="space-y-5 p-6">
              <div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-600" size={22} /><p className="text-lg font-semibold text-stone-900">Import complete</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-stone-200 px-4 py-3"><p className="text-[13px] text-stone-500">Imported</p><p className="num text-2xl font-semibold text-stone-900">{outcome.imported.toLocaleString()}</p></div>
                <div className="rounded-lg border border-stone-200 px-4 py-3"><p className="text-[13px] text-stone-500">Duplicates skipped</p><p className="num text-2xl font-semibold text-stone-900">{outcome.duplicates.length.toLocaleString()}</p></div>
              </div>
              {outcome.duplicates.length > 0 && (
                <p className="text-sm text-stone-600">Skipped rows already in the ledger (same entity, GL, date, reference and amount): {outcome.duplicates.slice(0, 40).join(", ")}{outcome.duplicates.length > 40 ? "…" : ""}</p>
              )}
              {outcome.headerSkipped && <p className="text-xs text-stone-500">The first row looked like a header and was skipped.</p>}
              <Button onClick={reset}>Import another file</Button>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title="CSV format" description="7 to 17 columns in this order. A header row is optional." />
          <ol className="divide-y divide-stone-100">
            {COLUMNS.map(([name, help], i) => (
              <li key={name} className="flex gap-3 px-5 py-2.5">
                <span className="num mt-0.5 flex h-5 min-w-5 items-center justify-center rounded bg-stone-100 px-1 text-[11px] font-medium text-stone-500">{i < 7 ? i + 1 : "8+"}</span>
                <span><span className="block text-sm font-medium text-stone-900">{name}</span><span className="block text-xs text-stone-500">{help}</span></span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </Page>
  );
}
