"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Building2, Plus, ChevronDown, ChevronRight, X, Loader2, ScrollText, Copy, Check, KeyRound, Lock } from "lucide-react";
import {
  getAdminData, getAuditLog, createUser, updateUser, setUserStatus, resetUserPassword, unlockUser,
  createEntity, updateEntity, createGLAccount, updateGLAccount,
} from "@/app/actions/admin";
import { ROLE_LABEL, formatDateTime, formatPeriod } from "@/lib/format";
import { ErrorBanner, SuccessBanner, handleAuthLoss } from "@/components/ui";

type Role = "ASSEMBLER" | "REVIEWER" | "APPROVER" | "ADMIN" | "SUPER_ADMIN";
type User = { id: string; name: string; email: string; role: Role; status: string; isReadOnly: boolean; isLockedOut: boolean; requiresPasswordChange: boolean; entities: { code: string }[]; createdAt: string };
type GL = { id: string; description: string; status: string; txnCount: number; subNames: (string | null)[] };
type Entity = { code: string; name: string; status: string; glAccounts: GL[] };
type Event = { id: string; at: string; action: string; actor: string; target: string | null; entityCode: string | null; glId: string | null; periodId: string | null; detail: unknown };
type Tab = "users" | "entities" | "audit";

const input = "w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500";
const isAdminRole = (r: string) => r === "ADMIN" || r === "SUPER_ADMIN";

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function StatusPill({ u }: { u: User }) {
  if (u.status !== "ACTIVE") return <span className="text-xs font-semibold text-slate-500">Deactivated</span>;
  if (u.isLockedOut) return <span className="text-xs font-bold text-rose-600">Locked out</span>;
  if (u.requiresPasswordChange) return <span className="text-xs font-semibold text-amber-600">Awaiting first sign-in</span>;
  return <span className="text-xs font-semibold text-emerald-600">Active</span>;
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
    if (!window.confirm(`Reset the password for ${u.name}? They will be signed out everywhere and must choose a new password.`)) return;
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

  if (loading) return <div className="flex h-full items-center justify-center p-8 text-slate-500"><Loader2 className="animate-spin mr-3" size={22} /> Loading…</div>;

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button onClick={() => setTab(t)} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold ${tab === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{icon} {label}</button>
  );

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Administration</h1>
        <p className="text-sm text-slate-500 mt-1">Users, access and the ledger structure. Every change here is recorded in the audit log.</p>
      </div>
      <div className="flex flex-wrap gap-1 bg-slate-200/60 p-1 rounded-xl w-fit">
        {tabBtn("users", "Users", <Users size={17} />)}
        {tabBtn("entities", "Entities & GLs", <Building2 size={17} />)}
        {tabBtn("audit", "Audit log", <ScrollText size={17} />)}
      </div>
      <ErrorBanner message={error} onClose={() => setError(null)} />
      <SuccessBanner message={notice} onClose={() => setNotice(null)} />

      {tab === "users" && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">{users.length} users</h2>
            <button onClick={() => openUser(null)} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm flex items-center gap-2"><Plus size={16} /> New user</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[900px]">
              <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                <tr><th className="px-6 py-3">Name & email</th><th className="px-6 py-3">Role</th><th className="px-6 py-3">Entities</th><th className="px-6 py-3">Status</th><th className="px-6 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const self = u.id === meId;
                  const protectedSuper = u.role === "SUPER_ADMIN";
                  return (
                    <tr key={u.id} className={u.status !== "ACTIVE" ? "bg-slate-50 opacity-75" : "hover:bg-slate-50/60"}>
                      <td className="px-6 py-3"><div className="font-bold text-slate-900">{u.name}{self && <span className="ml-2 text-[10px] font-bold text-blue-600 uppercase">You</span>}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${isAdminRole(u.role) ? "bg-purple-50 text-purple-700 border-purple-200" : u.role === "APPROVER" ? "bg-blue-50 text-blue-700 border-blue-200" : u.role === "REVIEWER" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>{ROLE_LABEL[u.role]}</span>
                        {u.isReadOnly && <span className="ml-1.5 px-2 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 uppercase">Read-only</span>}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-600">{isAdminRole(u.role) ? <span className="text-purple-600 font-semibold">All entities</span> : u.entities.length ? u.entities.map((e) => e.code).join(", ") : <span className="text-rose-500 italic">None - sees nothing</span>}</td>
                      <td className="px-6 py-3"><StatusPill u={u} /></td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {protectedSuper && !self ? <span className="text-[10px] font-bold text-slate-400 uppercase">Super admin</span> : (
                          <div className="inline-flex items-center gap-3 text-xs font-semibold">
                            <button onClick={() => openUser(u)} className="text-blue-600 hover:text-blue-800">Edit</button>
                            {!self && u.isLockedOut && <button disabled={busy} onClick={() => act(() => unlockUser(u.id), `${u.name} unlocked.`)} className="text-amber-600 hover:text-amber-800">Unlock</button>}
                            {!self && <button disabled={busy} onClick={() => doReset(u)} className="text-amber-600 hover:text-amber-800 inline-flex items-center gap-1"><KeyRound size={12} /> Reset password</button>}
                            {!self && (u.status === "ACTIVE"
                              ? <button disabled={busy} onClick={() => window.confirm(`Deactivate ${u.name}? They are signed out immediately.`) && act(() => setUserStatus(u.id, "INACTIVE"), `${u.name} deactivated.`)} className="text-rose-600 hover:text-rose-800">Deactivate</button>
                              : <button disabled={busy} onClick={() => act(() => setUserStatus(u.id, "ACTIVE"), `${u.name} reactivated.`)} className="text-emerald-600 hover:text-emerald-800">Reactivate</button>)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "entities" && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">{entities.length} entities</h2>
            <button onClick={() => openEntity(null)} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm flex items-center gap-2"><Plus size={16} /> New entity</button>
          </div>
          <div className="divide-y divide-slate-100">
            {entities.map((en) => {
              const open = expanded.includes(en.code);
              return (
                <div key={en.code}>
                  <div className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60">
                    <button onClick={() => setExpanded((x) => (open ? x.filter((c) => c !== en.code) : [...x, en.code]))} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Toggle GLs">
                      {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <span className="font-mono font-bold text-slate-900 w-20">{en.code}</span>
                    <span className="flex-1 text-slate-700">{en.name}{en.status !== "ACTIVE" && <span className="ml-2 text-[10px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">Inactive</span>}</span>
                    <span className="text-xs text-slate-500 w-20">{en.glAccounts.length} GL{en.glAccounts.length === 1 ? "" : "s"}</span>
                    <button onClick={() => openEntity(en)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                    <button onClick={() => openGl(en.code, null)} className="text-xs font-bold px-3 py-1.5 rounded-md text-blue-600 bg-blue-50 hover:bg-blue-100">+ Add GL</button>
                  </div>
                  {open && (
                    <div className="bg-slate-50/70 px-4 pb-4 pl-14">
                      {!en.glAccounts.length ? <p className="text-sm text-slate-500 italic py-3">No GL accounts yet.</p> : (
                        <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <thead className="text-xs text-slate-500 uppercase border-b border-slate-200"><tr><th className="p-3 text-left">GL</th><th className="p-3 text-left">Description</th><th className="p-3 text-left">Dimensions</th><th className="p-3 text-right">Lines</th><th className="p-3"></th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {en.glAccounts.map((g) => (
                              <tr key={g.id} className={g.status !== "ACTIVE" ? "opacity-60" : ""}>
                                <td className="p-3 font-mono font-bold">{g.id}</td>
                                <td className="p-3">{g.description}{g.status !== "ACTIVE" && <span className="ml-2 text-[10px] font-bold uppercase text-slate-500">Inactive</span>}</td>
                                <td className="p-3 text-xs text-slate-500">{g.subNames.filter(Boolean).join(", ") || "-"}</td>
                                <td className="p-3 text-right font-mono text-xs">{g.txnCount}</td>
                                <td className="p-3 text-right"><button onClick={() => openGl(en.code, g)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Edit</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50"><h2 className="font-semibold text-slate-800">Most recent 300 events</h2></div>
          {!events ? <div className="p-6 text-slate-500 flex gap-2"><Loader2 className="animate-spin" size={18} /> Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[900px]">
                <thead className="text-xs text-slate-500 uppercase border-b border-slate-200"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Where</th><th className="px-4 py-3">Detail</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(e.at)}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{e.actor}</td>
                      <td className="px-4 py-2.5"><span className="font-mono text-[11px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{e.action}</span>{e.target && <span className="text-xs text-slate-500"> → {e.target}</span>}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">{[e.entityCode, e.glId, e.periodId && formatPeriod(e.periodId, "short")].filter(Boolean).join(" · ") || "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[380px] truncate" title={e.detail ? JSON.stringify(e.detail) : ""}>{e.detail ? JSON.stringify(e.detail) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {userModal && (
        <Modal title={userModal.user ? `Edit ${userModal.user.name}` : "New user"} onClose={() => setUserModal(null)}>
          <form onSubmit={saveUser} className="space-y-4">
            <ErrorBanner message={modalError} />
            <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Full name</span>
              <input required maxLength={100} value={uf.name} onChange={(e) => setUf({ ...uf, name: e.target.value })} className={input} /></label>
            <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Email</span>
              <input required type="email" maxLength={254} value={uf.email} disabled={!!userModal.user} onChange={(e) => setUf({ ...uf, email: e.target.value })} className={input} /></label>
            <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Role</span>
              <select value={uf.role} disabled={userModal.user?.id === meId || uf.role === "SUPER_ADMIN"} onChange={(e) => setUf({ ...uf, role: e.target.value as Role })} className={input}>
                <option value="ASSEMBLER">Assembler - imports, clears items, signs step 1</option>
                <option value="REVIEWER">Reviewer - signs or rejects step 2</option>
                <option value="APPROVER">Approver - signs or rejects step 3</option>
                <option value="ADMIN">Admin - all entities, administration</option>
                {uf.role === "SUPER_ADMIN" && <option value="SUPER_ADMIN">Super admin</option>}
              </select>
              {userModal.user?.id === meId && <span className="text-[11px] text-slate-500 mt-1 block">You cannot change your own role.</span>}
            </label>
            {!isAdminRole(uf.role) && (
              <div>
                <span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Entities</span>
                <div className="border border-slate-200 rounded-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {entities.map((en) => (
                    <label key={en.code} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={uf.entityCodes.includes(en.code)}
                        onChange={(e) => setUf({ ...uf, entityCodes: e.target.checked ? [...uf.entityCodes, en.code] : uf.entityCodes.filter((c) => c !== en.code) })} />
                      <span className="font-mono font-bold">{en.code}</span><span className="text-slate-500">{en.name}</span>
                    </label>
                  ))}
                </div>
                {!uf.entityCodes.length && <span className="text-[11px] text-amber-600 mt-1 block">Without an entity this user will see nothing.</span>}
              </div>
            )}
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input type="checkbox" checked={uf.isReadOnly} disabled={userModal.user?.id === meId} onChange={(e) => setUf({ ...uf, isReadOnly: e.target.checked })} />
              <span className="text-sm"><b>Read-only</b><span className="block text-xs text-slate-500">Can view, cannot import, clear, attach or sign.</span></span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setUserModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60 flex items-center gap-2">{busy && <Loader2 size={15} className="animate-spin" />}{userModal.user ? "Save changes" : "Create user"}</button>
            </div>
          </form>
        </Modal>
      )}

      {entityModal && (
        <Modal title={entityModal.entity ? `Edit ${entityModal.entity.code}` : "New entity"} onClose={() => setEntityModal(null)}>
          <form onSubmit={saveEntity} className="space-y-4">
            <ErrorBanner message={modalError} />
            <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Entity code</span>
              <input required pattern="[A-Za-z0-9]{6}" title="Exactly 6 letters or digits" maxLength={6} value={ef.code} disabled={!!entityModal.entity || confirmStep}
                onChange={(e) => setEf({ ...ef, code: e.target.value.toUpperCase() })} className={`${input} font-mono uppercase`} placeholder="ABC001" />
              <span className="text-[11px] text-slate-500 mt-1 block">Exactly 6 letters or digits. Permanent once created.</span></label>
            <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Name</span>
              <input required maxLength={100} value={ef.name} disabled={confirmStep} onChange={(e) => setEf({ ...ef, name: e.target.value })} className={input} /></label>
            {entityModal.entity && (
              <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Status</span>
                <select value={ef.status} onChange={(e) => setEf({ ...ef, status: e.target.value })} className={input}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive - no imports, no new assembly</option>
                </select></label>
            )}
            {confirmStep && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex gap-2"><Lock size={16} className="shrink-0 mt-0.5" /> Confirm: entity <b className="font-mono">{ef.code}</b> "{ef.name}". The code cannot be changed later.</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => (confirmStep ? setConfirmStep(false) : setEntityModal(null))} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">{confirmStep ? "Back" : "Cancel"}</button>
              <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60">{entityModal.entity ? "Save" : confirmStep ? "Create entity" : "Continue"}</button>
            </div>
          </form>
        </Modal>
      )}

      {glModal && (
        <Modal wide title={glModal.gl ? `Edit GL ${glModal.gl.id}` : `New GL in ${glModal.entityCode}`} onClose={() => setGlModal(null)}>
          <form onSubmit={saveGl} className="space-y-4">
            <ErrorBanner message={modalError} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">GL number</span>
                <input required pattern="\d{12}" title="Exactly 12 digits" maxLength={12} inputMode="numeric" value={gf.id} disabled={!!glModal.gl || confirmStep}
                  onChange={(e) => setGf({ ...gf, id: e.target.value.replace(/\D/g, "") })} className={`${input} font-mono`} placeholder="100150000000" /></label>
              <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Description</span>
                <input required maxLength={200} value={gf.description} disabled={confirmStep} onChange={(e) => setGf({ ...gf, description: e.target.value })} className={input} /></label>
            </div>
            {glModal.gl && (
              <label className="block"><span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Status</span>
                <select value={gf.status} onChange={(e) => setGf({ ...gf, status: e.target.value })} className={input}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive - no new imports</option>
                </select></label>
            )}
            <div>
              <span className="block text-xs font-semibold text-slate-500 uppercase mb-2">Sub-account dimension labels (optional)</span>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {gf.subNames.map((v, i) => (
                  <input key={i} maxLength={20} value={v} disabled={confirmStep} placeholder={`Sub ${i + 1}`}
                    onChange={(e) => setGf({ ...gf, subNames: gf.subNames.map((s, k) => (k === i ? e.target.value : s)) })} className={`${input} text-xs`} />
                ))}
              </div>
            </div>
            {confirmStep && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex gap-2"><Lock size={16} className="shrink-0 mt-0.5" /> Confirm: GL <b className="font-mono">{gf.id}</b> in {glModal.entityCode}. The number and entity cannot be changed later.</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => (confirmStep ? setConfirmStep(false) : setGlModal(null))} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">{confirmStep ? "Back" : "Cancel"}</button>
              <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60">{glModal.gl ? "Save" : confirmStep ? "Create GL" : "Continue"}</button>
            </div>
          </form>
        </Modal>
      )}

      {secret && (
        <Modal title="Temporary password" onClose={() => { setSecret(null); setCopied(false); }}>
          <p className="text-sm text-slate-600">Give this to <b>{secret.who}</b> through a private channel. It is shown only once, and they must replace it when they first sign in.</p>
          <div className="mt-4 flex items-center gap-2">
            <code className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5 font-mono text-lg tracking-wide select-all">{secret.password}</code>
            <button onClick={() => { navigator.clipboard.writeText(secret.password).then(() => setCopied(true)).catch(() => {}); }}
              className="p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="Copy password">{copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}</button>
          </div>
          <div className="flex justify-end mt-5"><button onClick={() => { setSecret(null); setCopied(false); }} className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg">Done</button></div>
        </Modal>
      )}
    </div>
  );
}
