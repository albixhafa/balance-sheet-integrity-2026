"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Building2, Search } from "lucide-react";
import { getMyEntities, getEntityBalances } from "@/app/actions/ledger";
import { formatPeriod, formatCents } from "@/lib/format";
import {
  Page, PageHeader, Card, Stat, EmptyState, PageLoading, StageBadge, Badge, ErrorBanner, handleAuthLoss,
  inputCls, th, td, theadCls, tbodyCls, cx, type Stage,
} from "@/components/ui";

type Entity = { code: string; name: string; status: string };
type Row = { glId: string; description: string; status: string; lastClosed: string | null; activePeriod: string; balanceCents: number; openItems: number; stage: Stage };

const ENTITY_KEY = "bsi.entity";

export default function Dashboard() {
  const router = useRouter();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

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

  const stats = useMemo(() => ({
    open: rows.reduce((s, r) => s + r.openItems, 0),
    review: rows.filter((r) => r.stage === "ASSEMBLED").length,
    approval: rows.filter((r) => r.stage === "REVIEWED").length,
    notStarted: rows.filter((r) => r.stage === "OPEN").length,
  }), [rows]);

  const visible = rows.filter((r) => !q || `${r.glId} ${r.description}`.toLowerCase().includes(q.toLowerCase()));

  if (loading) return <PageLoading />;

  const entity = entities.find((e) => e.code === selected);

  return (
    <Page>
      <PageHeader
        eyebrow="Balance sheet"
        title={entity ? entity.name : "Account reconciliation"}
        description={entity ? <>Entity <span className="font-mono text-stone-700">{entity.code}</span> · review and reconcile each general ledger account</> : "Review and reconcile general ledger balances for your entities."}
        actions={entities.length > 0 && (
          <div className="flex items-center gap-2">
            {running && <Loader2 size={16} className="animate-spin text-stone-400" aria-label="Updating" />}
            <label className="relative">
              <span className="sr-only">Entity</span>
              <Building2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className={cx(inputCls, "w-auto min-w-[240px] cursor-pointer pl-9 pr-8 font-medium")}>
                {entities.map((e) => <option key={e.code} value={e.code}>{e.code} · {e.name}{e.status !== "ACTIVE" ? " (inactive)" : ""}</option>)}
              </select>
            </label>
          </div>
        )}
      />

      <ErrorBanner message={error} />

      {entities.length === 0 && !error && (
        <Card><EmptyState icon={<Building2 size={18} />} title="No entities assigned yet">Ask an administrator to give you access to one.</EmptyState></Card>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Accounts" value={rows.length} hint={`${stats.notStarted} not yet assembled`} />
            <Stat label="Open items" value={stats.open.toLocaleString()} hint="Uncleared lines this period" />
            <Stat label="Awaiting review" value={stats.review} tone={stats.review ? "warn" : "default"} hint="Assembled, needs a reviewer" />
            <Stat label="Awaiting approval" value={stats.approval} hint="Reviewed, needs final sign-off" />
          </div>

          <Card className={cx("overflow-hidden transition-opacity", running && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
              <h2 className="text-[15px] font-semibold text-stone-900">Accounts <span className="num ml-1 font-normal text-stone-400">{rows.length}</span></h2>
              <label className="relative w-full sm:w-64">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter accounts" className={cx(inputCls, "h-8 pl-9")} />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={theadCls}>
                  <tr>
                    <th className={th}>Account</th>
                    <th className={cx(th, "hidden md:table-cell")}>Period</th>
                    <th className={cx(th, "hidden sm:table-cell")}>Status</th>
                    <th className={cx(th, "hidden sm:table-cell text-right")}>Open items</th>
                    <th className={cx(th, "text-right")}>Period balance</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className={tbodyCls}>
                  {visible.map((r) => (
                    <tr key={r.glId} onClick={() => router.push(`/account/${r.glId}`)} className="group cursor-pointer transition-colors hover:bg-stone-50">
                      <td className={td}>
                        <Link href={`/account/${r.glId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-stone-900 hover:underline decoration-stone-300 underline-offset-4">{r.description}</Link>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="font-mono text-xs text-stone-500">{r.glId}</span>
                          {r.status !== "ACTIVE" && <Badge>Inactive</Badge>}
                        </div>
                        <div className="mt-1.5 sm:hidden"><StageBadge stage={r.stage} /></div>
                      </td>
                      <td className={cx(td, "hidden md:table-cell")}>
                        <div className="text-stone-800">{formatPeriod(r.activePeriod, "short")}</div>
                        <div className="text-xs text-stone-400">{r.lastClosed ? `Closed through ${formatPeriod(r.lastClosed, "short")}` : "Never closed"}</div>
                      </td>
                      <td className={cx(td, "hidden sm:table-cell")}><StageBadge stage={r.stage} /></td>
                      <td className={cx(td, "num hidden sm:table-cell text-right", r.openItems ? "text-stone-800" : "text-stone-400")}>{r.openItems}</td>
                      <td className={cx(td, "num text-right font-medium text-stone-900 whitespace-nowrap")}>{formatCents(r.balanceCents)}</td>
                      <td className="pr-3 text-stone-300 group-hover:text-stone-500"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                  {visible.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-stone-500">No accounts match “{q}”.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {!running && selected && rows.length === 0 && !error && (
        <Card><EmptyState title={`No GL accounts in ${selected} yet`}>An administrator adds them under Administration → Entities & GLs.</EmptyState></Card>
      )}
    </Page>
  );
}
