"use client";

import { useEffect, useState } from "react";
import { Shield, Key, Loader2, CheckCircle2, Building2 } from "lucide-react";
import { getMe, changePassword } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/lib/format";
import { ErrorBanner, SuccessBanner, handleAuthLoss } from "@/components/ui";

type Me = { name: string; email: string; role: string; isReadOnly: boolean; entities: { code: string; name: string }[] };

const ACCESS: Record<string, string[]> = {
  ADMIN: ["All entities", "Can act in any workflow role (one step per reconciliation)", "Import activity", "User & ledger administration", "Reopen approved periods"],
  SUPER_ADMIN: ["All entities", "Can act in any workflow role (one step per reconciliation)", "Import activity", "User & ledger administration", "Reopen approved periods"],
  ASSEMBLER: ["Import activity", "Clear items and attach support", "Sign step 1: Assembly"],
  REVIEWER: ["Sign or reject step 2: Review"],
  APPROVER: ["Sign or reject step 3: Final approval"],
};

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    getMe().then((res) => {
      if (res.ok && res.data) setMe(res.data);
      setLoading(false);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setOk(null);
    if (pw !== confirm) { setError("The new passwords do not match."); return; }
    setBusy(true);
    const res = await changePassword(current, pw);
    setBusy(false);
    if (!res.ok) { if (!handleAuthLoss(res)) setError(res.error); return; }
    setCurrent(""); setPw(""); setConfirm("");
    setOk("Password changed. Any other browsers signed in as you have been signed out.");
  };

  if (loading) return <div className="p-8 flex items-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Loading profile…</div>;
  if (!me) return null;

  const initials = me.name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const admin = me.role === "ADMIN" || me.role === "SUPER_ADMIN";

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Your access and security settings.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
            <div className="w-20 h-20 rounded-full bg-blue-600 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">{initials}</div>
            <h2 className="text-xl font-bold text-slate-900">{me.name}</h2>
            <p className="text-sm font-semibold text-blue-600">{ROLE_LABEL[me.role] ?? me.role}{me.isReadOnly ? " · Read-only" : ""}</p>
            <p className="text-xs text-slate-500 mt-1">{me.email}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Shield size={15} /> What you can do</h3>
            <ul className="space-y-2.5">
              {(me.isReadOnly ? ["View assigned entities (read-only)"] : ACCESS[me.role] ?? []).map((a) => (
                <li key={a} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> {a}</li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Building2 size={15} /> Entities</h3>
            {admin ? <p className="text-sm font-semibold text-purple-600">All entities</p>
              : me.entities.length ? (
                <ul className="space-y-2">{me.entities.map((e) => <li key={e.code} className="text-sm text-slate-700"><span className="font-mono font-bold">{e.code}</span> <span className="text-slate-500">{e.name}</span></li>)}</ul>
              ) : <p className="text-sm text-slate-500 italic">No entities assigned yet. Ask an administrator.</p>}
          </div>
        </div>
        <div className="md:col-span-2 bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-6"><Key size={18} className="text-slate-500" /> Change password</h3>
          <form onSubmit={submit} className="space-y-4 max-w-md">
            <ErrorBanner message={error} />
            <SuccessBanner message={ok} />
            {([["Current password", current, setCurrent, "current-password"], ["New password", pw, setPw, "new-password"], ["Confirm new password", confirm, setConfirm, "new-password"]] as const).map(([label, val, set, ac]) => (
              <label key={label} className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</span>
                <input type="password" required autoComplete={ac} value={val} onChange={(e) => set(e.target.value)}
                  minLength={label === "Current password" ? 1 : 10} maxLength={72}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </label>
            ))}
            <p className="text-xs text-slate-500">At least 10 characters. Changing it signs out your other browsers.</p>
            <button type="submit" disabled={busy} className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 px-6 rounded-lg flex items-center gap-2 disabled:opacity-70">
              {busy && <Loader2 size={16} className="animate-spin" />} Update password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
