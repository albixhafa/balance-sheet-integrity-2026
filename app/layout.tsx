import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import AuthGuard from "@/components/AuthGuard";
import AppShell from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: "Balance Sheet Integrity",
  description: "Review and reconcile general ledger accounts.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f7f7f5" };

// Every page depends on who is signed in; nothing here may be cached across users.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const admin = user ? isAdmin(user) : false;
  const canImport = Boolean(user && !user.isReadOnly && (admin || user.role === "ASSEMBLER"));
  const showChrome = Boolean(user && !user.requiresPasswordChange);
  const guardUser = user ? { requiresPasswordChange: user.requiresPasswordChange } : null;

  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">
        <AuthGuard user={guardUser} />
        {showChrome && user ? (
          <AppShell user={{ name: user.name, role: user.role, isReadOnly: user.isReadOnly }} canImport={canImport} isAdmin={admin}>
            {children}
          </AppShell>
        ) : (
          <main className="min-h-dvh">{children}</main>
        )}
      </body>
    </html>
  );
}
