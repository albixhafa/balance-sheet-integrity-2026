"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChevronRight, Paperclip, Check, UploadCloud, Lock, AlertCircle, X, History, RotateCcw, Undo2, FileWarning, Columns3,
} from "lucide-react";
import { getAccountDetails } from "@/app/actions/ledger";
import {
  signOff, undoSignOff, rejectReconciliation, reopenPeriod, setCleared, uploadAttachment, linkAttachment, removeAttachment,
} from "@/app/actions/workflow";
import { formatPeriod, formatCents, formatTxnDate, formatDateTime, formatBytes } from "@/lib/format";
import { nextPeriod } from "@/lib/periods";
import {
  Page, PageHeader, Card, CardHeader, Stat, StageBadge, Badge, Button, Dialog, Field, PageLoading, InfoBanner,
  ErrorBanner, SuccessBanner, handleAuthLoss, textareaCls, th, td, theadCls, tbodyCls, cx, type Stage,
} from "@/components/ui";

type Decision = { allowed: boolean; reason?: string };
type Sig = { name: string; at: string | null } | null;
type Line = {
  id: string; txnDate: string; reference: string | null; description: string | null; amountCents: number; cleared: boolean;
  rolledFrom: string | null; subs: (string | null)[]; attachment: { id: string; fileName: string; size: number } | null; legacyFileName: string | null;
};
type Details = {
  me: { id: string; name: string; role: string; isReadOnly: boolean; isAdmin: boolean };
  gl: { id: string; description: string; status: string; entityCode: string; entityName: string; entityStatus: string; subNames: (string | null)[] };
  activePeriod: string; lastClosed: string | null; clearedNetCents: number;
  signatures: { assembler: Sig; reviewer: Sig; approver: Sig };
  decisions: {
    sign: { assembler: Decision; reviewer: Decision; approver: Decision };
    unsign: { assembler: Decision; reviewer: Decision };
    reject: { reviewer: Decision; approver: Decision };
    reopen: Decision; editLines: Decision; attach: Decision;
  };
  lines: Line[]; futureCount: number;
  history: { periodId: string; assembler: Sig; reviewer: Sig; approver: Sig; lines: Line[] }[];
  events: { id: string; at: string; action: string; actor: string; periodId: string | null; detail: unknown }[];
};

const fileHref = (id: string) => `/balancesheet/api/attachments/${id}`;

const EVENT_LABEL: Record<string, string> = {
  SIGNED_ASSEMBLER: "signed assembly", SIGNED_REVIEWER: "signed review", SIGNED_APPROVER: "gave final approval",
  UNSIGNED_ASSEMBLER: "undid assembly", UNSIGNED_REVIEWER: "undid review",
  REJECTED_AT_REVIEWER: "rejected at review", REJECTED_AT_APPROVER: "rejected at approval",
  PERIOD_REOPENED: "reopened the period", ITEMS_ROLLED_FORWARD: "rolled open items forward",
  LINES_CLEARED: "cleared lines", LINES_UNCLEARED: "un-cleared lines",
  SUPPORT_ATTACHED: "attached support", SUPPORT_LINKED: "re-used support", SUPPORT_REMOVED: "removed support",
  GL_CREATED: "created the GL", GL_UPDATED: "edited the GL",
};

function describeEvent(e: Details["events"][number]) {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof d.reason === "string") bits.push(`"${d.reason}"`);
  if (typeof d.count === "number") bits.push(`${d.count} line${d.count === 1 ? "" : "s"}`);
  if (typeof d.lines === "number") bits.push(`${d.lines} line${d.lines === 1 ? "" : "s"}`);
  if (typeof d.file === "string") bits.push(d.file);
  if (typeof d.to === "string") bits.push(`to ${formatPeriod(d.to, "short")}`);
  if (typeof d.itemsMovedBack === "number") bits.push(`${d.itemsMovedBack} item${d.itemsMovedBack === 1 ? "" : "s"} moved back`);
  return bits.join(" · ");
}

type Pending =
  | { kind: "sign"; step: "assembler" | "reviewer" | "approver" }
  | { kind: "reject"; level: "reviewer" | "approver" }
  | { kind: "reopen" }
  | null;

const STEP_TITLE = { assembler: "Assembly", reviewer: "Review", approver: "Final approval" } as const;
const STEP_ROLE = { assembler: "Assembler", reviewer: "Reviewer", approver: "Approver" } as const;

export default function AccountPage() {
  const params = useParams();
  const glId = String(params?.id ?? "");
  const [data, setData] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showSubs, setShowSubs] = useState(false);
  const [openHistory, setOpenHistory] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const res = await getAccountDetails(glId);
    if (!res.ok) {
      if (handleAuthLoss(res)) return;
      setLoadError(res.error);
    } else {
      setData(res.data as Details);
      setLoadError(null);
      // Drop selections of lines that are no longer in the current period.
      setSelected((s) => s.filter((id) => (res.data as Details).lines.some((l) => l.id === id)));
    }
    setLoading(false);
  }, [glId]);

  useEffect(() => { if (glId) load(); }, [glId, load]);

  /** Runs a server action, reports the outcome and reloads the true state. */
  const act = async (fn: () => Promise<{ ok: boolean; error?: string; code?: string }>, success?: string) => {
    setBusy(true); setError(null); setNotice(null);
    const res = await fn();
    if (!res.ok) {
      if (handleAuthLoss(res as { ok: boolean; code?: string })) return false;
      setError(res.error ?? "That did not work.");
    } else if (success) setNotice(success);
    await load();
    setBusy(false);
    return res.ok;
  };

  const lines = data?.lines ?? [];
  const sorted = useMemo(() => [...lines].sort((a, b) => (a.cleared === b.cleared ? a.txnDate.localeCompare(b.txnDate) : a.cleared ? 1 : -1)), [lines]);
  const selLines = lines.filter((l) => selected.includes(l.id));
  const selNet = selLines.reduce((s, l) => s + l.amountCents, 0);
  const allSelCleared = selLines.length > 0 && selLines.every((l) => l.cleared);
  const noneSelCleared = selLines.length > 0 && selLines.every((l) => !l.cleared);
  const periodTotal = lines.reduce((s, l) => s + l.amountCents, 0);
  const openCount = lines.filter((l) => !l.cleared).length;
  const reusable = useMemo(() => {
    const m = new Map<string, { id: string; fileName: string; size: number }>();
    lines.forEach((l) => { if (l.attachment) m.set(l.attachment.id, l.attachment); });
    return [...m.values()];
  }, [lines]);

  if (loading) return <PageLoading label="Loading account" />;
  if (loadError || !data) return (
    <Page width="narrow">
      <PageHeader back={{ href: "/", label: "Balance sheet" }} title="Account unavailable" />
      <ErrorBanner message={loadError ?? "This account could not be loaded."} />
    </Page>
  );

  const { decisions: d, signatures: sig, gl } = data;
  const period = data.activePeriod;
  const canSelect = d.editLines.allowed || d.attach.allowed;
  const subLabels = gl.subNames.map((n, i) => n || `Sub ${i + 1}`);
  const stage: Stage = sig.reviewer ? "REVIEWED" : sig.assembler ? "ASSEMBLED" : "OPEN";

  const onUpload = async (files: FileList | null, ids: string[]) => {
    const f = files?.[0];
    if (!f || !ids.length) return;
    const fd = new FormData();
    fd.set("glId", gl.id); fd.set("expectedPeriod", period); fd.set("lineIds", JSON.stringify(ids)); fd.set("file", f);
    await act(() => uploadAttachment(fd), `Attached ${f.name} to ${ids.length} line${ids.length === 1 ? "" : "s"}.`);
    setSelected([]);
  };

  const runPending = async () => {
    if (!pending) return;
    let ok = false;
    if (pending.kind === "sign") ok = await act(() => signOff(gl.id, pending.step, period), `${STEP_TITLE[pending.step]} signed.`);
    if (pending.kind === "reject") ok = await act(() => rejectReconciliation(gl.id, pending.level, reason, period), "Rejected and sent back.");
    if (pending.kind === "reopen") ok = await act(() => reopenPeriod(gl.id, reason, period), "Period reopened.");
    if (ok) { setPending(null); setReason(""); setConfirmChecked(false); }
  };

  // A render function, not a component: declared inside the page, a component
  // would be a new type on every render, so React would tear down and rebuild
  // all three steps each time - losing focus and swallowing clicks that land
  // mid-update.
  const renderStep = (step: "assembler" | "reviewer" | "approver", n: number) => {
    const s = sig[step];
    const undo = step === "approver" ? null : d.unsign[step];
    const reject = step === "assembler" ? null : d.reject[step];
    const isNext = !s && (step === "assembler" || (step === "reviewer" && !!sig.assembler) || (step === "approver" && !!sig.reviewer));
    return (
      <li key={step} className="relative flex-1 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            s ? "bg-emerald-600 text-white" : isNext ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-400")}>
            {s ? <Check size={14} strokeWidth={3} /> : n}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900">{STEP_TITLE[step]}</p>
            <p className="text-xs text-stone-500">{s ? "Signed" : isNext ? "Up next" : "Waiting"} · {STEP_ROLE[step]}</p>
          </div>
        </div>
        <div className="mt-4 pl-10">
          {s ? (
            <div className="text-sm">
              <p className="font-medium text-stone-900">{s.name}</p>
              <p className="text-xs text-stone-500">{formatDateTime(s.at)}</p>
              {undo?.allowed && (
                <button disabled={busy} onClick={() => act(() => undoSignOff(gl.id, step as "assembler" | "reviewer", period), "Signature removed.")}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-rose-700"><Undo2 size={12} /> {s.name === data.me.name ? "Undo my sign-off" : "Undo sign-off"}</button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={d.sign[step].allowed ? "primary" : "secondary"} disabled={busy || !d.sign[step].allowed}
                  onClick={() => { setPending({ kind: "sign", step }); setConfirmChecked(false); }}>
                  Sign off
                </Button>
                {reject && reject.allowed && (
                  <Button size="sm" disabled={busy} onClick={() => { setPending({ kind: "reject", level: step as "reviewer" | "approver" }); setReason(""); }}
                    className="hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">Reject</Button>
                )}
              </div>
              {!d.sign[step].allowed && <p className="text-xs text-stone-500">{d.sign[step].reason}</p>}
            </div>
          )}
        </div>
      </li>
    );
  };

  const supportCell = (l: Line) => {
    if (l.attachment) return (
      <a href={fileHref(l.attachment.id)} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-[240px] items-center gap-1.5 rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-700 hover:bg-stone-200">
        <Paperclip size={12} className="shrink-0 text-stone-500" /> <span className="truncate">{l.attachment.fileName}</span>
        <span className="num shrink-0 text-stone-400">{formatBytes(l.attachment.size)}</span>
      </a>
    );
    if (l.legacyFileName) return (
      <span title="Recorded before uploads were stored - only the file name exists. Re-attach the file." className="inline-flex items-center gap-1.5 text-xs text-amber-700">
        <FileWarning size={13} /> <span className="truncate max-w-[180px]">{l.legacyFileName}</span> <span className="text-amber-500">(name only)</span>
      </span>
    );
    if (!l.cleared && sig.assembler) return <Badge tone="red"><AlertCircle size={11} /> Missing support</Badge>;
    if (d.attach.allowed && !l.cleared) return (
      <label onClick={(e) => e.stopPropagation()} className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900">
        <UploadCloud size={13} /> Attach
        <input type="file" className="hidden" onChange={(e) => { onUpload(e.target.files, [l.id]); e.target.value = ""; }} />
      </label>
    );
    return <span className="text-xs text-stone-300">—</span>;
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Page>
      <PageHeader
        back={{ href: "/", label: "Balance sheet" }}
        eyebrow={<><span className="font-mono">{gl.entityCode}</span> · {gl.entityName}</>}
        title={<span className="flex flex-wrap items-center gap-3">{gl.description} <StageBadge stage={stage} /></span>}
        description={<span className="flex items-center gap-2"><span className="font-mono">{gl.id}</span>{gl.status !== "ACTIVE" && <Badge>Inactive</Badge>}</span>}
      />

      <ErrorBanner message={error} onClose={() => setError(null)} />
      <SuccessBanner message={notice} onClose={() => setNotice(null)} />
      {data.me.isReadOnly && <InfoBanner><span className="inline-flex items-center gap-1.5"><Lock size={14} /> Your account is read-only. You can view this reconciliation but not change it.</span></InfoBanner>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current period" value={formatPeriod(period)} hint={`Closed through ${formatPeriod(data.lastClosed, "short", "never")}`} />
        <Stat label="Period balance" value={formatCents(periodTotal)} hint={`${lines.length} line${lines.length === 1 ? "" : "s"}`} />
        <Stat label="Open items" value={`${openCount}`} hint={`of ${lines.length} not yet cleared`} tone={openCount ? "default" : "good"} />
        <Stat label="Cleared items net" value={formatCents(data.clearedNetCents)} hint={data.clearedNetCents === 0 ? "In balance" : "Should net to $0.00"} tone={data.clearedNetCents === 0 ? "good" : "bad"} />
      </div>

      <Card>
        <CardHeader title={`${formatPeriod(period)} sign-off`}
          description={`Three different people, in order. Final approval locks the period and rolls open items into ${formatPeriod(nextPeriod(period))}.`} />
        <ol className="flex flex-col divide-y divide-stone-100 md:flex-row md:divide-x md:divide-y-0">
          {renderStep("assembler", 1)}
          {renderStep("reviewer", 2)}
          {renderStep("approver", 3)}
        </ol>
      </Card>

      {data.futureCount > 0 && (
        <InfoBanner>{data.futureCount} line{data.futureCount === 1 ? " is" : "s are"} already imported for later periods. They appear here once {formatPeriod(period)} is approved.</InfoBanner>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title={<>Lines <span className="num ml-1 font-normal text-stone-400">{lines.length}</span></>}
          description={canSelect ? "Select lines that net to $0.00 to clear them, or to attach support." : undefined}
          actions={<>
            {!d.editLines.allowed && <span className="inline-flex items-center gap-1.5 text-xs text-stone-500"><Lock size={12} /> {d.editLines.reason}</span>}
            <Button size="sm" variant="ghost" onClick={() => setShowSubs((v) => !v)}><Columns3 size={14} /> {showSubs ? "Hide" : "Show"} sub-accounts</Button>
          </>}
        />
        <div className="overflow-x-auto">
          <table className={cx("w-full text-sm", showSubs ? "min-w-[1700px]" : "min-w-[860px]")}>
            <thead className={theadCls}>
              <tr>
                <th className="w-10 pl-4">
                  <input type="checkbox" aria-label="Select all" disabled={!canSelect || !lines.length} className="size-4 align-middle"
                    checked={lines.length > 0 && selected.length === lines.length}
                    onChange={(e) => setSelected(e.target.checked ? lines.map((l) => l.id) : [])} />
                </th>
                <th className={cx(th, "w-28")}>Date</th>
                <th className={cx(th, "w-36")}>Reference</th>
                <th className={th}>Description</th>
                <th className={cx(th, "w-36 text-right")}>Amount</th>
                {showSubs && subLabels.map((s, i) => <th key={i} className={cx(th, "w-28")}>{s}</th>)}
                <th className={cx(th, "w-60")}>Support</th>
              </tr>
            </thead>
            <tbody className={tbodyCls}>
              {!lines.length && <tr><td colSpan={showSubs ? 16 : 6} className="px-4 py-12 text-center text-sm text-stone-500">No lines in {formatPeriod(period)}. Import activity to populate this period.</td></tr>}
              {sorted.map((l) => {
                const isSel = selected.includes(l.id);
                return (
                  <tr key={l.id} onClick={() => canSelect && toggle(l.id)}
                    className={cx("transition-colors", canSelect && "cursor-pointer", isSel ? "bg-brand-50/70" : l.cleared ? "bg-stone-50/60" : "hover:bg-stone-50")}>
                    <td className="pl-4">
                      <input type="checkbox" aria-label={`Select line ${l.reference ?? l.id}`} disabled={!canSelect} checked={isSel} className="size-4 align-middle"
                        onClick={(e) => e.stopPropagation()} onChange={() => toggle(l.id)} />
                    </td>
                    <td className={td}>
                      <span className={cx("num whitespace-nowrap text-[13px]", l.cleared ? "text-stone-400" : "text-stone-700")}>{formatTxnDate(l.txnDate)}</span>
                    </td>
                    <td className={cx(td, "font-mono text-xs truncate max-w-[150px]", l.cleared ? "text-stone-400" : "text-stone-600")} title={l.reference ?? ""}>{l.reference ?? "—"}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <span className={cx("truncate max-w-[320px]", l.cleared ? "text-stone-400" : "text-stone-800")} title={l.description ?? ""}>{l.description ?? "—"}</span>
                        {l.cleared && <Badge tone="green"><Check size={11} /> Cleared</Badge>}
                        {l.rolledFrom && <Badge tone="violet" title={`Rolled forward from ${formatPeriod(l.rolledFrom)}`}>From {formatPeriod(l.rolledFrom, "short")}</Badge>}
                      </div>
                    </td>
                    <td className={cx(td, "num text-right font-medium whitespace-nowrap", l.cleared ? "text-stone-400" : "text-stone-900")}>{formatCents(l.amountCents)}</td>
                    {showSubs && l.subs.map((s, i) => <td key={i} className={cx(td, "font-mono text-xs text-stone-600")}>{s ?? <span className="text-stone-300">—</span>}</td>)}
                    <td className={td}>{supportCell(l)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* room so the floating bar never hides the last row */}
        {selected.length > 0 && <div className="h-20" />}
      </Card>

      {selected.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 md:pl-60">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-white shadow-2xl ring-1 ring-black/10">
            <div className="flex items-center gap-3 text-sm">
              <span><span className="num font-semibold">{selected.length}</span> selected</span>
              <span className="text-stone-500">·</span>
              <span className="flex items-center gap-1.5">Net
                <span className={cx("num rounded-md px-1.5 py-0.5 font-semibold", selNet === 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10")}>{formatCents(selNet)}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {d.editLines.allowed && noneSelCleared && (
                <button disabled={busy || selNet !== 0} title={selNet !== 0 ? "Selected lines must net to $0.00" : undefined}
                  onClick={async () => { if (await act(() => setCleared(gl.id, selected, true, period), "Lines cleared.")) setSelected([]); }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[13px] font-medium text-stone-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-stone-400">
                  <Check size={14} /> Mark cleared
                </button>
              )}
              {d.editLines.allowed && allSelCleared && (
                <button disabled={busy} onClick={async () => { if (await act(() => setCleared(gl.id, selected, false, period), "Lines un-cleared.")) setSelected([]); }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[13px] font-medium hover:bg-white/20"><Undo2 size={14} /> Un-clear</button>
              )}
              {d.attach.allowed && (
                <>
                  <label className={cx("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[13px] font-medium hover:bg-white/20", busy && "pointer-events-none opacity-50")}>
                    <UploadCloud size={14} /> Attach file
                    <input type="file" className="hidden" onChange={(e) => { onUpload(e.target.files, selected); e.target.value = ""; }} />
                  </label>
                  {reusable.length > 0 && (
                    <select disabled={busy} value="" onChange={async (e) => { if (e.target.value && await act(() => linkAttachment(gl.id, e.target.value, selected, period), "Support applied.")) setSelected([]); }}
                      className="h-8 max-w-[200px] rounded-lg bg-white/10 px-2 text-[13px] font-medium outline-none hover:bg-white/20">
                      <option value="" className="text-stone-900">Apply existing file…</option>
                      {reusable.map((a) => <option key={a.id} value={a.id} className="text-stone-900">{a.fileName}</option>)}
                    </select>
                  )}
                  {selLines.some((l) => l.attachment || l.legacyFileName) && (
                    <button disabled={busy} onClick={async () => { if (await act(() => removeAttachment(gl.id, selected, period), "Support removed.")) setSelected([]); }}
                      className="inline-flex h-8 items-center rounded-lg bg-white/10 px-3 text-[13px] font-medium hover:bg-white/20">Remove support</button>
                  )}
                </>
              )}
              <button onClick={() => setSelected([])} aria-label="Clear selection" className="ml-1 rounded-lg p-1.5 text-stone-400 hover:bg-white/10 hover:text-white"><X size={16} /></button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="overflow-hidden xl:col-span-3">
          <CardHeader title="Closed periods"
            actions={data.me.isAdmin && data.lastClosed ? (
              <Button size="sm" disabled={busy || !d.reopen.allowed} title={d.reopen.allowed ? undefined : d.reopen.reason}
                onClick={() => { setPending({ kind: "reopen" }); setReason(""); }}>
                <RotateCcw size={13} /> Reopen {formatPeriod(data.lastClosed, "short")}
              </Button>
            ) : undefined} />
          {data.me.isAdmin && data.lastClosed && !d.reopen.allowed && <p className="border-b border-stone-100 px-5 py-2 text-xs text-stone-500">{d.reopen.reason}</p>}
          {!data.history.length ? <p className="px-5 py-8 text-center text-sm text-stone-500">No closed periods yet.</p> : (
            <ul className="divide-y divide-stone-100">
              {data.history.map((h) => {
                const open = openHistory.includes(h.periodId);
                const total = h.lines.reduce((s, l) => s + l.amountCents, 0);
                return (
                  <li key={h.periodId}>
                    <button onClick={() => setOpenHistory((o) => (open ? o.filter((p) => p !== h.periodId) : [...o, h.periodId]))}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-stone-50">
                      <ChevronRight size={16} className={cx("shrink-0 text-stone-400 transition-transform", open && "rotate-90")} />
                      <span className="flex-1">
                        <span className="text-sm font-medium text-stone-900">{formatPeriod(h.periodId)}</span>
                        <span className="ml-2 text-xs text-stone-500">{h.lines.length} cleared line{h.lines.length === 1 ? "" : "s"}{h.approver ? ` · approved by ${h.approver.name}` : ""}</span>
                      </span>
                      <StageBadge stage="APPROVED" />
                      <span className="num w-32 text-right text-sm font-medium text-stone-700">{formatCents(total)}</span>
                    </button>
                    {open && (
                      <div className="space-y-3 bg-stone-50/60 px-5 pb-4 pt-1">
                        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                          {(["assembler", "reviewer", "approver"] as const).map((k) => (
                            <div key={k} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                              <dt className="text-stone-500">{STEP_TITLE[k]}</dt>
                              <dd className="font-medium text-stone-900">{h[k]?.name ?? "—"}</dd>
                              <dd className="text-stone-400">{h[k] ? formatDateTime(h[k]!.at) : ""}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                          <table className="w-full min-w-[640px] text-xs">
                            <thead className={theadCls}><tr><th className={th}>Date</th><th className={th}>Reference</th><th className={th}>Description</th><th className={cx(th, "text-right")}>Amount</th><th className={th}>Support</th></tr></thead>
                            <tbody className={tbodyCls}>
                              {h.lines.map((l) => (
                                <tr key={l.id}>
                                  <td className="num px-4 py-2 text-stone-600">{formatTxnDate(l.txnDate)}</td>
                                  <td className="px-4 py-2 font-mono text-stone-600">{l.reference ?? "—"}</td>
                                  <td className="px-4 py-2 text-stone-700">{l.description ?? "—"}</td>
                                  <td className="num px-4 py-2 text-right font-medium text-stone-800">{formatCents(l.amountCents)}</td>
                                  <td className="px-4 py-2">{l.attachment ? <a href={fileHref(l.attachment.id)} target="_blank" rel="noopener" className="text-brand-700 hover:underline">{l.attachment.fileName}</a> : l.legacyFileName ? <span className="text-amber-700">{l.legacyFileName} (name only)</span> : <span className="text-stone-300">—</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Activity" icon={<History size={16} />} />
          {!data.events.length ? <p className="px-5 py-8 text-center text-sm text-stone-500">No recorded activity yet.</p> : (
            <ol className="max-h-[420px] space-y-0 overflow-y-auto px-5 py-4">
              {data.events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < data.events.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-stone-200" />}
                  <span className="mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-white bg-stone-300 ring-1 ring-stone-200" />
                  <div className="min-w-0 text-sm">
                    <p className="text-stone-800"><span className="font-medium text-stone-900">{e.actor}</span> {EVENT_LABEL[e.action] ?? e.action.toLowerCase().replace(/_/g, " ")}{e.periodId ? <span className="text-stone-500"> · {formatPeriod(e.periodId, "short")}</span> : ""}</p>
                    {describeEvent(e) && <p className="truncate text-xs text-stone-500">{describeEvent(e)}</p>}
                    <p className="text-xs text-stone-400">{formatDateTime(e.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {pending?.kind === "sign" && (
        <Dialog title={`Sign off ${STEP_TITLE[pending.step].toLowerCase()}`} onClose={() => setPending(null)}
          description={<>GL <span className="font-mono text-stone-700">{gl.id}</span> · {formatPeriod(period)}</>}
          footer={<>
            <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="primary" disabled={!confirmChecked} loading={busy} onClick={runPending}>Sign off</Button>
          </>}>
          {pending.step === "approver" && (
            <p className="mb-3 text-sm text-stone-600">This locks the period. {openCount} open item{openCount === 1 ? "" : "s"} will roll forward into {formatPeriod(nextPeriod(period))}.</p>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
            <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} className="mt-0.5 size-4" />
            <span className="text-sm text-stone-700">I confirm I have reviewed all balances in this period and the supporting documentation attached to them.</span>
          </label>
        </Dialog>
      )}

      {(pending?.kind === "reject" || pending?.kind === "reopen") && (
        <Dialog title={pending.kind === "reopen" ? `Reopen ${formatPeriod(data.lastClosed)}` : `Reject at ${pending.level === "reviewer" ? "review" : "final approval"}`}
          onClose={() => setPending(null)}
          description={pending.kind === "reopen"
            ? "This removes the final approval. Open items that rolled forward move back into that period; the assembly and review signatures remain."
            : pending.level === "reviewer" ? "This removes the assembly signature and sends the account back to the assembler." : "This removes the assembly and review signatures and sends the account back to the start."}
          footer={<>
            <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="danger" disabled={reason.trim().length < 5} loading={busy} onClick={runPending}>{pending.kind === "reopen" ? "Reopen period" : "Reject"}</Button>
          </>}>
          <Field label="Reason" hint="Recorded in the activity log. At least 5 characters.">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} autoFocus className={textareaCls} />
          </Field>
        </Dialog>
      )}
    </Page>
  );
}
