"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Upload, Shield, ListChecks } from "lucide-react";

/* The old sidebar highlighted "Balance Sheet" on every page. */
export default function NavLinks({ canImport, isAdmin, horizontal = false }: { canImport: boolean; isAdmin: boolean; horizontal?: boolean }) {
  const pathname = usePathname();
  const item = (href: string, label: string, icon: React.ReactNode, match: (p: string) => boolean, tone = "blue") => {
    const active = match(pathname);
    const on = tone === "purple" ? "bg-purple-600/15 text-purple-300 border-purple-500/30" : "bg-blue-600/15 text-blue-300 border-blue-500/30";
    return (
      <Link href={href} className={`flex items-center gap-3 px-3 py-2.5 whitespace-nowrap rounded-lg font-medium transition-colors border ${active ? on : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800"}`}>
        {icon} {label}
      </Link>
    );
  };
  return (
    <>
      {item("/", "Balance Sheet", <LayoutDashboard size={18} />, (p) => p === "/" || p.startsWith("/account"))}
      {item("/status", "Close Status", <ListChecks size={18} />, (p) => p.startsWith("/status"))}
      {canImport && item("/import", "Import GL Activity", <Upload size={18} />, (p) => p.startsWith("/import"))}
      {isAdmin && (
        <div className={horizontal ? "" : "pt-4 mt-4 border-t border-slate-800/80"}>
          {item("/admin", "Administration", <Shield size={18} />, (p) => p.startsWith("/admin"), "purple")}
        </div>
      )}
    </>
  );
}
