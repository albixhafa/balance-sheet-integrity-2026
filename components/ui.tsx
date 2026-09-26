"use client";

import { AlertCircle, CheckCircle2, Clock, Circle, ShieldCheck } from "lucide-react";

export type Stage = "OPEN" | "ASSEMBLED" | "REVIEWED" | "APPROVED";

const STAGE: Record<Stage, { label: string; cls: string; icon: React.ReactNode }> = {
  OPEN: { label: "Open", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: <Circle size={12} /> },
  ASSEMBLED: { label: "Assembled", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock size={12} /> },
  REVIEWED: { label: "Reviewed", cls: "bg-blue-50 text-blue-700 border-blue-200", icon: <ShieldCheck size={12} /> },
  APPROVED: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={12} /> },
};

export function StageBadge({ stage }: { stage: Stage }) {
  const s = STAGE[stage];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

export function ErrorBanner({ message, onClose }: { message: string | null; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="bg-rose-50 text-rose-800 border border-rose-200 p-4 rounded-xl flex items-start gap-3 text-sm font-medium">
      <AlertCircle size={18} className="shrink-0 mt-0.5" />
      <span className="flex-1 whitespace-pre-line">{message}</span>
      {onClose && <button onClick={onClose} className="text-rose-500 hover:text-rose-700 text-xs font-bold">Dismiss</button>}
    </div>
  );
}

export function SuccessBanner({ message, onClose }: { message: string | null; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div role="status" className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-4 rounded-xl flex items-start gap-3 text-sm font-medium">
      <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
      <span className="flex-1 whitespace-pre-line">{message}</span>
      {onClose && <button onClick={onClose} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold">Dismiss</button>}
    </div>
  );
}

/** When a server action reports the session has ended, send the user to sign in
 *  rather than leaving them staring at an error on a dead page. */
export function handleAuthLoss(res: { ok: boolean; code?: string }) {
  if (!res.ok && res.code === "UNAUTHENTICATED") {
    window.location.href = "/balancesheet/login";
    return true;
  }
  return false;
}
