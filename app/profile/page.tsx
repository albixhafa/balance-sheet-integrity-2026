"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { getMe, changePassword } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/lib/format";
import { Avatar } from "@/components/AppShell";
import { Page, PageHeader, Card, CardHeader, Button, Field, Badge, PageLoading, ErrorBanner, SuccessBanner, handleAuthLoss, inputCls } from "@/components/ui";

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

  if (loading) return <PageLoading />;
  if (!me) return null;

  const admin = me.role === "ADMIN" || me.role === "SUPER_ADMIN";

  return (
    <Page width="narrow">
      <PageHeader title="Profile" description="Your access and security settings." />

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <Avatar name={me.name} size="lg" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-stone-900">{me.name}</h2>
          <p className="text-sm text-stone-500">{me.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="brand">{ROLE_LABEL[me.role] ?? me.role}</Badge>{me.isReadOnly && <Badge>Read-only</Badge>}</div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="What you can do" />
          <ul className="space-y-2.5 px-5 py-4">
            {(me.isReadOnly ? ["View assigned entities (read-only)"] : ACCESS[me.role] ?? []).map((a) => (
              <li key={a} className="flex items-start gap-2.5 text-sm text-stone-700"><Check size={15} className="mt-0.5 shrink-0 text-emerald-600" /> {a}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Entities" />
          <div className="px-5 py-4">
            {admin ? <p className="text-sm text-stone-700">All entities</p>
              : me.entities.length ? (
                <ul className="space-y-2">{me.entities.map((e) => <li key={e.code} className="flex gap-3 text-sm"><span className="w-16 font-mono text-[13px] font-medium text-stone-800">{e.code}</span><span className="text-stone-600">{e.name}</span></li>)}</ul>
              ) : <p className="text-sm text-stone-500">No entities assigned yet. Ask an administrator.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Change password" description="At least 10 characters. Changing it signs out your other browsers." />
        <form onSubmit={submit} className="max-w-md space-y-4 px-5 py-5">
          <ErrorBanner message={error} />
          <SuccessBanner message={ok} />
          {([["Current password", current, setCurrent, "current-password"], ["New password", pw, setPw, "new-password"], ["Confirm new password", confirm, setConfirm, "new-password"]] as const).map(([label, val, set, ac]) => (
            <Field key={label} label={label}>
              <input type="password" required autoComplete={ac} value={val} onChange={(e) => set(e.target.value)}
                minLength={label === "Current password" ? 1 : 10} maxLength={72} className={inputCls} />
            </Field>
          ))}
          <Button type="submit" variant="primary" loading={busy}>Update password</Button>
        </form>
      </Card>
    </Page>
  );
}
