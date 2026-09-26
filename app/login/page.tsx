"use client";

import { useState } from "react";
import { Lock, Mail, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await login(email, password);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Full navigation so the server layout renders with the new session.
    window.location.href = `/balancesheet${res.data.redirectTo === "/" ? "" : res.data.redirectTo}`;
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-8 pb-6 text-center border-b border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500 mt-1.5">Balance Sheet Integrity - reconciliation portal</p>
        </div>
        <form onSubmit={submit} className="p-8 space-y-5">
          {error && (
            <div role="alert" className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex gap-2.5">
              <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
              <p className="text-sm font-medium text-rose-800">{error}</p>
            </div>
          )}
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1.5">Email address</span>
            <span className="relative block">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="name@company.com" />
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1.5">Password</span>
            <span className="relative block">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••••" />
            </span>
          </label>
          <button type="submit" disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70">
            {busy ? <><Loader2 size={18} className="animate-spin" /> Signing in…</> : "Sign in"}
          </button>
          <p className="text-xs text-slate-500 text-center">Forgotten your password or locked out? Ask your administrator to reset it.</p>
        </form>
      </div>
    </div>
  );
}
