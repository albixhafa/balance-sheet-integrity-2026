import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/* Server-side sessions.
 *
 * The previous design stored the raw user id in an unsigned cookie, so anyone
 * who learned an id could become that user. Now the cookie holds 256 random
 * bits, the database holds only their SHA-256, and every request resolves the
 * token to a live row. Deleting the row ends the session everywhere at once.
 */

export const SESSION_COOKIE = "bsi_session";
const LEGACY_COOKIE = "session_userid";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // absolute lifetime
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;    // signed out after an hour of inactivity
const TOUCH_EVERY_MS = 5 * 60 * 1000;      // how often lastSeenAt is refreshed

// Scoped to the app so the cookie is never sent to the other sites on the domain.
const COOKIE_PATH = "/balancesheet";

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id: hash(token), userId, expiresAt } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // COOKIE_SECURE=false exists only for the staging container, which is
    // reached over plain HTTP on 127.0.0.1. Production always sends Secure.
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: COOKIE_PATH,
    expires: expiresAt,
  });
  // Drop the old insecure cookie wherever it is still lying around.
  jar.delete({ name: LEGACY_COOKIE, path: "/" });
}

/** Returns the session row for the current request, or null. Expired and idle
 *  sessions are deleted as they are found. */
export async function readSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;

  const session = await prisma.session.findUnique({ where: { id: hash(token) } });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } }).catch(() => {});
  }
  return session;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hash(token) } });
  jar.delete({ name: SESSION_COOKIE, path: COOKIE_PATH });
  jar.delete({ name: LEGACY_COOKIE, path: "/" });
}

/** Signs a user out everywhere, optionally keeping the caller's own session. */
export async function revokeUserSessions(userId: string, keepCurrent = false) {
  let keepId: string | undefined;
  if (keepCurrent) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) keepId = hash(token);
  }
  await prisma.session.deleteMany({ where: { userId, ...(keepId ? { NOT: { id: keepId } } : {}) } });
}
