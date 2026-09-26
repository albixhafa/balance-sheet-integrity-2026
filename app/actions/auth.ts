"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { run } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { createSession, destroyCurrentSession, revokeUserSessions } from "@/lib/session";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { passwordProblem, BCRYPT_ROUNDS } from "@/lib/password";
import { logEvent } from "@/lib/audit";

const MAX_FAILED_ATTEMPTS = 5;
// A real bcrypt hash of a random string, made once per process. Comparing
// against it when the email does not exist makes a miss take as long as a
// wrong password, so response time does not reveal which emails have accounts.
// It has to be generated rather than pasted in: bcrypt rejects a malformed
// hash instantly, which would bring the timing difference straight back.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(18).toString("hex"), BCRYPT_ROUNDS);

export async function login(emailRaw: string, password: string) {
  return run("login", async () => {
    const email = String(emailRaw ?? "").trim().toLowerCase();
    if (!email || !password) throw new AppError("Email and password are required.");
    if (email.length > 254 || password.length > 200) throw new AppError("Invalid email or password.");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new AppError("Invalid email or password.");
    }
    if (user.isLockedOut) {
      throw new AppError("This account is locked after too many failed attempts. Ask an administrator to reset it.");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      // Increment in the database, not from a value read earlier, so parallel
      // guesses cannot each see "4 attempts" and all slip through.
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 } },
        select: { failedLoginAttempts: true },
      });
      if (updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        await prisma.user.update({ where: { id: user.id }, data: { isLockedOut: true } });
        await revokeUserSessions(user.id);
        await logEvent(prisma, { actorId: null, action: "ACCOUNT_LOCKED", targetUserId: user.id });
        throw new AppError("This account is now locked after too many failed attempts. Ask an administrator to reset it.");
      }
      const left = MAX_FAILED_ATTEMPTS - updated.failedLoginAttempts;
      throw new AppError(`Invalid email or password. ${left} attempt${left === 1 ? "" : "s"} left before the account locks.`);
    }

    // Only revealed to someone who knows the password.
    if (user.status !== "ACTIVE") throw new AppError("This account has been deactivated. Contact an administrator.");

    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0 } });
    await createSession(user.id);
    await logEvent(prisma, { actorId: user.id, action: "LOGIN" });
    return { redirectTo: user.requiresPasswordChange ? "/change-password" : "/" };
  });
}

export async function logout() {
  return run("logout", async () => {
    await destroyCurrentSession();
    return null;
  });
}

/** The signed-in user in the safe shape, for client pages. Null when signed out. */
export async function getMe() {
  return run("getMe", async () => getCurrentUser());
}

/** Voluntary change from the profile page: requires the current password, and
 *  signs out every other browser. */
export async function changePassword(currentPassword: string, newPassword: string) {
  return run("changePassword", async () => {
    const me = await requireUser();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await bcrypt.compare(String(currentPassword ?? ""), row.passwordHash))) {
      throw new AppError("Your current password is incorrect.");
    }
    const problem = passwordProblem(newPassword, me.email);
    if (problem) throw new AppError(problem);
    if (await bcrypt.compare(newPassword, row.passwordHash)) throw new AppError("Choose a password different from your current one.");

    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), requiresPasswordChange: false },
    });
    await revokeUserSessions(me.id, true);
    await logEvent(prisma, { actorId: me.id, action: "PASSWORD_CHANGED" });
    return null;
  });
}

/** The forced change after a temporary password. The temporary password was
 *  just used to sign in, so it is not asked for again - but it cannot be reused. */
export async function completeRequiredPasswordChange(newPassword: string, confirmPassword: string) {
  return run("completeRequiredPasswordChange", async () => {
    const me = await requireUser({ allowPasswordChange: true });
    if (!me.requiresPasswordChange) return null;
    if (newPassword !== confirmPassword) throw new AppError("The passwords do not match.");
    const problem = passwordProblem(newPassword, me.email);
    if (problem) throw new AppError(problem);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (await bcrypt.compare(newPassword, row.passwordHash)) throw new AppError("Choose a password different from the temporary one.");

    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), requiresPasswordChange: false },
    });
    await revokeUserSessions(me.id, true);
    await logEvent(prisma, { actorId: me.id, action: "PASSWORD_SET" });
    return null;
  });
}
