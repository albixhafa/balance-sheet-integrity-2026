"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X, ArrowLeft } from "lucide-react";

/* The app's small design system. Pages compose these instead of repeating
 * long class strings, so spacing, radii and colour stay consistent. */

export type Stage = "OPEN" | "ASSEMBLED" | "REVIEWED" | "APPROVED";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

// ---------- status ----------

const STAGE: Record<Stage, { label: string; dot: string; cls: string }> = {
  OPEN: { label: "Open", dot: "bg-stone-400", cls: "bg-stone-100 text-stone-700" },
  ASSEMBLED: { label: "Awaiting review", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-800" },
  REVIEWED: { label: "Awaiting approval", dot: "bg-sky-500", cls: "bg-sky-50 text-sky-800" },
  APPROVED: { label: "Approved", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-800" },
};
export const STAGE_LABEL: Record<Stage, string> = Object.fromEntries(Object.entries(STAGE).map(([k, v]) => [k, v.label])) as Record<Stage, string>;
export const STAGE_DOT: Record<Stage, string> = Object.fromEntries(Object.entries(STAGE).map(([k, v]) => [k, v.dot])) as Record<Stage, string>;

export function StageBadge({ stage }: { stage: Stage }) {
  const s = STAGE[stage];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.cls)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} /> {s.label}
    </span>
  );
}

type Tone = "neutral" | "brand" | "green" | "amber" | "red" | "sky" | "violet";
const TONE: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-600",
  brand: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-rose-50 text-rose-700",
  sky: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
};
export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return <span title={title} className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", TONE[tone])}>{children}</span>;
}

// ---------- buttons ----------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const VARIANT: Record<Variant, string> = {
  primary: "bg-stone-900 text-white hover:bg-stone-800 shadow-sm disabled:bg-stone-300",
  secondary: "bg-white text-stone-800 border border-stone-200 hover:bg-stone-50 hover:border-stone-300 shadow-xs disabled:text-stone-400",
  ghost: "text-stone-600 hover:text-stone-900 hover:bg-stone-100 disabled:text-stone-300",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:bg-rose-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:bg-stone-300",
};
const SIZE = { sm: "h-8 px-2.5 text-[13px] gap-1.5", md: "h-9 px-3.5 text-sm gap-2" };

export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md", extra?: string) {
  return cx("inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap", VARIANT[variant], SIZE[size], extra);
}

export function Button({ variant = "secondary", size = "md", loading, className, children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} className={buttonClass(variant, size, className)}>
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

// ---------- layout ----------

export function Page({ children, width = "wide" }: { children: React.ReactNode; width?: "wide" | "narrow" }) {
  return <div className={cx("mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6", width === "wide" ? "max-w-[1320px]" : "max-w-4xl")}>{children}</div>;
}

export function PageHeader({ title, description, actions, back, eyebrow }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string }; eyebrow?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-900">
          <ArrowLeft size={14} /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-[13px] text-stone-500">{eyebrow}</div>}
          <h1 className="text-[22px] font-semibold tracking-tight text-stone-900 md:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]", className)}>{children}</div>;
}

export function CardHeader({ title, description, actions, icon }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-stone-400">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
          {description && <p className="text-[13px] text-stone-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-rose-700" : "text-stone-900";
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[13px] text-stone-500">{label}</p>
      <p className={cx("num mt-1 truncate text-xl font-semibold tracking-tight", color)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-stone-400">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-stone-100 text-stone-400">{icon}</div>}
      <p className="font-medium text-stone-800">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-stone-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center gap-2.5 text-sm text-stone-500">
      <Loader2 className="animate-spin" size={18} /> {label}…
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[] }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-stone-100 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
          {o.label}
          {o.count !== undefined && <span className={cx("num rounded px-1 text-[11px]", value === o.value ? "bg-stone-100 text-stone-600" : "text-stone-400")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- tables ----------

export const th = "px-4 py-2.5 text-left text-xs font-medium text-stone-500 whitespace-nowrap";
export const td = "px-4 py-3 align-middle";
export const theadCls = "border-b border-stone-200 bg-stone-50/70";
export const tbodyCls = "divide-y divide-stone-100";

// ---------- forms ----------

export const inputCls =
  "w-full h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-xs outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:bg-stone-50 disabled:text-stone-500";
export const textareaCls = inputCls.replace("h-9", "min-h-20 py-2");

export function Field({ label, hint, error, children, className }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-stone-700">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}

export function CheckRow({ checked, onChange, disabled, title, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
      checked ? "border-stone-300 bg-stone-50" : "border-stone-200 hover:bg-stone-50", disabled && "cursor-not-allowed opacity-60")}>
      <input type="checkbox" className="mt-0.5 size-4" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm"><span className="font-medium text-stone-900">{title}</span>{children && <span className="mt-0.5 block text-[13px] text-stone-500">{children}</span>}</span>
    </label>
  );
}

// ---------- feedback ----------

function Banner({ tone, message, onClose }: { tone: "error" | "success" | "info"; message: React.ReactNode; onClose?: () => void }) {
  const t = {
    error: { cls: "border-rose-200 bg-rose-50 text-rose-900", icon: <AlertCircle size={16} className="text-rose-600" />, role: "alert" },
    success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: <CheckCircle2 size={16} className="text-emerald-600" />, role: "status" },
    info: { cls: "border-stone-200 bg-white text-stone-700", icon: <Info size={16} className="text-stone-400" />, role: "status" },
  }[tone];
  return (
    <div role={t.role} className={cx("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm", t.cls)}>
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <span className="flex-1 whitespace-pre-line">{message}</span>
      {onClose && <button onClick={onClose} aria-label="Dismiss" className="-mr-1 rounded p-0.5 opacity-60 hover:opacity-100"><X size={15} /></button>}
    </div>
  );
}
export function ErrorBanner({ message, onClose }: { message: string | null; onClose?: () => void }) {
  return message ? <Banner tone="error" message={message} onClose={onClose} /> : null;
}
export function SuccessBanner({ message, onClose }: { message: string | null; onClose?: () => void }) {
  return message ? <Banner tone="success" message={message} onClose={onClose} /> : null;
}
export function InfoBanner({ children }: { children: React.ReactNode }) {
  return <Banner tone="info" message={children} />;
}

export function Dialog({ title, description, onClose, children, footer, wide }: {
  title: string; description?: React.ReactNode; onClose: () => void; children?: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={cx("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl ring-1 ring-stone-900/5 sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            <h3 className="text-base font-semibold text-stone-900">{title}</h3>
            {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X size={18} /></button>
        </div>
        {children && <div className="overflow-y-auto px-6 pb-2">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-stone-100 px-6 py-4 mt-4">{footer}</div>}
      </div>
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
