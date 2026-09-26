"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AppError, run } from "@/lib/errors";
import { requireAdmin, SAFE_USER_SELECT, type CurrentUser } from "@/lib/auth";
import { revokeUserSessions } from "@/lib/session";
import { generateTempPassword, BCRYPT_ROUNDS } from "@/lib/password";
import { logEvent } from "@/lib/audit";

/* Administration.
 *
 * Every export starts with requireAdmin(). In the previous version none of
 * these checked the caller at all, so anyone on the internet could create an
 * admin account or reset any password and be handed the new one.
 */

const ASSIGNABLE_ROLES = ["ASSEMBLER", "REVIEWER", "APPROVER", "ADMIN"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ENTITY_RE = /^[A-Z0-9]{6}$/;
const GL_RE = /^\d{12}$/;
const SUB_LABEL_RE = /^[A-Za-z0-9 _/-]{1,20}$/;

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

function assertRole(role: unknown): AssignableRole {
  if (!ASSIGNABLE_ROLES.includes(role as AssignableRole)) throw new AppError("Choose a valid role.");
  return role as AssignableRole;
}

/** Only a super admin may change a super admin. */
function assertCanManage(actor: CurrentUser, target: { role: string }) {
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new AppError("Only a super admin can change this account.", "FORBIDDEN");
  }
}

async function validEntityCodes(codes: unknown): Promise<string[]> {
  const list = Array.isArray(codes) ? [...new Set(codes.map((c) => String(c).toUpperCase()))] : [];
  if (!list.length) return [];
  const found = await prisma.entity.findMany({ where: { code: { in: list } }, select: { code: true } });
  if (found.length !== list.length) throw new AppError("One of the selected entities no longer exists. Reload and try again.");
  return list;
}

// ---------- reads ----------

export async function getAdminData() {
  return run("getAdminData", async () => {
    const me = await requireAdmin();
    const [users, entities] = await Promise.all([
      prisma.user.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }], select: { ...SAFE_USER_SELECT, createdAt: true } }),
      prisma.entity.findMany({
        orderBy: { code: "asc" },
        select: {
          code: true, name: true, status: true,
          glAccounts: {
            orderBy: { id: "asc" },
            select: {
              id: true, description: true, status: true,
              sub1Name: true, sub2Name: true, sub3Name: true, sub4Name: true, sub5Name: true,
              sub6Name: true, sub7Name: true, sub8Name: true, sub9Name: true, sub10Name: true,
              _count: { select: { transactions: true } },
            },
          },
        },
      }),
    ]);
    return {
      meId: me.id,
      users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
      entities: entities.map((e) => ({
        ...e,
        glAccounts: e.glAccounts.map((g) => ({
          id: g.id, description: g.description, status: g.status, txnCount: g._count.transactions,
          subNames: [g.sub1Name, g.sub2Name, g.sub3Name, g.sub4Name, g.sub5Name, g.sub6Name, g.sub7Name, g.sub8Name, g.sub9Name, g.sub10Name],
        })),
      })),
    };
  });
}

export async function getAuditLog(limit = 200) {
  return run("getAuditLog", async () => {
    await requireAdmin();
    const events = await prisma.auditEvent.findMany({
      orderBy: { at: "desc" },
      take: Math.min(Math.max(1, Number(limit) || 200), 1000),
      include: { actor: { select: { name: true, email: true } } },
    });
    const targetIds = [...new Set(events.map((e) => e.targetUserId).filter(Boolean))] as string[];
    const targets = await prisma.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } });
    const tmap = new Map(targets.map((t) => [t.id, t.name]));
    return events.map((e) => ({
      id: e.id, at: e.at.toISOString(), action: e.action,
      actor: e.actor ? e.actor.name : "System",
      target: e.targetUserId ? tmap.get(e.targetUserId) ?? "(deleted user)" : null,
      entityCode: e.entityCode, glId: e.glId, periodId: e.periodId, detail: e.detail,
    }));
  });
}

// ---------- users ----------

export async function createUser(input: { name: string; email: string; role: string; isReadOnly: boolean; entityCodes: string[] }) {
  return run("createUser", async () => {
    const me = await requireAdmin();
    const name = clean(input.name, 100);
    const email = clean(input.email, 254).toLowerCase();
    const role = assertRole(input.role);
    if (!name) throw new AppError("Name is required.");
    if (!EMAIL_RE.test(email)) throw new AppError("Enter a valid email address.");
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new AppError("A user with that email already exists.");
    const codes = role === "ADMIN" ? [] : await validEntityCodes(input.entityCodes);

    const tempPassword = generateTempPassword();
    const user = await prisma.user.create({
      data: {
        name, email, role, isReadOnly: Boolean(input.isReadOnly),
        passwordHash: await bcrypt.hash(tempPassword, BCRYPT_ROUNDS),
        requiresPasswordChange: true, status: "ACTIVE",
        entities: { connect: codes.map((code) => ({ code })) },
      },
      select: { id: true },
    });
    await logEvent(prisma, { actorId: me.id, action: "USER_CREATED", targetUserId: user.id, detail: { email, role, entities: codes, readOnly: Boolean(input.isReadOnly) } });
    return { tempPassword };
  });
}

export async function updateUser(userId: string, input: { name: string; role: string; isReadOnly: boolean; entityCodes: string[] }) {
  return run("updateUser", async () => {
    const me = await requireAdmin();
    const target = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, role: true, isReadOnly: true, name: true } });
    if (!target) throw new AppError("That user no longer exists.", "NOT_FOUND");
    assertCanManage(me, target);
    const name = clean(input.name, 100);
    if (!name) throw new AppError("Name is required.");
    const role = target.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : assertRole(input.role);
    const isReadOnly = Boolean(input.isReadOnly);

    // An admin cannot lock themselves out by accident.
    if (target.id === me.id && (role !== me.role || isReadOnly !== target.isReadOnly)) {
      throw new AppError("You cannot change your own role or read-only setting. Ask another admin.");
    }
    const codes = role === "ADMIN" || role === "SUPER_ADMIN" ? [] : await validEntityCodes(input.entityCodes);

    await prisma.user.update({
      where: { id: target.id },
      data: { name, role, isReadOnly, entities: { set: codes.map((code) => ({ code })) } },
    });
    await logEvent(prisma, { actorId: me.id, action: "USER_UPDATED", targetUserId: target.id, detail: { name, role, readOnly: isReadOnly, entities: codes } });
    return null;
  });
}

export async function setUserStatus(userId: string, status: "ACTIVE" | "INACTIVE") {
  return run("setUserStatus", async () => {
    const me = await requireAdmin();
    if (status !== "ACTIVE" && status !== "INACTIVE") throw new AppError("Invalid status.");
    const target = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, role: true } });
    if (!target) throw new AppError("That user no longer exists.", "NOT_FOUND");
    if (target.id === me.id) throw new AppError("You cannot deactivate your own account.");
    assertCanManage(me, target);

    await prisma.user.update({ where: { id: target.id }, data: { status } });
    if (status === "INACTIVE") await revokeUserSessions(target.id);
    await logEvent(prisma, { actorId: me.id, action: status === "ACTIVE" ? "USER_REACTIVATED" : "USER_DEACTIVATED", targetUserId: target.id });
    return null;
  });
}

/** Works for any user, not only locked ones - someone who simply forgot their
 *  password needs this too. Signs the user out everywhere. */
export async function resetUserPassword(userId: string) {
  return run("resetUserPassword", async () => {
    const me = await requireAdmin();
    const target = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, role: true } });
    if (!target) throw new AppError("That user no longer exists.", "NOT_FOUND");
    if (target.id === me.id) throw new AppError("Change your own password from your profile page.");
    assertCanManage(me, target);

    const tempPassword = generateTempPassword();
    await prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash: await bcrypt.hash(tempPassword, BCRYPT_ROUNDS),
        requiresPasswordChange: true, failedLoginAttempts: 0, isLockedOut: false,
      },
    });
    await revokeUserSessions(target.id);
    await logEvent(prisma, { actorId: me.id, action: "PASSWORD_RESET", targetUserId: target.id });
    return { tempPassword };
  });
}

export async function unlockUser(userId: string) {
  return run("unlockUser", async () => {
    const me = await requireAdmin();
    const target = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, role: true } });
    if (!target) throw new AppError("That user no longer exists.", "NOT_FOUND");
    assertCanManage(me, target);
    await prisma.user.update({ where: { id: target.id }, data: { isLockedOut: false, failedLoginAttempts: 0 } });
    await logEvent(prisma, { actorId: me.id, action: "USER_UNLOCKED", targetUserId: target.id });
    return null;
  });
}

// ---------- entities ----------

export async function createEntity(codeRaw: string, nameRaw: string) {
  return run("createEntity", async () => {
    const me = await requireAdmin();
    const code = clean(codeRaw, 6).toUpperCase();
    const name = clean(nameRaw, 100);
    if (!ENTITY_RE.test(code)) throw new AppError("Entity code must be exactly 6 letters or digits, e.g. ABC001.");
    if (!name) throw new AppError("Entity name is required.");
    if (await prisma.entity.findUnique({ where: { code }, select: { id: true } })) throw new AppError(`Entity ${code} already exists.`);
    await prisma.entity.create({ data: { code, name, status: "ACTIVE" } });
    await logEvent(prisma, { actorId: me.id, action: "ENTITY_CREATED", entityCode: code, detail: { name } });
    return null;
  });
}

export async function updateEntity(code: string, input: { name: string; status: "ACTIVE" | "INACTIVE" }) {
  return run("updateEntity", async () => {
    const me = await requireAdmin();
    const entity = await prisma.entity.findUnique({ where: { code: String(code) } });
    if (!entity) throw new AppError("That entity no longer exists.", "NOT_FOUND");
    const name = clean(input.name, 100);
    if (!name) throw new AppError("Entity name is required.");
    if (input.status !== "ACTIVE" && input.status !== "INACTIVE") throw new AppError("Invalid status.");
    await prisma.entity.update({ where: { code: entity.code }, data: { name, status: input.status } });
    await logEvent(prisma, { actorId: me.id, action: "ENTITY_UPDATED", entityCode: entity.code, detail: { name, status: input.status } });
    return null;
  });
}

// ---------- GL accounts ----------

function cleanSubNames(subs: unknown): (string | null)[] {
  const arr = Array.isArray(subs) ? subs : [];
  return Array.from({ length: 10 }, (_, i) => {
    const v = clean(arr[i], 20);
    if (!v) return null;
    if (!SUB_LABEL_RE.test(v)) throw new AppError(`Dimension ${i + 1} label may use letters, digits, spaces, _ / - only (max 20).`);
    return v;
  });
}
const subData = (s: (string | null)[]) => ({
  sub1Name: s[0], sub2Name: s[1], sub3Name: s[2], sub4Name: s[3], sub5Name: s[4],
  sub6Name: s[5], sub7Name: s[6], sub8Name: s[7], sub9Name: s[8], sub10Name: s[9],
});

export async function createGLAccount(entityCode: string, input: { id: string; description: string; subNames: string[] }) {
  return run("createGLAccount", async () => {
    const me = await requireAdmin();
    const entity = await prisma.entity.findUnique({ where: { code: String(entityCode) } });
    if (!entity) throw new AppError("That entity no longer exists.", "NOT_FOUND");
    const id = clean(input.id, 12);
    const description = clean(input.description, 200);
    if (!GL_RE.test(id)) throw new AppError("GL number must be exactly 12 digits.");
    if (!description) throw new AppError("GL description is required.");
    const existing = await prisma.gLAccount.findUnique({ where: { id }, select: { entityCode: true } });
    if (existing) throw new AppError(`GL ${id} already exists${existing.entityCode === entity.code ? "" : ` under entity ${existing.entityCode}`}. GL numbers are unique across all entities.`);
    const subs = cleanSubNames(input.subNames);
    await prisma.gLAccount.create({ data: { id, description, entityCode: entity.code, status: "ACTIVE", ...subData(subs) } });
    await logEvent(prisma, { actorId: me.id, action: "GL_CREATED", entityCode: entity.code, glId: id, detail: { description, subs } });
    return null;
  });
}

/** The GL number and its entity are permanent; the description, dimension
 *  labels and status can be corrected. */
export async function updateGLAccount(glId: string, input: { description: string; subNames: string[]; status: "ACTIVE" | "INACTIVE" }) {
  return run("updateGLAccount", async () => {
    const me = await requireAdmin();
    const gl = await prisma.gLAccount.findUnique({ where: { id: String(glId) } });
    if (!gl) throw new AppError("That GL account no longer exists.", "NOT_FOUND");
    const description = clean(input.description, 200);
    if (!description) throw new AppError("GL description is required.");
    if (input.status !== "ACTIVE" && input.status !== "INACTIVE") throw new AppError("Invalid status.");
    const subs = cleanSubNames(input.subNames);
    await prisma.gLAccount.update({ where: { id: gl.id }, data: { description, status: input.status, ...subData(subs) } });
    await logEvent(prisma, { actorId: me.id, action: "GL_UPDATED", entityCode: gl.entityCode, glId: gl.id, detail: { description, status: input.status, subs } });
    return null;
  });
}
