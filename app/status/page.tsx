"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";
import { getCloseStatus } from "@/app/actions/ledger";
import { formatPeriod, formatDateTime } from "@/lib/format";
import {
  Page, PageHeader, Card, PageLoading, Segmented, StageBadge, ErrorBanner, handleAuthLoss,
  inputCls, th, td, theadCls, tbodyCls, cx, STAGE_DOT, STAGE_LABEL, type Stage,
} from "@/components/ui";

type Row = {
  entityCode: string; entityName: string; glId: string; description: string; glStatus: string;
  activePeriod: string; lastClosed: string | null; stage: Stage; openItems: number; missingSupport: number;
  assembler: { name: string; at: string | null } | null; reviewer: { name: string; at: string | null } | null;
  lastActivity: string | null;
};
type Filter = "ALL" | Stage;

export default function StatusPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

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

  if (loading) return <PageLoading label="Loading close status" />;

  const total = rows.length || 1;
  const segments: Stage[] = ["REVIEWED", "ASSEMBLED", "OPEN"];

  return (
    <Page>
      <PageHeader title="Close status" description="Where every account you can see stands in its current period." />
      <ErrorBanner message={error} />

      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-stone-900">{rows.length} accounts in progress</p>
          <p className="text-[13px] text-stone-500"><span className="num font-medium text-stone-800">{counts.REVIEWED}</span> ready for final approval</p>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-stone-100">
          {segments.map((s) => counts[s as keyof typeof counts] > 0 && (
            <div key={s} className={STAGE_DOT[s]} style={{ width: `${(counts[s as keyof typeof counts] / total) * 100}%` }} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-stone-600">
          {segments.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={cx("size-2 rounded-full", STAGE_DOT[s])} /> {STAGE_LABEL[s]} <span className="num text-stone-400">{counts[s as keyof typeof counts]}</span></span>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented<Filter> value={filter} onChange={setFilter} options={[
          { value: "ALL", label: "All", count: rows.length },
          { value: "OPEN", label: "Open", count: counts.OPEN },
          { value: "ASSEMBLED", label: "Awaiting review", count: counts.ASSEMBLED },
          { value: "REVIEWED", label: "Awaiting approval", count: counts.REVIEWED },
        ]} />
        <label className="relative w-full md:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entity, GL or description" className={cx(inputCls, "pl-9")} />
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Account</th><th className={th}>Entity</th><th className={th}>Period</th><th className={th}>Status</th>
                <th className={cx(th, "text-right")}>Open items</th><th className={cx(th, "text-right")}>No support</th><th className={th}>Progress</th><th className="w-8" />
              </tr>
            </thead>
            <tbody className={tbodyCls}>
              {visible.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-stone-500">No accounts match.</td></tr>}
              {visible.map((r) => (
                <tr key={r.glId} onClick={() => router.push(`/account/${r.glId}`)} className="group cursor-pointer hover:bg-stone-50">
                  <td className={td}>
                    <Link href={`/account/${r.glId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-stone-900 hover:underline decoration-stone-300 underline-offset-4">{r.description}</Link>
                    <div className="font-mono text-xs text-stone-500">{r.glId}</div>
                  </td>
                  <td className={td}><span className="font-mono text-xs text-stone-700">{r.entityCode}</span><div className="text-xs text-stone-500">{r.entityName}</div></td>
                  <td className={td}><div className="text-stone-800">{formatPeriod(r.activePeriod, "short")}</div><div className="text-xs text-stone-400">Closed through {formatPeriod(r.lastClosed, "short", "never")}</div></td>
                  <td className={td}><StageBadge stage={r.stage} /></td>
                  <td className={cx(td, "num text-right", r.openItems ? "text-stone-800" : "text-stone-400")}>{r.openItems}</td>
                  <td className={cx(td, "num text-right", r.missingSupport ? "font-medium text-rose-700" : "text-stone-400")}>{r.missingSupport}</td>
                  <td className={cx(td, "text-xs text-stone-600")}>
                    {r.assembler ? <div>Assembled by <span className="font-medium text-stone-800">{r.assembler.name}</span></div> : <div className="text-stone-400">Not assembled</div>}
                    {r.reviewer && <div>Reviewed by <span className="font-medium text-stone-800">{r.reviewer.name}</span></div>}
                    {r.lastActivity && <div className="text-stone-400">{formatDateTime(r.lastActivity)}</div>}
                  </td>
                  <td className="pr-3 text-stone-300 group-hover:text-stone-500"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}
