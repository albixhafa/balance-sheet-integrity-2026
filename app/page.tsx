"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, ChevronRight, Activity } from "lucide-react";
import { getMyEntities, getEntityBalances } from "@/app/actions/ledger";
import { formatPeriod, formatCents } from "@/lib/format";
import { ErrorBanner, StageBadge, handleAuthLoss, type Stage } from "@/components/ui";

type Entity = { code: string; name: string; status: string };
type Row = { glId: string; description: string; status: string; lastClosed: string | null; activePeriod: string; balanceCents: number; openItems: number; stage: Stage };

const ENTITY_KEY = "bsi.entity";

export default function Dashboard() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyEntities().then((res) => {
      if (!res.ok) { if (!handleAuthLoss(res)) setError(res.error); setLoading(false); return; }
      setEntities(res.data);
      let remembered: string | null = null;
      try { remembered = localStorage.getItem(ENTITY_KEY); } catch { /* ignore */ }
      const pick = res.data.find((e) => e.code === remembered)?.code ?? res.data[0]?.code ?? "";
      setSelected(pick);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    try { localStorage.setItem(ENTITY_KEY, selected); } catch { /* ignore */ }
    let stale = false;
    setRunning(true); setError(null);
    getEntityBalances(selected).then((res) => {
      if (stale) return; // a later selection already won
      if (!res.ok) { if (!handleAuthLoss(res)) setError(res.error); setRows([]); }
      else setRows(res.data);
      setRunning(false);
    });
    return () => { stale = true; };
  }, [selected]);

  if (loading) return <div className="flex h-full items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-3" size={22} /> Loading…</div>;

  const entity = entities.find((e) => e.code === selected);

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Account Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-1">Review and reconcile general ledger balances for your entities.</p>
        </div>
        {entities.length > 0 && (
          <div className="flex items-center gap-3">
            {running && <span className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> Updating</span>}
            <label className="bg-white border border-slate-200 shadow-sm rounded-lg flex items-center p-1 pl-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Entity</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}
                className="bg-slate-50 rounded-md py-1.5 px-3 text-sm font-bold text-slate-800 outline-none cursor-pointer min-w-[220px]">
                {entities.map((e) => <option key={e.code} value={e.code}>{e.code} - {e.name}{e.status !== "ACTIVE" ? " (inactive)" : ""}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      <ErrorBanner message={error} />

      {entities.length === 0 && !error && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-600 font-medium">You have no entities assigned yet.</p>
          <p className="text-sm text-slate-400 mt-1">Ask an administrator to give you access to one.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-opacity ${running ? "opacity-60" : ""}`}>
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{selected} - {entity?.name}</h2>
            <span className="bg-slate-200 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">{rows.length} accounts</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[900px]">
              <thead className="text-xs text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-4 w-40">GL Number</th>
                  <th className="p-4">Description</th>
                  <th className="p-4 w-44 text-center">Last Closed</th>
                  <th className="p-4 w-40 text-center">Active Period</th>
                  <th className="p-4 w-36 text-center">Status</th>
                  <th className="p-4 w-44 text-right">Period Balance</th>
                  <th className="p-4 w-32 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.glId} className="hover:bg-slate-50/60">
                    <td className="p-4 font-mono font-bold text-slate-800">{r.glId}</td>
                    <td className="p-4 text-slate-600 font-medium">
                      {r.description}
                      {r.status !== "ACTIVE" && <span className="ml-2 text-[10px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">Inactive</span>}
                    </td>
                    <td className="p-4 text-center">
                      {r.lastClosed
                        ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"><CheckCircle2 size={13} /> {formatPeriod(r.lastClosed, "short")}</span>
                        : <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Never closed</span>}
                    </td>
                    <td className="p-4 text-center"><span className="font-mono text-xs font-bold text-blue-800 inline-flex items-center gap-1.5"><Activity size={13} className="text-blue-500" /> {formatPeriod(r.activePeriod, "short")}</span></td>
                    <td className="p-4 text-center"><StageBadge stage={r.stage} /></td>
                    <td className="p-4 text-right font-mono font-bold text-slate-900">
                      {formatCents(r.balanceCents)}
                      <div className="text-[11px] font-sans font-medium text-slate-400">{r.openItems} open item{r.openItems === 1 ? "" : "s"}</div>
                    </td>
                    <td className="p-4 text-center">
                      <Link href={`/account/${r.glId}`} className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-4 py-1.5 rounded-lg">
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

      {!running && selected && rows.length === 0 && !error && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-600 font-medium">No GL accounts in {selected} yet.</p>
          <p className="text-sm text-slate-400 mt-1">An administrator adds them under Administration → Entities & GLs.</p>
        </div>
      )}
    </div>
  );
}
