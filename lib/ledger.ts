import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireEntityAccess, type CurrentUser } from "@/lib/auth";
import { resolvePeriods } from "@/lib/periods";
import { decimalToCents } from "@/lib/money";
import { evaluate } from "@/lib/workflow-rules";

type Db = Prisma.TransactionClient | typeof prisma;

/** Serialises every state change on one GL account. Two approvers clicking at
 *  the same moment, or an import landing mid-sign-off, queue behind each other
 *  instead of interleaving. Held until the surrounding transaction ends. */
export async function lockGl(tx: Prisma.TransactionClient, glId: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"gl:" + glId}))`;
}

/** Everything the rules need to know about one GL, read in a consistent way.
 *  Also enforces that the caller may see this GL at all. */
export async function loadGlContext(db: Db, user: CurrentUser, glId: string) {
  const gl = await db.gLAccount.findUnique({
    where: { id: String(glId) },
    include: { entity: { select: { code: true, name: true, status: true } } },
  });
  if (!gl) throw new AppError("You do not have access to that account.", "FORBIDDEN");
  requireEntityAccess(user, gl.entityCode);

  const [recs, periodRows] = await Promise.all([
    db.accountReconciliation.findMany({ where: { glId: gl.id } }),
    db.transaction.findMany({ where: { glId: gl.id }, distinct: ["periodId"], select: { periodId: true } }),
  ]);
  const { lastClosed, active } = resolvePeriods(periodRows.map((p) => p.periodId), recs);
  const rec = recs.find((r) => r.periodId === active) ?? null;

  const cleared = await db.transaction.findMany({ where: { glId: gl.id, periodId: active, cleared: true }, select: { amount: true } });
  const clearedNetCents = cleared.reduce((s, t) => s + decimalToCents(t.amount), 0);

  const rolledItemsTouched = lastClosed
    ? (await db.transaction.count({ where: { glId: gl.id, periodId: active, rolledFromPeriodId: lastClosed, cleared: true } })) > 0
    : false;

  const decisions = evaluate({
    actor: { id: user.id, role: user.role, isReadOnly: user.isReadOnly },
    rec,
    clearedNetCents,
    entityActive: gl.entity.status === "ACTIVE",
    lastClosed,
    activeHasSignatures: Boolean(rec && (rec.assemblerId || rec.reviewerId || rec.approverId)),
    rolledItemsTouched,
  });

  return { gl, recs, rec, lastClosed, active, clearedNetCents, decisions };
}

export function assertAllowed(d: { allowed: boolean; reason?: string }) {
  if (!d.allowed) throw new AppError(d.reason || "That action is not allowed.", "FORBIDDEN");
}
