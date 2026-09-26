"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search, ChevronRight } from "lucide-react";
import { getCloseStatus } from "@/app/actions/ledger";
import { formatPeriod, formatDateTime } from "@/lib/format";
import { ErrorBanner, StageBadge, handleAuthLoss, type Stage } from "@/components/ui";

type Row = {
  entityCode: string; entityName: string; glId: string; description: string; glStatus: string;
  activePeriod: string; lastClosed: string | null; stage: Stage; openItems: number; missingSupport: number;
  assembler: { name: string; at: string | null } | null; reviewer: { name: string; at: string | null } | null;
  lastActivity: string | null;
};

const FILTERS: { key: "ALL" | Stage; label: string }[] = [
  { key: "ALL", label: "All" }, { key: "OPEN", label: "Open" }, { key: "ASSEMBLED", label: "Awaiting review" }, { key: "REVIEWED", label: "Awaiting approval" },
];

export default function StatusPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"ALL" | Stage>("ALL");

  useEffect(() => {
    getCloseStatus().then((res) => {
      if (!res.ok) { if (!handleAuthLoss(res)) setError(res.error); }
      else setRows(res.data);
      setLoading(false);
    });
  }, []);

  const counts = useMemo(() => ({
    OPEN: rows.filter((r) => r.stage === "OPEN").length,
    ASSEMBLED: rows.filter((r) => r.stage === "ASSEMBLED").length,
    REVIEWED: rows.filter((r) => r.stage === "REVIEWED").length,
  }), [rows]);

  const visible = rows.filter((r) =>
    (filter === "ALL" || r.stage === filter) &&
    (!q || `${r.entityCode} ${r.entityName} ${r.glId} ${r.description}`.toLowerCase().includes(q.toLowerCase())));

  if (loading) return <div className="p-8 flex items-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Loading close status…</div>;

  return (
    <div className="p-6 md:p-8 max-w-[1500px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Close Status</h1>
        <p className="text-sm text-slate-500 mt-1">Where every account you can see stands in its current period.</p>
      </div>
      <ErrorBanner message={error} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[["Accounts", rows.length, "text-slate-900"], ["Open", counts.OPEN, "text-slate-700"], ["Awaiting review", counts.ASSEMBLED, "text-amber-600"], ["Awaiting approval", counts.REVIEWED, "text-blue-600"]].map(([l, n, c]) => (
          <div key={l as string} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{l}</p>
            <p className={`text-2xl font-bold mt-1 ${c}`}>{n as number}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="flex gap-1 bg-slate-200/60 p-1 rounded-lg w-fit">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold ${filter === f.key ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{f.label}</button>
          ))}
        </div>
        <label className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entity, GL or description"
            className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-full md:w-80 outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[1000px]">
          <thead className="text-xs text-slate-500 uppercase font-semibold border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="p-4">Entity</th><th className="p-4">GL</th><th className="p-4">Active Period</th><th className="p-4">Status</th>
              <th className="p-4 text-right">Open Items</th><th className="p-4 text-right">No Support</th><th className="p-4">Signed</th><th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500 italic">No accounts match.</td></tr>}
            {visible.map((r) => (
              <tr key={r.glId} className="hover:bg-slate-50/60">
                <td className="p-4"><span className="font-mono font-bold text-slate-800">{r.entityCode}</span><div className="text-xs text-slate-500">{r.entityName}</div></td>
                <td className="p-4"><span className="font-mono font-bold text-slate-800">{r.glId}</span><div className="text-xs text-slate-500">{r.description}</div></td>
                <td className="p-4 font-semibold text-slate-700">{formatPeriod(r.activePeriod, "short")}<div className="text-xs font-normal text-slate-400">Closed through {formatPeriod(r.lastClosed, "short", "never")}</div></td>
                <td className="p-4"><StageBadge stage={r.stage} /></td>
                <td className="p-4 text-right font-mono">{r.openItems}</td>
                <td className={`p-4 text-right font-mono ${r.missingSupport ? "text-rose-600 font-bold" : "text-slate-400"}`}>{r.missingSupport}</td>
                <td className="p-4 text-xs text-slate-600">
                  {r.assembler ? <div>Assembled: <b>{r.assembler.name}</b></div> : <div className="text-slate-400">Not assembled</div>}
                  {r.reviewer && <div>Reviewed: <b>{r.reviewer.name}</b></div>}
                  {r.lastActivity && <div className="text-slate-400">{formatDateTime(r.lastActivity)}</div>}
                </td>
                <td className="p-4"><Link href={`/account/${r.glId}`} className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-800">Open <ChevronRight size={15} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
