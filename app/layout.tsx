import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import UserProfile from "@/components/UserProfile";
import AuthGuard from "@/components/AuthGuard";
import NavLinks from "@/components/NavLinks";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Balance Sheet Integrity",
  description: "Review and reconcile general ledger accounts.",
  robots: { index: false, follow: false },
};

// Every page depends on who is signed in; nothing here may be cached across users.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const admin = user ? isAdmin(user) : false;
  const canImport = Boolean(user && !user.isReadOnly && (admin || user.role === "ASSEMBLER"));
  const showChrome = Boolean(user && !user.requiresPasswordChange);
  const guardUser = user ? { requiresPasswordChange: user.requiresPasswordChange } : null;

  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 flex h-screen overflow-hidden`}>
        <AuthGuard user={guardUser} />

        {showChrome && (
          <aside className="w-64 bg-[#0f172a] hidden md:flex flex-col h-screen border-r border-slate-800 shrink-0 select-none">
            <div className="p-6 flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold text-white leading-tight tracking-tight">Balance Sheet</span>
                <span className="text-sm font-bold text-blue-400 leading-tight">Integrity</span>
              </div>
            </div>
            <div className="px-4 mb-6 shrink-0">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                <UserProfile user={user ? { name: user.name, role: user.role, isReadOnly: user.isReadOnly } : null} />
              </div>
            </div>
            <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto pb-6">
              <NavLinks canImport={canImport} isAdmin={admin} />
            </nav>
          </aside>
        )}

        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          {showChrome && (
            <header className="h-14 bg-[#0f172a] flex items-center justify-between px-4 md:hidden shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-400" />
                <span className="font-bold text-white">Balance Sheet Integrity</span>
              </div>
              <UserProfile user={user ? { name: user.name, role: user.role, isReadOnly: user.isReadOnly } : null} />
            </header>
          )}
          {showChrome && (
            <nav className="md:hidden bg-[#0f172a] border-t border-slate-800 px-2 py-2 flex gap-1 overflow-x-auto shrink-0 text-sm">
              <NavLinks canImport={canImport} isAdmin={admin} horizontal />
            </nav>
          )}
          <div className="flex-1 overflow-y-auto">{children}</div>
        </main>
      </body>
    </html>
  );
}
