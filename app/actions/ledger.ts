"use server";

import { prisma } from "@/lib/prisma";
import { run } from "@/lib/errors";
import { requireUser, requireEntityAccess, isAdmin } from "@/lib/auth";
import { loadGlContext } from "@/lib/ledger";
import { resolvePeriods } from "@/lib/periods";
import { decimalToCents } from "@/lib/money";

/* Read-only views. Each one checks the caller may see what it returns. */

export async function getMyEntities() {
  return run("getMyEntities", async () => {
    const me = await requireUser();
    if (isAdmin(me)) {
      return prisma.entity.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true, status: true } });
    }
    return me.entities;
  });
}

const signedBy = (id: string | null, at: Date | null, names: Map<string, string>) =>
  id ? { name: names.get(id) ?? "Former user", at: at ? at.toISOString() : null } : null;

async function nameMap(ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter(Boolean))] as string[];
  if (!list.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

function stageOf(rec: { assemblerId: string | null; reviewerId: string | null; approverId: string | null } | null | undefined) {
  if (!rec || !rec.assemblerId) return "OPEN" as const;
  if (!rec.reviewerId) return "ASSEMBLED" as const;
  if (!rec.approverId) return "REVIEWED" as const;
  return "APPROVED" as const;
}

/** Dashboard: one row per GL in an entity. */
export async function getEntityBalances(entityCode: string) {
  return run("getEntityBalances", async () => {
    const me = await requireUser();
    requireEntityAccess(me, String(entityCode));
    const gls = await prisma.gLAccount.findMany({
      where: { entityCode: String(entityCode) },
      orderBy: { id: "asc" },
      select: { id: true, description: true, status: true, reconciliations: true },
    });
    // One grouped query for every GL's per-period totals and counts, instead of
    // loading every transaction row into memory as before.
    const grouped = await prisma.transaction.groupBy({
      by: ["glId", "periodId", "cleared"],
      where: { glId: { in: gls.map((g) => g.id) } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return gls.map((gl) => {
      const rows = grouped.filter((g) => g.glId === gl.id);
      const { lastClosed, active } = resolvePeriods([...new Set(rows.map((r) => r.periodId))], gl.reconciliations);
      const inActive = rows.filter((r) => r.periodId === active);
      const balanceCents = inActive.reduce((s, r) => s + decimalToCents(r._sum.amount ?? 0), 0);
      const openItems = inActive.filter((r) => !r.cleared).reduce((s, r) => s + r._count._all, 0);
      const rec = gl.reconciliations.find((r) => r.periodId === active);
      return { glId: gl.id, description: gl.description, status: gl.status, lastClosed, activePeriod: active, balanceCents, openItems, stage: stageOf(rec) };
    });
  });
}

/** Close status across every entity the caller can see. */
export async function getCloseStatus() {
  return run("getCloseStatus", async () => {
    const me = await requireUser();
    const codes = isAdmin(me)
      ? (await prisma.entity.findMany({ select: { code: true } })).map((e) => e.code)
      : me.entities.map((e) => e.code);
    const gls = await prisma.gLAccount.findMany({
      where: { entityCode: { in: codes } },
      orderBy: [{ entityCode: "asc" }, { id: "asc" }],
      select: { id: true, description: true, status: true, entityCode: true, entity: { select: { name: true } }, reconciliations: true },
    });
    const grouped = await prisma.transaction.groupBy({
      by: ["glId", "periodId", "cleared"],
      where: { glId: { in: gls.map((g) => g.id) } },
      _count: { _all: true },
    });
    const missingSupport = await prisma.transaction.groupBy({
      by: ["glId", "periodId"],
      where: { glId: { in: gls.map((g) => g.id) }, cleared: false, attachmentId: null },
      _count: { _all: true },
    });
    const names = await nameMap(gls.flatMap((g) => g.reconciliations.flatMap((r) => [r.assemblerId, r.reviewerId, r.approverId])));

    return gls.map((gl) => {
      const rows = grouped.filter((g) => g.glId === gl.id);
      const { lastClosed, active } = resolvePeriods([...new Set(rows.map((r) => r.periodId))], gl.reconciliations);
      const rec = gl.reconciliations.find((r) => r.periodId === active) ?? null;
      const open = rows.filter((r) => r.periodId === active && !r.cleared).reduce((s, r) => s + r._count._all, 0);
      const noSupport = missingSupport.find((m) => m.glId === gl.id && m.periodId === active)?._count._all ?? 0;
      const lastSig = rec ? [rec.approvedAt, rec.reviewedAt, rec.assembledAt].find(Boolean) ?? null : null;
      return {
        entityCode: gl.entityCode, entityName: gl.entity.name,
        glId: gl.id, description: gl.description, glStatus: gl.status,
        activePeriod: active, lastClosed, stage: stageOf(rec), openItems: open, missingSupport: noSupport,
        assembler: signedBy(rec?.assemblerId ?? null, rec?.assembledAt ?? null, names),
        reviewer: signedBy(rec?.reviewerId ?? null, rec?.reviewedAt ?? null, names),
        lastActivity: lastSig ? lastSig.toISOString() : null,
      };
    });
  });
}

const txnView = (t: {
  id: string; txnDate: string; reference: string | null; description: string | null; amount: { toFixed: (n: number) => string };
  cleared: boolean; supportFileUrl: string | null; rolledFromPeriodId: string | null;
  sub1Value: string | null; sub2Value: string | null; sub3Value: string | null; sub4Value: string | null; sub5Value: string | null;
  sub6Value: string | null; sub7Value: string | null; sub8Value: string | null; sub9Value: string | null; sub10Value: string | null;
  attachment: { id: string; fileName: string; size: number } | null;
}) => ({
  id: t.id, txnDate: t.txnDate, reference: t.reference, description: t.description,
  amountCents: decimalToCents(t.amount), cleared: t.cleared, rolledFrom: t.rolledFromPeriodId,
  subs: [t.sub1Value, t.sub2Value, t.sub3Value, t.sub4Value, t.sub5Value, t.sub6Value, t.sub7Value, t.sub8Value, t.sub9Value, t.sub10Value],
  attachment: t.attachment,
  // Pre-upload rows stored only a file name; shown as such, never as a link.
  legacyFileName: t.attachment ? null : t.supportFileUrl,
});

const TXN_SELECT = {
  id: true, txnDate: true, reference: true, description: true, amount: true, cleared: true, supportFileUrl: true, rolledFromPeriodId: true,
  sub1Value: true, sub2Value: true, sub3Value: true, sub4Value: true, sub5Value: true,
  sub6Value: true, sub7Value: true, sub8Value: true, sub9Value: true, sub10Value: true,
  attachment: { select: { id: true, fileName: true, size: true } },
} as const;

/** The account page: active period lines, signatures, what the caller may do,
 *  closed-period history and the audit trail. */
export async function getAccountDetails(glId: string) {
  return run("getAccountDetails", async () => {
    const me = await requireUser();
    const ctx = await loadGlContext(prisma, me, String(glId));
    const { gl, recs, rec, active, lastClosed, decisions } = ctx;

    const [current, closedTxns, futureCount, events] = await Promise.all([
      prisma.transaction.findMany({ where: { glId: gl.id, periodId: active }, select: TXN_SELECT, orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }] }),
      prisma.transaction.findMany({
        where: { glId: gl.id, periodId: { in: recs.filter((r) => r.status === "COMPLETED").map((r) => r.periodId) } },
        select: { ...TXN_SELECT, periodId: true }, orderBy: [{ txnDate: "asc" }],
      }),
      prisma.transaction.count({ where: { glId: gl.id, periodId: { gt: active } } }),
      prisma.auditEvent.findMany({
        where: { glId: gl.id }, orderBy: { at: "desc" }, take: 100,
        include: { actor: { select: { name: true } } },
      }),
    ]);

    const names = await nameMap(recs.flatMap((r) => [r.assemblerId, r.reviewerId, r.approverId]));
    const history = recs
      .filter((r) => r.status === "COMPLETED")
      .sort((a, b) => b.periodId.localeCompare(a.periodId))
      .map((r) => ({
        periodId: r.periodId,
        assembler: signedBy(r.assemblerId, r.assembledAt, names),
        reviewer: signedBy(r.reviewerId, r.reviewedAt, names),
        approver: signedBy(r.approverId, r.approvedAt, names),
        lines: closedTxns.filter((t) => t.periodId === r.periodId).map(txnView),
      }));

    return {
      me: { id: me.id, name: me.name, role: me.role, isReadOnly: me.isReadOnly, isAdmin: isAdmin(me) },
      gl: {
        id: gl.id, description: gl.description, status: gl.status,
        entityCode: gl.entityCode, entityName: gl.entity.name, entityStatus: gl.entity.status,
        subNames: [gl.sub1Name, gl.sub2Name, gl.sub3Name, gl.sub4Name, gl.sub5Name, gl.sub6Name, gl.sub7Name, gl.sub8Name, gl.sub9Name, gl.sub10Name],
      },
      activePeriod: active,
      lastClosed,
      clearedNetCents: ctx.clearedNetCents,
      signatures: {
        assembler: signedBy(rec?.assemblerId ?? null, rec?.assembledAt ?? null, names),
        reviewer: signedBy(rec?.reviewerId ?? null, rec?.reviewedAt ?? null, names),
        approver: signedBy(rec?.approverId ?? null, rec?.approvedAt ?? null, names),
      },
      decisions,
      lines: current.map(txnView),
      futureCount,
      history,
      events: events.map((e) => ({ id: e.id, at: e.at.toISOString(), action: e.action, actor: e.actor?.name ?? "System", periodId: e.periodId, detail: e.detail })),
    };
  });
}
