import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { AppError } from "@/lib/errors";

/* Who is calling, and what they may do.
 *
 * Every server action starts with requireUser() or requireAdmin(). Server
 * actions are public HTTP endpoints - anyone can POST to them with any
 * arguments - so hiding a button in the UI protects nothing. These checks are
 * the actual boundary.
 *
 * SAFE_USER_SELECT is the only shape of a user that ever leaves this module.
 * It deliberately excludes passwordHash, which the old code sent to the
 * browser on the admin page and on every account page.
 */

export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  isReadOnly: true,
  isLockedOut: true,
  requiresPasswordChange: true,
  entities: { select: { code: true, name: true, status: true }, orderBy: { code: "asc" as const } },
} as const;

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "ASSEMBLER" | "REVIEWER" | "APPROVER" | "ADMIN" | "SUPER_ADMIN";
  status: "ACTIVE" | "INACTIVE";
  isReadOnly: boolean;
  isLockedOut: boolean;
  requiresPasswordChange: boolean;
  entities: { code: string; name: string; status: "ACTIVE" | "INACTIVE" }[];
};

/** Memoised per request, so a page and the actions it calls share one lookup. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: SAFE_USER_SELECT });
  // A deactivated or locked account loses access on its very next request,
  // not when its cookie happens to expire.
  if (!user || user.status !== "ACTIVE" || user.isLockedOut) return null;
  return user as CurrentUser;
});

export const isAdmin = (u: Pick<CurrentUser, "role">) => u.role === "ADMIN" || u.role === "SUPER_ADMIN";

export async function requireUser(opts: { allowPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Your session has ended. Please sign in again.", "UNAUTHENTICATED");
  if (user.requiresPasswordChange && !opts.allowPasswordChange) {
    throw new AppError("You must set a new password before continuing.", "FORBIDDEN");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new AppError("Administrator access is required.", "FORBIDDEN");
  return user;
}

export function requireWritable(user: CurrentUser) {
  if (user.isReadOnly) throw new AppError("Your account is read-only.", "FORBIDDEN");
}

export function canAccessEntity(user: CurrentUser, entityCode: string) {
  return isAdmin(user) || user.entities.some((e) => e.code === entityCode);
}

export function requireEntityAccess(user: CurrentUser, entityCode: string) {
  if (!canAccessEntity(user, entityCode)) {
    // Same message whether or not the entity exists, so ids cannot be probed.
    throw new AppError("You do not have access to that account.", "FORBIDDEN");
  }
}
