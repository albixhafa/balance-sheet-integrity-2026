"use client";

import { useState } from "react";
import { Lock, ShieldAlert, Loader2 } from "lucide-react";
import { completeRequiredPasswordChange, logout } from "@/app/actions/auth";
import { handleAuthLoss } from "@/components/ui";

export default function ChangePasswordPage() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    const res = await completeRequiredPasswordChange(pw, confirm);
    if (!res.ok) {
      if (handleAuthLoss(res)) return;
      setError(res.error);
      setBusy(false);
      return;
    }
    // Was window.location.href = "/", which ignored the /balancesheet base path
    // and dropped people on the portfolio homepage.
    window.location.href = "/balancesheet";
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-amber-50 p-6 border-b border-amber-100 text-center">
          <ShieldAlert size={32} className="text-amber-600 mx-auto mb-2" />
          <h1 className="text-xl font-bold text-amber-900">Set a new password</h1>
          <p className="text-sm text-amber-800 mt-1.5">You signed in with a temporary password. Choose your own before continuing.</p>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm font-medium text-rose-800">{error}</div>}
          {[["New password", pw, setPw, "new-password"], ["Confirm new password", confirm, setConfirm, "new-password"]].map(([label, val, set, ac]) => (
            <label key={label as string} className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-1">{label as string}</span>
              <span className="relative block">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input required type="password" minLength={10} maxLength={72} autoComplete={ac as string} value={val as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
              </span>
            </label>
          ))}
          <p className="text-xs text-slate-500">At least 10 characters. It cannot be the temporary password.</p>
          <button type="submit" disabled={busy}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-70">
            {busy ? <Loader2 className="animate-spin" size={18} /> : "Save and continue"}
          </button>
          <button type="button" onClick={async () => { await logout(); window.location.href = "/balancesheet/login"; }}
            className="w-full text-sm text-slate-500 hover:text-slate-700">Sign out instead</button>
        </form>
      </div>
    </div>
  );
}
