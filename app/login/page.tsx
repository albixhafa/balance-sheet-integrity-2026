"use client";

import { useState } from "react";
import { login } from "@/app/actions/auth";
import { BrandMark } from "@/components/AppShell";
import { Button, Field, ErrorBanner, inputCls } from "@/components/ui";

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
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size={40} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-stone-900">Sign in</h1>
          <p className="mt-1.5 text-sm text-stone-500">Balance Sheet Integrity reconciliation portal</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(28,25,23,0.06)]">
          <ErrorBanner message={error} />
          <Field label="Email">
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@company.com" autoFocus />
          </Field>
          <Field label="Password">
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </Field>
          <Button type="submit" variant="primary" loading={busy} className="w-full">{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="mt-6 text-center text-xs text-stone-500">Forgotten your password or locked out? Ask your administrator to reset it.</p>
      </div>
    </div>
  );
}
