import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { LayoutDashboard, Upload, Shield, ShieldCheck } from "lucide-react"; 
import { getLoggedInUser } from '@/app/actions/auth';
import UserProfile from '@/components/UserProfile';
import AuthGuard from '@/components/AuthGuard';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Balance Sheet Integrity",
  description: "Review and reconcile general ledger accounts.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 1. Fetch the user securely on the server
  const user = await getLoggedInUser();

  // 2. Check if the user has Admin privileges
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 flex h-screen overflow-hidden`}>
        
        {/* --- Security Bouncer --- */}
        <AuthGuard user={user} />
        
        {/* --- Sidebar Navigation --- */}
        <aside className="w-64 bg-[#0f172a] flex flex-col hidden md:flex h-screen border-r border-slate-800 shrink-0 select-none">
          
          {/* 1. BRAND HEADER */}
          <div className="p-6 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/20">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-white leading-tight tracking-tight">Balance Sheet</span>
              <span className="text-sm font-bold text-blue-400 leading-tight">Integrity</span>
            </div>
          </div>

          {/* 2. USER PROFILE CARD */}
          <div className="px-4 mb-6 shrink-0">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl shadow-sm overflow-hidden p-1">
              <UserProfile user={user} />
            </div>
          </div>
          
          {/* 3. NAVIGATION LINKS */}
          <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto pb-6">

            <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-600/10 text-blue-400 font-medium transition-colors border border-blue-600/20">
              <LayoutDashboard size={18} />
              Balance Sheet
            </Link>

            <Link href="/import" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 font-medium hover:text-white hover:bg-slate-800 transition-colors border border-transparent">
              <Upload size={18} />
              Import GL Activity
            </Link>

            {/* --- ADMIN ONLY LINK --- */}
            {isAdmin && (
              <div className="pt-4 mt-4 border-t border-slate-800/80">
                <Link href="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-purple-400/80 font-medium hover:text-purple-300 hover:bg-slate-800 transition-colors border border-transparent">
                  <Shield size={18} />
                  Administration
                </Link>
              </div>
            )}

          </nav>
        </aside>

        {/* --- Main Content Area --- */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          
          {/* Mobile Header (Only visible on small screens) */}
          <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 md:hidden shrink-0">
            <div className="flex items-center gap-2">
               <ShieldCheck size={20} className="text-blue-600" />
               <h1 className="font-bold text-lg text-slate-900">Balance Sheet Integrity</h1>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </main>

      </body>
    </html>
  );
}