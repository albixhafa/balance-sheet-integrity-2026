"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronDown, ChevronRight, Paperclip, CheckCircle2, UploadCloud, UserCheck, ShieldCheck, Lock,
  AlertCircle, XCircle, Loader2, CheckSquare, MinusSquare, History, RotateCcw, Undo2, FileWarning,
} from "lucide-react";
import { getAccountDetails } from "@/app/actions/ledger";
import {
  signOff, undoSignOff, rejectReconciliation, reopenPeriod, setCleared, uploadAttachment, linkAttachment, removeAttachment,
} from "@/app/actions/workflow";
import { formatPeriod, formatCents, formatTxnDate, formatDateTime, formatBytes } from "@/lib/format";
import { nextPeriod } from "@/lib/periods";
import { ErrorBanner, SuccessBanner, handleAuthLoss } from "@/components/ui";

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

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close"><XCircle size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

type Pending =
  | { kind: "sign"; step: "assembler" | "reviewer" | "approver" }
  | { kind: "reject"; level: "reviewer" | "approver" }
  | { kind: "reopen" }
  | null;

const STEP_TITLE = { assembler: "Assembly", reviewer: "Review", approver: "Final approval" } as const;

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

  if (loading) return <div className="flex h-full items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-3" size={22} /> Loading account…</div>;
  if (loadError || !data) return (
    <div className="p-8 max-w-2xl space-y-4">
      <ErrorBanner message={loadError ?? "This account could not be loaded."} />
      <Link href="/" className="text-blue-600 font-medium text-sm">← Back to the balance sheet</Link>
    </div>
  );

  const { decisions: d, signatures: sig, gl } = data;
  const period = data.activePeriod;
  const canSelect = d.editLines.allowed || d.attach.allowed;
  const subLabels = gl.subNames.map((n, i) => n || `Sub ${i + 1}`);

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

  const disabledTitle = (dec: Decision) => (dec.allowed ? undefined : dec.reason);

  // A render function, not a component: declared inside the page, a component
  // would be a new type on every render, so React would tear down and rebuild
  // all three panels each time - losing focus and swallowing clicks that land
  // mid-update.
  const renderBlock = (step: "assembler" | "reviewer" | "approver", icon: React.ReactNode) => {
    const s = sig[step];
    const n = step === "assembler" ? 1 : step === "reviewer" ? 2 : 3;
    const undo = step === "approver" ? null : d.unsign[step];
    const reject = step === "assembler" ? null : d.reject[step];
    return (
      <div key={step} className={`p-6 flex flex-col items-center text-center ${s ? "bg-emerald-50/40" : ""}`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${s ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>{icon}</div>
        <h3 className="font-bold text-slate-900 mb-1">{n}. {STEP_TITLE[step]}</h3>
        {s ? (
          <div className="text-sm text-slate-600">
            <p className="font-medium text-emerald-700 flex items-center justify-center gap-1.5"><CheckCircle2 size={14} /> Signed</p>
            <p className="font-bold">{s.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(s.at)}</p>
            {undo?.allowed && (
              <button disabled={busy} onClick={() => act(() => undoSignOff(gl.id, step as "assembler" | "reviewer", period), "Signature removed.")}
                className="mt-2 text-xs font-semibold text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"><Undo2 size={12} /> Undo my sign-off</button>
            )}
          </div>
        ) : (
          <div className="w-full mt-1 space-y-2">
            <div className="flex gap-2">
              <button disabled={busy || !d.sign[step].allowed} title={disabledTitle(d.sign[step])}
                onClick={() => { setPending({ kind: "sign", step }); setConfirmChecked(false); }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed">
                Sign off
              </button>
              {reject && reject.allowed && (
                <button disabled={busy} onClick={() => { setPending({ kind: "reject", level: step as "reviewer" | "approver" }); setReason(""); }}
                  title="Reject and send back" className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 rounded-lg border border-rose-200"><XCircle size={18} /></button>
              )}
            </div>
            {!d.sign[step].allowed && <p className="text-[11px] font-medium text-slate-500">{d.sign[step].reason}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-4">
        <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium text-sm">← Balance sheet</Link>
        <h1 className="text-2xl font-bold text-slate-900">
          <span className="font-mono">{gl.id}</span> <span className="text-slate-500 font-semibold">{gl.description}</span>
        </h1>
      </div>

      <ErrorBanner message={error} onClose={() => setError(null)} />
      <SuccessBanner message={notice} onClose={() => setNotice(null)} />
      {data.me.isReadOnly && <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm text-slate-600 flex gap-2"><Lock size={16} /> Your account is read-only. You can view this reconciliation but not change it.</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          ["Entity", `${gl.entityCode} · ${gl.entityName}`],
          ["Current period", formatPeriod(period)],
          ["Closed through", formatPeriod(data.lastClosed, "long", "Never closed")],
          ["Period balance", formatCents(periodTotal)],
          ["Open items", `${openCount} of ${lines.length}`],
        ].map(([k, v]) => (
          <div key={k} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{k}</p>
            <p className="text-sm md:text-base font-bold text-slate-900 mt-1 truncate" title={v}>{v}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><ShieldCheck size={18} className="text-blue-600" /> {formatPeriod(period)} sign-off</h2>
          <span className={`text-xs font-bold ${data.clearedNetCents === 0 ? "text-emerald-700" : "text-rose-600"}`}>Cleared items net {formatCents(data.clearedNetCents)}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {renderBlock("assembler", <UserCheck size={22} />)}
          {renderBlock("reviewer", <UserCheck size={22} />)}
          {renderBlock("approver", <ShieldCheck size={22} />)}
        </div>
        <p className="px-6 py-2.5 text-[11px] text-slate-500 border-t border-slate-100 bg-slate-50/60">Each step must be signed by a different person. Final approval locks the period and rolls open items into {formatPeriod(nextPeriod(period))}.</p>
      </div>

      {data.futureCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
          {data.futureCount} line{data.futureCount === 1 ? " is" : "s are"} already imported for later periods. They appear here once {formatPeriod(period)} is approved.
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900">Lines in {formatPeriod(period)}</h2>
          <div className="text-xs text-slate-500 flex items-center gap-3">
            {!d.editLines.allowed && <span className="inline-flex items-center gap-1"><Lock size={12} /> {d.editLines.reason}</span>}
            <button onClick={() => setShowSubs((v) => !v)} className="font-semibold text-blue-600 hover:text-blue-800">{showSubs ? "Hide" : "Show"} sub-accounts</button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="bg-blue-600 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span><b>{selected.length}</b> selected</span>
              <span>Net <span className={`font-mono font-bold px-2 py-0.5 rounded ${selNet === 0 ? "bg-emerald-500" : "bg-blue-800"}`}>{formatCents(selNet)}</span></span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setSelected([])} className="text-sm text-blue-100 hover:text-white mr-1">Cancel</button>
              {d.editLines.allowed && allSelCleared && (
                <button disabled={busy} onClick={async () => { if (await act(() => setCleared(gl.id, selected, false, period), "Lines un-cleared.")) setSelected([]); }}
                  className="bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1.5"><MinusSquare size={15} /> Un-clear</button>
              )}
              {d.editLines.allowed && noneSelCleared && (
                <button disabled={busy || selNet !== 0} title={selNet !== 0 ? "Selected lines must net to $0.00" : undefined}
                  onClick={async () => { if (await act(() => setCleared(gl.id, selected, true, period), "Lines cleared.")) setSelected([]); }}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 disabled:cursor-not-allowed px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1.5"><CheckSquare size={15} /> Mark cleared</button>
              )}
              {d.attach.allowed && (
                <>
                  <label className={`cursor-pointer bg-white text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1.5 ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                    <UploadCloud size={15} /> Attach file
                    <input type="file" className="hidden" onChange={(e) => { onUpload(e.target.files, selected); e.target.value = ""; }} />
                  </label>
                  {reusable.length > 0 && (
                    <select disabled={busy} value="" onChange={async (e) => { if (e.target.value && await act(() => linkAttachment(gl.id, e.target.value, selected, period), "Support applied.")) setSelected([]); }}
                      className="bg-white/20 text-white text-sm font-bold rounded-md px-2 py-1.5 outline-none">
                      <option value="" className="text-slate-900">Apply existing file…</option>
                      {reusable.map((a) => <option key={a.id} value={a.id} className="text-slate-900">{a.fileName}</option>)}
                    </select>
                  )}
                  {selLines.some((l) => l.attachment || l.legacyFileName) && (
                    <button disabled={busy} onClick={async () => { if (await act(() => removeAttachment(gl.id, selected, period), "Support removed.")) setSelected([]); }}
                      className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md text-sm font-bold">Remove support</button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className={`w-full text-sm text-left ${showSubs ? "min-w-[1900px]" : "min-w-[1000px]"}`}>
            <thead className="text-xs text-slate-500 uppercase font-semibold border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input type="checkbox" aria-label="Select all" disabled={!canSelect || !lines.length}
                    checked={lines.length > 0 && selected.length === lines.length}
                    onChange={(e) => setSelected(e.target.checked ? lines.map((l) => l.id) : [])} className="w-4 h-4" />
                </th>
                <th className="p-3 w-28">Date</th>
                <th className="p-3 w-40">Reference</th>
                <th className="p-3">Description</th>
                <th className="p-3 w-36 text-right">Amount</th>
                {showSubs && subLabels.map((s, i) => <th key={i} className="p-3 w-28 bg-blue-50/40 text-blue-800">{s}</th>)}
                <th className="p-3 w-64">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!lines.length && <tr><td colSpan={showSubs ? 16 : 6} className="p-8 text-center text-slate-500 italic">No lines in {formatPeriod(period)}. Import activity to populate this period.</td></tr>}
              {sorted.map((l) => {
                const isSel = selected.includes(l.id);
                return (
                  <tr key={l.id} className={isSel ? "bg-blue-50/60" : l.cleared ? "bg-slate-50/70 text-slate-500" : "hover:bg-slate-50/50"}>
                    <td className="p-3 text-center">
                      <input type="checkbox" aria-label={`Select line ${l.reference ?? l.id}`} disabled={!canSelect} checked={isSel}
                        onChange={() => setSelected((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} className="w-4 h-4" />
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-xs">{formatTxnDate(l.txnDate)}</span>
                      <div className="flex gap-1 mt-1">
                        {l.cleared && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 uppercase px-1.5 py-0.5 rounded">Cleared</span>}
                        {l.rolledFrom && <span title={`Rolled forward from ${formatPeriod(l.rolledFrom)}`} className="text-[9px] font-bold text-violet-700 bg-violet-50 border border-violet-200 uppercase px-1.5 py-0.5 rounded">From {formatPeriod(l.rolledFrom, "short")}</span>}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs truncate max-w-[160px]" title={l.reference ?? ""}>{l.reference ?? "-"}</td>
                    <td className="p-3 text-xs truncate max-w-[320px]" title={l.description ?? ""}>{l.description ?? "-"}</td>
                    <td className={`p-3 text-right font-mono font-semibold ${l.amountCents < 0 ? "text-slate-900" : "text-emerald-700"}`}>{formatCents(l.amountCents)}</td>
                    {showSubs && l.subs.map((s, i) => <td key={i} className="p-3 font-mono text-[11px] bg-blue-50/10">{s ?? <span className="text-slate-300">-</span>}</td>)}
                    <td className="p-3">
                      {l.attachment ? (
                        <a href={fileHref(l.attachment.id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline max-w-[230px]">
                          <Paperclip size={14} className="shrink-0" /> <span className="truncate">{l.attachment.fileName}</span> <span className="text-[10px] text-slate-400 shrink-0">{formatBytes(l.attachment.size)}</span>
                        </a>
                      ) : l.legacyFileName ? (
                        <span title="Recorded before uploads were stored - only the file name exists. Re-attach the file." className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                          <FileWarning size={14} /> {l.legacyFileName} <span className="text-amber-500">(name only)</span>
                        </span>
                      ) : !l.cleared && sig.assembler ? (
                        <span className="text-xs font-bold text-rose-600 inline-flex items-center gap-1"><AlertCircle size={13} /> Missing support</span>
                      ) : d.attach.allowed && !l.cleared ? (
                        <label className="cursor-pointer text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                          <UploadCloud size={13} /> Attach
                          <input type="file" className="hidden" onChange={(e) => { onUpload(e.target.files, [l.id]); e.target.value = ""; }} />
                        </label>
                      ) : <span className="text-xs text-slate-400">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Closed periods</h2>
          {data.me.isAdmin && data.lastClosed && (
            <button disabled={busy || !d.reopen.allowed} title={disabledTitle(d.reopen)} onClick={() => { setPending({ kind: "reopen" }); setReason(""); }}
              className="text-sm font-semibold text-rose-600 hover:text-rose-800 disabled:text-slate-400 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
              <RotateCcw size={14} /> Reopen {formatPeriod(data.lastClosed, "short")}
            </button>
          )}
        </div>
        {data.me.isAdmin && data.lastClosed && !d.reopen.allowed && <p className="text-xs text-slate-500">{d.reopen.reason}</p>}
        {!data.history.length && <div className="text-sm text-slate-500 italic p-4 bg-white border border-slate-200 rounded-xl">No closed periods yet.</div>}
        {data.history.map((h) => {
          const open = openHistory.includes(h.periodId);
          const total = h.lines.reduce((s, l) => s + l.amountCents, 0);
          return (
            <div key={h.periodId} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button onClick={() => setOpenHistory((o) => (open ? o.filter((p) => p !== h.periodId) : [...o, h.periodId]))}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100">
                <span className="flex items-center gap-3">
                  {open ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
                  <span className="font-bold text-slate-800">{formatPeriod(h.periodId)}</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded uppercase">Approved</span>
                  <span className="text-xs text-slate-500">{h.lines.length} cleared line{h.lines.length === 1 ? "" : "s"}</span>
                </span>
                <span className="font-mono font-bold text-slate-700">{formatCents(total)}</span>
              </button>
              {open && (
                <div className="p-4 space-y-3 border-t border-slate-200">
                  <div className="flex flex-wrap gap-4 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
                    {(["assembler", "reviewer", "approver"] as const).map((k) => (
                      <div key={k}><b className="text-slate-700">{STEP_TITLE[k]}:</b> {h[k] ? `${h[k]!.name}, ${formatDateTime(h[k]!.at)}` : "-"}</div>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left min-w-[700px]">
                      <thead className="text-slate-500 uppercase border-b border-slate-200"><tr><th className="p-2">Date</th><th className="p-2">Reference</th><th className="p-2">Description</th><th className="p-2 text-right">Amount</th><th className="p-2">Support</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {h.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="p-2 font-mono">{formatTxnDate(l.txnDate)}</td><td className="p-2 font-mono">{l.reference ?? "-"}</td><td className="p-2">{l.description ?? "-"}</td>
                            <td className="p-2 text-right font-mono">{formatCents(l.amountCents)}</td>
                            <td className="p-2">{l.attachment ? <a href={fileHref(l.attachment.id)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">{l.attachment.fileName}</a> : l.legacyFileName ? <span className="text-amber-700">{l.legacyFileName} (name only)</span> : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <h2 className="px-5 py-3 border-b border-slate-200 font-bold text-slate-900 flex items-center gap-2"><History size={17} className="text-slate-500" /> Activity</h2>
        {!data.events.length ? <p className="p-5 text-sm text-slate-500 italic">No recorded activity yet.</p> : (
          <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {data.events.map((e) => (
              <li key={e.id} className="px-5 py-2.5 text-sm flex flex-wrap gap-x-2">
                <span className="text-slate-400 text-xs w-40 shrink-0 pt-0.5">{formatDateTime(e.at)}</span>
                <span className="text-slate-800"><b>{e.actor}</b> {EVENT_LABEL[e.action] ?? e.action.toLowerCase().replace(/_/g, " ")}{e.periodId ? ` (${formatPeriod(e.periodId, "short")})` : ""}</span>
                {describeEvent(e) && <span className="text-slate-500">· {describeEvent(e)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending?.kind === "sign" && (
        <Modal title={`Sign off: ${STEP_TITLE[pending.step]}`} onClose={() => setPending(null)}>
          <p className="text-sm text-slate-600">You are signing <b>{STEP_TITLE[pending.step].toLowerCase()}</b> for GL <b className="font-mono">{gl.id}</b>, {formatPeriod(period)}.</p>
          {pending.step === "approver" && <p className="text-sm text-slate-600 mt-2">This locks the period. {openCount} open item{openCount === 1 ? "" : "s"} will roll forward into the next period.</p>}
          <label className="mt-4 flex gap-3 items-start p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
            <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} className="mt-1 w-4 h-4" />
            <span className="text-sm text-amber-900">I confirm I have reviewed all balances in this period and the supporting documentation attached to them.</span>
          </label>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setPending(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button disabled={!confirmChecked || busy} onClick={runPending} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 size={15} className="animate-spin" />} Sign off
            </button>
          </div>
        </Modal>
      )}

      {(pending?.kind === "reject" || pending?.kind === "reopen") && (
        <Modal title={pending.kind === "reopen" ? `Reopen ${formatPeriod(data.lastClosed)}` : `Reject at ${pending.level === "reviewer" ? "review" : "final approval"}`} onClose={() => setPending(null)}>
          <p className="text-sm text-slate-600">
            {pending.kind === "reopen"
              ? "This removes the final approval. The open items that rolled forward move back into that period, and the assembly and review signatures remain."
              : pending.level === "reviewer" ? "This removes the assembly signature and sends the account back to the assembler." : "This removes the assembly and review signatures and sends the account back to the start."}
          </p>
          <label className="block mt-4">
            <span className="block text-sm font-semibold text-slate-700 mb-1">Reason (recorded in the activity log)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400" />
          </label>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setPending(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button disabled={reason.trim().length < 5 || busy} onClick={runPending} className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 size={15} className="animate-spin" />} {pending.kind === "reopen" ? "Reopen period" : "Reject"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
