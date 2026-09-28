"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { completeRequiredPasswordChange, logout } from "@/app/actions/auth";
import { Button, Field, ErrorBanner, handleAuthLoss, inputCls } from "@/components/ui";

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
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><KeyRound size={20} /></div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-stone-900">Set a new password</h1>
          <p className="mt-1.5 text-sm text-stone-500">You signed in with a temporary password. Choose your own before continuing.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(28,25,23,0.06)]">
          <ErrorBanner message={error || null} />
          <Field label="New password" hint="At least 10 characters. It cannot be the temporary password.">
            <input required type="password" minLength={10} maxLength={72} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} autoFocus />
          </Field>
          <Field label="Confirm new password">
            <input required type="password" minLength={10} maxLength={72} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
          </Field>
          <Button type="submit" variant="primary" loading={busy} className="w-full">Save and continue</Button>
        </form>
        <button type="button" onClick={async () => { await logout(); window.location.href = "/balancesheet/login"; }}
          className="mt-6 w-full text-center text-sm text-stone-500 hover:text-stone-800">Sign out instead</button>
      </div>
    </div>
  );
}
