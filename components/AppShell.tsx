"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutGrid, ListChecks, Upload, Settings2, LogOut, Menu, X } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/lib/format";
import { cx } from "@/components/ui";

type ShellUser = { name: string; role: string; isReadOnly: boolean };

/** Two equal bars: the ledger in balance. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <rect width="28" height="28" rx="7" className="fill-brand-700" />
      <rect x="7" y="9.5" width="14" height="3" rx="1.5" fill="white" />
      <rect x="7" y="15.5" width="14" height="3" rx="1.5" fill="white" fillOpacity="0.55" />
    </svg>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[14px] font-semibold tracking-tight text-stone-900">Balance Sheet</span>
        <span className="block text-[12px] text-stone-500">Integrity</span>
      </span>
    </Link>
  );
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span className={cx("flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-900",
      size === "lg" ? "size-16 text-xl" : "size-8 text-xs")}>
      {initialsOf(name)}
    </span>
  );
}

function Nav({ canImport, isAdmin, onNavigate }: { canImport: boolean; isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const item = (href: string, label: string, Icon: typeof LayoutGrid, active: boolean) => (
    <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
      className={cx("flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
        active ? "bg-white font-medium text-stone-900 shadow-sm ring-1 ring-stone-200/70" : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900")}>
      <Icon size={17} className={active ? "text-brand-600" : "text-stone-400"} /> {label}
    </Link>
  );
  return (
    <nav className="space-y-5">
      <div className="space-y-0.5">
        {item("/", "Balance sheet", LayoutGrid, pathname === "/" || pathname.startsWith("/account"))}
        {item("/status", "Close status", ListChecks, pathname.startsWith("/status"))}
        {canImport && item("/import", "Import activity", Upload, pathname.startsWith("/import"))}
      </div>
      {isAdmin && (
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-medium text-stone-400">Admin</p>
          {item("/admin", "Administration", Settings2, pathname.startsWith("/admin"))}
        </div>
      )}
    </nav>
  );
}

function UserCard({ user }: { user: ShellUser }) {
  const signOut = async () => {
    await logout();
    // A full navigation, so no page keeps rendering data from the old session.
    window.location.href = "/balancesheet/login";
  };
  return (
    <div className="flex items-center gap-2 rounded-lg p-1.5">
      <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-stone-200/50">
        <Avatar name={user.name} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-stone-900">{user.name}</span>
          <span className="block truncate text-xs text-stone-500">{ROLE_LABEL[user.role] ?? user.role}{user.isReadOnly ? " · Read-only" : ""}</span>
        </span>
      </Link>
      <button onClick={signOut} title="Sign out" aria-label="Sign out" className="rounded-md p-2 text-stone-400 hover:bg-stone-200/60 hover:text-stone-800">
        <LogOut size={16} />
      </button>
    </div>
  );
}

export default function AppShell({ user, canImport, isAdmin, children }: { user: ShellUser; canImport: boolean; isAdmin: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200/80 bg-[#f1f1ee] md:flex">
        <div className="px-4 pt-5 pb-6"><Brand /></div>
        <div className="flex-1 overflow-y-auto px-3"><Nav canImport={canImport} isAdmin={isAdmin} /></div>
        <div className="border-t border-stone-200/80 p-2"><UserCard user={user} /></div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-stone-900/30" />
          <aside onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#f1f1ee] shadow-xl">
            <div className="flex items-center justify-between px-4 pt-4 pb-6">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-2 text-stone-500 hover:bg-stone-200/60"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3"><Nav canImport={canImport} isAdmin={isAdmin} onNavigate={() => setOpen(false)} /></div>
            <div className="border-t border-stone-200/80 p-2"><UserCard user={user} /></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200/80 bg-white/80 px-4 backdrop-blur md:hidden">
          <Brand />
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-2 text-stone-600 hover:bg-stone-100"><Menu size={20} /></button>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
