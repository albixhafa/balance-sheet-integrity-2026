"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, ChevronRight, Loader2, Copy, Check, KeyRound, Lock, MoreHorizontal, Pencil, UserX, UserCheck, Unlock, Users, Building2, ScrollText } from "lucide-react";
import {
  getAdminData, getAuditLog, createUser, updateUser, setUserStatus, resetUserPassword, unlockUser,
  createEntity, updateEntity, createGLAccount, updateGLAccount,
} from "@/app/actions/admin";
import { ROLE_LABEL, formatDateTime, formatPeriod } from "@/lib/format";
import { Avatar } from "@/components/AppShell";
import {
  Page, PageHeader, Card, Button, Badge, Dialog, Field, CheckRow, PageLoading, Segmented, EmptyState,
  ErrorBanner, SuccessBanner, handleAuthLoss, inputCls, th, td, theadCls, tbodyCls, cx,
} from "@/components/ui";

type Role = "ASSEMBLER" | "REVIEWER" | "APPROVER" | "ADMIN" | "SUPER_ADMIN";
type User = { id: string; name: string; email: string; role: Role; status: string; isReadOnly: boolean; isLockedOut: boolean; requiresPasswordChange: boolean; entities: { code: string }[]; createdAt: string };
type GL = { id: string; description: string; status: string; txnCount: number; subNames: (string | null)[] };
type Entity = { code: string; name: string; status: string; glAccounts: GL[] };
type Event = { id: string; at: string; action: string; actor: string; target: string | null; entityCode: string | null; glId: string | null; periodId: string | null; detail: unknown };
type Tab = "users" | "entities" | "audit";
type Confirm = { title: string; body: string; label: string; danger?: boolean; run: () => Promise<unknown> };

const isAdminRole = (r: string) => r === "ADMIN" || r === "SUPER_ADMIN";
const ROLE_TONE: Record<Role, "violet" | "sky" | "amber" | "neutral"> = { SUPER_ADMIN: "violet", ADMIN: "violet", APPROVER: "sky", REVIEWER: "amber", ASSEMBLER: "neutral" };

function StatusPill({ u }: { u: User }) {
  if (u.status !== "ACTIVE") return <Badge>Deactivated</Badge>;
  if (u.isLockedOut) return <Badge tone="red"><Lock size={10} /> Locked out</Badge>;
  if (u.requiresPasswordChange) return <Badge tone="amber">Awaiting first sign-in</Badge>;
  return <Badge tone="green">Active</Badge>;
}

/** A compact "…" menu so each row carries one control instead of four links.
 *  Positioned with `fixed` so the table's scroll container cannot clip it. */
function RowMenu({ items }: { items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setPos(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null); };
    const dismiss = () => setPos(null);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    window.addEventListener("scroll", dismiss, true); window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss);
    };
  }, [pos]);
  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btn.current!.getBoundingClientRect();
    const height = items.length * 36 + 8;
    const top = r.bottom + 4 + height > window.innerHeight ? r.top - 4 - height : r.bottom + 4;
    setPos({ top, left: Math.max(8, r.right - 192) });
  };
  return (
    <>
      <button ref={btn} onClick={toggle} aria-label="Actions" aria-expanded={!!pos}
        className={cx("rounded-md p-1.5 hover:bg-stone-100 hover:text-stone-800", pos ? "bg-stone-100 text-stone-800" : "text-stone-400")}><MoreHorizontal size={17} /></button>
      {pos && (
        <div ref={menu} role="menu" style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-48 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 text-left shadow-lg">
          {items.map((it) => (
            <button key={it.label} role="menuitem" disabled={it.disabled} onClick={() => { setPos(null); it.onClick(); }}
              className={cx("flex h-9 w-full items-center gap-2.5 px-3 text-left text-sm disabled:opacity-40",
                it.danger ? "text-rose-700 hover:bg-rose-50" : "text-stone-700 hover:bg-stone-50")}>
              <span className={it.danger ? "text-rose-500" : "text-stone-400"}>{it.icon}</span> {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  const [userModal, setUserModal] = useState<null | { user: User | null }>(null);
  const [uf, setUf] = useState({ name: "", email: "", role: "ASSEMBLER" as Role, isReadOnly: false, entityCodes: [] as string[] });
  const [entityModal, setEntityModal] = useState<null | { entity: Entity | null }>(null);
  const [ef, setEf] = useState({ code: "", name: "", status: "ACTIVE" });
  const [glModal, setGlModal] = useState<null | { entityCode: string; gl: GL | null }>(null);
  const [gf, setGf] = useState({ id: "", description: "", status: "ACTIVE", subNames: Array(10).fill("") as string[] });
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [secret, setSecret] = useState<null | { who: string; password: string }>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    const res = await getAdminData();
    if (!res.ok) { if (!handleAuthLoss(res)) setError(res.error); setLoading(false); return; }
    setMeId(res.data.meId); setUsers(res.data.users as User[]); setEntities(res.data.entities as Entity[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab !== "audit") return;
    getAuditLog(300).then((res) => { if (res.ok) setEvents(res.data as Event[]); else setError(res.error); });
  }, [tab]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; code?: string }>, success?: string) => {
    setBusy(true); setError(null); setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { if (!handleAuthLoss(res as { ok: boolean; code?: string })) setError(res.error ?? "That did not work."); return false; }
    if (success) setNotice(success);
    await load();
    return true;
  };

  const runConfirm = async () => {
    if (!confirm) return;
    await confirm.run();
    setConfirm(null);
  };

  // ---- users ----
  const openUser = (u: User | null) => {
    setModalError(null);
    setUf(u ? { name: u.name, email: u.email, role: u.role, isReadOnly: u.isReadOnly, entityCodes: u.entities.map((e) => e.code) }
      : { name: "", email: "", role: "ASSEMBLER", isReadOnly: false, entityCodes: [] });
    setUserModal({ user: u });
  };
  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setModalError(null);
    const editing = userModal?.user;
    const res = editing
      ? await updateUser(editing.id, { name: uf.name, role: uf.role, isReadOnly: uf.isReadOnly, entityCodes: uf.entityCodes })
      : await createUser(uf);
    setBusy(false);
    if (!res.ok) { if (!handleAuthLoss(res)) setModalError(res.error); return; }
    setUserModal(null);
    if (!editing && res.data && "tempPassword" in res.data) setSecret({ who: uf.email, password: res.data.tempPassword });
    else setNotice("User updated.");
    await load();
  };
  const doReset = async (u: User) => {
    setBusy(true); setError(null);
    const res = await resetUserPassword(u.id);
    setBusy(false);
    if (!res.ok) { if (!handleAuthLoss(res)) setError(res.error); return; }
    setSecret({ who: u.email, password: res.data.tempPassword });
    await load();
  };

  // ---- entities & GLs ----
  const openEntity = (en: Entity | null) => {
    setModalError(null); setConfirmStep(false);
    setEf(en ? { code: en.code, name: en.name, status: en.status } : { code: "", name: "", status: "ACTIVE" });
    setEntityModal({ entity: en });
  };
  const saveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    const creating = !entityModal?.entity;
    // Structure is permanent, so creation needs an explicit second step.
    if (creating && !confirmStep) { setConfirmStep(true); return; }
    setBusy(true); setModalError(null);
    const res = creating ? await createEntity(ef.code, ef.name) : await updateEntity(ef.code, { name: ef.name, status: ef.status as "ACTIVE" | "INACTIVE" });
    setBusy(false);
    if (!res.ok) { if (!handleAuthLoss(res)) setModalError(res.error); setConfirmStep(false); return; }
    setEntityModal(null); setNotice(creating ? `Entity ${ef.code.toUpperCase()} created.` : "Entity updated.");
    await load();
  };
  const openGl = (entityCode: string, gl: GL | null) => {
    setModalError(null); setConfirmStep(false);
    setGf(gl ? { id: gl.id, description: gl.description, status: gl.status, subNames: gl.subNames.map((s) => s ?? "") }
      : { id: "", description: "", status: "ACTIVE", subNames: Array(10).fill("") });
    setGlModal({ entityCode, gl });
  };
  const saveGl = async (e: React.FormEvent) => {
    e.preventDefault();
    const creating = !glModal?.gl;
    if (creating && !confirmStep) { setConfirmStep(true); return; }
    setBusy(true); setModalError(null);
    const res = creating
      ? await createGLAccount(glModal!.entityCode, { id: gf.id, description: gf.description, subNames: gf.subNames })
      : await updateGLAccount(gf.id, { description: gf.description, status: gf.status as "ACTIVE" | "INACTIVE", subNames: gf.subNames });
    setBusy(false);
    if (!res.ok) { if (!handleAuthLoss(res)) setModalError(res.error); setConfirmStep(false); return; }
    setGlModal(null); setNotice(creating ? `GL ${gf.id} created.` : "GL updated.");
    await load();
  };

  if (loading) return <PageLoading />;

  const glCount = entities.reduce((s, en) => s + en.glAccounts.length, 0);

  return (
    <Page>
      <PageHeader title="Administration" description="Users, access and the ledger structure. Every change here is recorded in the audit log."
        actions={tab === "users" ? <Button variant="primary" onClick={() => openUser(null)}><Plus size={15} /> New user</Button>
          : tab === "entities" ? <Button variant="primary" onClick={() => openEntity(null)}><Plus size={15} /> New entity</Button> : undefined} />

      <Segmented<Tab> value={tab} onChange={setTab} options={[
        { value: "users", label: <><Users size={14} /> Users</>, count: users.length },
        { value: "entities", label: <><Building2 size={14} /> Entities & GLs</>, count: entities.length },
        { value: "audit", label: <><ScrollText size={14} /> Audit log</> },
      ]} />

      <ErrorBanner message={error} onClose={() => setError(null)} />
      <SuccessBanner message={notice} onClose={() => setNotice(null)} />

      {tab === "users" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className={theadCls}>
                <tr><th className={th}>User</th><th className={th}>Role</th><th className={th}>Entities</th><th className={th}>Status</th><th className="w-12" /></tr>
              </thead>
              <tbody className={tbodyCls}>
                {users.map((u) => {
                  const self = u.id === meId;
                  const protectedSuper = u.role === "SUPER_ADMIN";
                  const items = [
                    { label: "Edit", icon: <Pencil size={14} />, onClick: () => openUser(u) },
                    ...(!self && u.isLockedOut ? [{ label: "Unlock", icon: <Unlock size={14} />, onClick: () => act(() => unlockUser(u.id), `${u.name} unlocked.`), disabled: busy }] : []),
                    ...(!self ? [{
                      label: "Reset password", icon: <KeyRound size={14} />, disabled: busy,
                      onClick: () => setConfirm({ title: `Reset password for ${u.name}?`, body: "They will be signed out everywhere and must choose a new password when they next sign in.", label: "Reset password", run: () => doReset(u) }),
                    }] : []),
                    ...(!self ? [u.status === "ACTIVE"
                      ? { label: "Deactivate", icon: <UserX size={14} />, danger: true, disabled: busy,
                          onClick: () => setConfirm({ title: `Deactivate ${u.name}?`, body: "They are signed out immediately and can no longer sign in. You can reactivate them later.", label: "Deactivate", danger: true, run: () => act(() => setUserStatus(u.id, "INACTIVE"), `${u.name} deactivated.`) }) }
                      : { label: "Reactivate", icon: <UserCheck size={14} />, disabled: busy, onClick: () => act(() => setUserStatus(u.id, "ACTIVE"), `${u.name} reactivated.`) }] : []),
                  ];
                  return (
                    <tr key={u.id} className={cx(u.status !== "ACTIVE" ? "bg-stone-50/60 text-stone-500" : "hover:bg-stone-50/60")}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-medium text-stone-900">{u.name}{self && <Badge tone="brand">You</Badge>}</div>
                            <div className="truncate text-xs text-stone-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                          {u.isReadOnly && <Badge>Read-only</Badge>}
                        </div>
                      </td>
                      <td className={cx(td, "text-xs")}>{isAdminRole(u.role) ? <span className="text-stone-500">All entities</span> : u.entities.length
                        ? <span className="font-mono text-stone-700">{u.entities.map((e) => e.code).join(", ")}</span>
                        : <span className="text-rose-600">None, sees nothing</span>}</td>
                      <td className={td}><StatusPill u={u} /></td>
                      <td className="pr-3 text-right">
                        {protectedSuper && !self ? <Lock size={14} className="ml-auto text-stone-300" aria-label="Super admin" /> : <RowMenu items={items} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "entities" && (
        <Card className="overflow-hidden">
          <div className="border-b border-stone-100 px-5 py-3 text-[13px] text-stone-500">{entities.length} entities · {glCount} GL accounts</div>
          {!entities.length && <EmptyState icon={<Building2 size={18} />} title="No entities yet" action={<Button variant="primary" onClick={() => openEntity(null)}><Plus size={15} /> New entity</Button>}>Create the first entity, then add its GL accounts.</EmptyState>}
          <ul className="divide-y divide-stone-100">
            {entities.map((en) => {
              const open = expanded.includes(en.code);
              return (
                <li key={en.code}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50/60">
                    <button onClick={() => setExpanded((x) => (open ? x.filter((c) => c !== en.code) : [...x, en.code]))} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
                      <ChevronRight size={16} className={cx("shrink-0 text-stone-400 transition-transform", open && "rotate-90")} />
                      <span className="w-20 shrink-0 font-mono text-[13px] font-medium text-stone-900">{en.code}</span>
                      <span className="min-w-0 truncate text-sm text-stone-700">{en.name}</span>
                      {en.status !== "ACTIVE" && <Badge>Inactive</Badge>}
                      <span className="num ml-auto shrink-0 text-xs text-stone-400">{en.glAccounts.length} GL{en.glAccounts.length === 1 ? "" : "s"}</span>
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => openEntity(en)}>Edit</Button>
                    <Button size="sm" onClick={() => openGl(en.code, null)}><Plus size={13} /> Add GL</Button>
                  </div>
                  {open && (
                    <div className="bg-stone-50/60 px-4 pb-4 pl-11">
                      {!en.glAccounts.length ? <p className="py-3 text-sm text-stone-500">No GL accounts yet.</p> : (
                        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                          <table className="w-full min-w-[640px] text-sm">
                            <thead className={theadCls}><tr><th className={th}>GL</th><th className={th}>Description</th><th className={th}>Dimensions</th><th className={cx(th, "text-right")}>Lines</th><th className="w-16" /></tr></thead>
                            <tbody className={tbodyCls}>
                              {en.glAccounts.map((g) => (
                                <tr key={g.id} className={g.status !== "ACTIVE" ? "text-stone-400" : ""}>
                                  <td className="px-4 py-2.5 font-mono text-xs text-stone-700">{g.id}</td>
                                  <td className="px-4 py-2.5">{g.description}{g.status !== "ACTIVE" && <span className="ml-2"><Badge>Inactive</Badge></span>}</td>
                                  <td className="px-4 py-2.5 text-xs text-stone-500">{g.subNames.filter(Boolean).join(", ") || "—"}</td>
                                  <td className="num px-4 py-2.5 text-right text-xs text-stone-600">{g.txnCount.toLocaleString()}</td>
                                  <td className="px-2 py-2.5 text-right"><Button size="sm" variant="ghost" onClick={() => openGl(en.code, g)}>Edit</Button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tab === "audit" && (
        <Card className="overflow-hidden">
          <div className="border-b border-stone-100 px-5 py-3 text-[13px] text-stone-500">Most recent 300 events</div>
          {!events ? <div className="flex items-center gap-2 p-6 text-sm text-stone-500"><Loader2 className="animate-spin" size={16} /> Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className={theadCls}><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Where</th><th className={th}>Detail</th></tr></thead>
                <tbody className={tbodyCls}>
                  {events.map((e) => (
                    <tr key={e.id} className="hover:bg-stone-50/60">
                      <td className="num whitespace-nowrap px-4 py-2.5 text-xs text-stone-500">{formatDateTime(e.at)}</td>
                      <td className="px-4 py-2.5 font-medium text-stone-800">{e.actor}</td>
                      <td className="px-4 py-2.5"><span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-700">{e.action}</span>{e.target && <span className="text-xs text-stone-500"> → {e.target}</span>}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-stone-600">{[e.entityCode, e.glId, e.periodId && formatPeriod(e.periodId, "short")].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="max-w-[380px] truncate px-4 py-2.5 text-xs text-stone-500" title={e.detail ? JSON.stringify(e.detail) : ""}>{e.detail ? JSON.stringify(e.detail) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {userModal && (
        <Dialog title={userModal.user ? `Edit ${userModal.user.name}` : "New user"} onClose={() => setUserModal(null)}
          description={userModal.user ? userModal.user.email : "They receive a temporary password to replace at first sign-in."}>
          <form id="user-form" onSubmit={saveUser} className="space-y-4">
            <ErrorBanner message={modalError} />
            <Field label="Full name"><input required maxLength={100} value={uf.name} onChange={(e) => setUf({ ...uf, name: e.target.value })} className={inputCls} /></Field>
            {!userModal.user && <Field label="Email"><input required type="email" maxLength={254} value={uf.email} onChange={(e) => setUf({ ...uf, email: e.target.value })} className={inputCls} /></Field>}
            <Field label="Role" hint={userModal.user?.id === meId ? "You cannot change your own role." : undefined}>
              <select value={uf.role} disabled={userModal.user?.id === meId || uf.role === "SUPER_ADMIN"} onChange={(e) => setUf({ ...uf, role: e.target.value as Role })} className={inputCls}>
                <option value="ASSEMBLER">Assembler · imports, clears items, signs step 1</option>
                <option value="REVIEWER">Reviewer · signs or rejects step 2</option>
                <option value="APPROVER">Approver · signs or rejects step 3</option>
                <option value="ADMIN">Admin · all entities, administration</option>
                {uf.role === "SUPER_ADMIN" && <option value="SUPER_ADMIN">Super admin</option>}
              </select>
            </Field>
            {!isAdminRole(uf.role) && (
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-stone-700">Entities</span>
                <div className="max-h-44 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
                  {entities.map((en) => (
                    <label key={en.code} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-stone-50">
                      <input type="checkbox" className="size-4" checked={uf.entityCodes.includes(en.code)}
                        onChange={(e) => setUf({ ...uf, entityCodes: e.target.checked ? [...uf.entityCodes, en.code] : uf.entityCodes.filter((c) => c !== en.code) })} />
                      <span className="font-mono text-[13px] font-medium text-stone-800">{en.code}</span><span className="truncate text-stone-500">{en.name}</span>
                    </label>
                  ))}
                </div>
                {!uf.entityCodes.length && <span className="mt-1.5 block text-xs text-amber-700">Without an entity this user will see nothing.</span>}
              </div>
            )}
            <CheckRow checked={uf.isReadOnly} disabled={userModal.user?.id === meId} onChange={(v) => setUf({ ...uf, isReadOnly: v })} title="Read-only">
              Can view, cannot import, clear, attach or sign.
            </CheckRow>
          </form>
          <div className="-mx-6 mt-5 flex justify-end gap-2 border-t border-stone-100 px-6 pt-4 pb-2">
            <Button variant="ghost" onClick={() => setUserModal(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="user-form" loading={busy}>{userModal.user ? "Save changes" : "Create user"}</Button>
          </div>
        </Dialog>
      )}

      {entityModal && (
        <Dialog title={entityModal.entity ? `Edit ${entityModal.entity.code}` : "New entity"} onClose={() => setEntityModal(null)}>
          <form id="entity-form" onSubmit={saveEntity} className="space-y-4">
            <ErrorBanner message={modalError} />
            <Field label="Entity code" hint="Exactly 6 letters or digits. Permanent once created.">
              <input required pattern="[A-Za-z0-9]{6}" title="Exactly 6 letters or digits" maxLength={6} value={ef.code} disabled={!!entityModal.entity || confirmStep}
                onChange={(e) => setEf({ ...ef, code: e.target.value.toUpperCase() })} className={cx(inputCls, "font-mono uppercase")} placeholder="ABC001" />
            </Field>
            <Field label="Name"><input required maxLength={100} value={ef.name} disabled={confirmStep} onChange={(e) => setEf({ ...ef, name: e.target.value })} className={inputCls} /></Field>
            {entityModal.entity && (
              <Field label="Status">
                <select value={ef.status} onChange={(e) => setEf({ ...ef, status: e.target.value })} className={inputCls}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive · no imports, no new assembly</option>
                </select>
              </Field>
            )}
            {confirmStep && <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Lock size={15} className="mt-0.5 shrink-0" /> <span>Create entity <b className="font-mono">{ef.code}</b> “{ef.name}”? The code cannot be changed later.</span></div>}
          </form>
          <div className="-mx-6 mt-5 flex justify-end gap-2 border-t border-stone-100 px-6 pt-4 pb-2">
            <Button variant="ghost" onClick={() => (confirmStep ? setConfirmStep(false) : setEntityModal(null))}>{confirmStep ? "Back" : "Cancel"}</Button>
            <Button variant="primary" type="submit" form="entity-form" loading={busy}>{entityModal.entity ? "Save" : confirmStep ? "Create entity" : "Continue"}</Button>
          </div>
        </Dialog>
      )}

      {glModal && (
        <Dialog wide title={glModal.gl ? `Edit GL ${glModal.gl.id}` : `New GL in ${glModal.entityCode}`} onClose={() => setGlModal(null)}>
          <form id="gl-form" onSubmit={saveGl} className="space-y-4">
            <ErrorBanner message={modalError} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="GL number" hint={!glModal.gl ? "Exactly 12 digits." : undefined}>
                <input required pattern="\d{12}" title="Exactly 12 digits" maxLength={12} inputMode="numeric" value={gf.id} disabled={!!glModal.gl || confirmStep}
                  onChange={(e) => setGf({ ...gf, id: e.target.value.replace(/\D/g, "") })} className={cx(inputCls, "font-mono")} placeholder="100150000000" />
              </Field>
              <Field label="Description"><input required maxLength={200} value={gf.description} disabled={confirmStep} onChange={(e) => setGf({ ...gf, description: e.target.value })} className={inputCls} /></Field>
            </div>
            {glModal.gl && (
              <Field label="Status">
                <select value={gf.status} onChange={(e) => setGf({ ...gf, status: e.target.value })} className={inputCls}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive · no new imports</option>
                </select>
              </Field>
            )}
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-stone-700">Sub-account dimension labels <span className="font-normal text-stone-400">(optional)</span></span>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {gf.subNames.map((v, i) => (
                  <input key={i} maxLength={20} value={v} disabled={confirmStep} placeholder={`Sub ${i + 1}`} aria-label={`Sub-account ${i + 1} label`}
                    onChange={(e) => setGf({ ...gf, subNames: gf.subNames.map((s, k) => (k === i ? e.target.value : s)) })} className={cx(inputCls, "h-8 text-xs")} />
                ))}
              </div>
            </div>
            {confirmStep && <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Lock size={15} className="mt-0.5 shrink-0" /> <span>Create GL <b className="font-mono">{gf.id}</b> in {glModal.entityCode}? The number and entity cannot be changed later.</span></div>}
          </form>
          <div className="-mx-6 mt-5 flex justify-end gap-2 border-t border-stone-100 px-6 pt-4 pb-2">
            <Button variant="ghost" onClick={() => (confirmStep ? setConfirmStep(false) : setGlModal(null))}>{confirmStep ? "Back" : "Cancel"}</Button>
            <Button variant="primary" type="submit" form="gl-form" loading={busy}>{glModal.gl ? "Save" : confirmStep ? "Create GL" : "Continue"}</Button>
          </div>
        </Dialog>
      )}

      {confirm && (
        <Dialog title={confirm.title} description={confirm.body} onClose={() => setConfirm(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant={confirm.danger ? "danger" : "primary"} loading={busy} onClick={runConfirm}>{confirm.label}</Button>
          </>} />
      )}

      {secret && (
        <Dialog title="Temporary password" onClose={() => { setSecret(null); setCopied(false); }}
          description={<>Give this to <b className="text-stone-800">{secret.who}</b> through a private channel. It is shown only once, and they must replace it when they first sign in.</>}
          footer={<Button variant="primary" onClick={() => { setSecret(null); setCopied(false); }}>Done</Button>}>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 font-mono text-lg tracking-wide text-stone-900">{secret.password}</code>
            <Button onClick={() => { navigator.clipboard.writeText(secret.password).then(() => setCopied(true)).catch(() => {}); }} aria-label="Copy password" className="h-11 w-11 px-0">
              {copied ? <Check size={17} className="text-emerald-600" /> : <Copy size={17} />}
            </Button>
          </div>
        </Dialog>
      )}
    </Page>
  );
}
