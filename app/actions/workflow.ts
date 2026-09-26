"use server";

import { prisma } from "@/lib/prisma";
import { AppError, run } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { loadGlContext, lockGl, assertAllowed } from "@/lib/ledger";
import { nextPeriod } from "@/lib/periods";
import { decimalToCents } from "@/lib/money";
import { logEvent } from "@/lib/audit";
import { saveFile, extensionOf, ALLOWED_TYPES, MAX_ATTACHMENT_BYTES } from "@/lib/storage";
import type { Step } from "@/lib/workflow-rules";

/* Every state change on a reconciliation.
 *
 * Each action: authenticates, takes the per-GL lock, reloads the account's
 * state inside the transaction, re-runs the same rules the UI used, and only
 * then writes - with an audit event in the same transaction, so a change and
 * its record can never be separated.
 *
 * The period is never taken from the client. The browser sends the period it
 * was looking at only so a stale screen can be detected ("this account has
 * moved on - reload") instead of acting on the wrong month.
 */

const STEP_SET = new Set(["assembler", "reviewer", "approver"]);
const REASON_MAX = 500;

function assertFresh(expected: string, active: string) {
  if (expected && expected !== active) {
    throw new AppError("This account has changed since you opened it. Reload the page and try again.", "CONFLICT");
  }
}

function cleanIds(ids: unknown, max = 5000): string[] {
  if (!Array.isArray(ids) || !ids.length) throw new AppError("Select at least one line.");
  if (ids.length > max) throw new AppError(`Select at most ${max} lines at a time.`);
  return [...new Set(ids.map(String))];
}


export async function signOff(glId: string, step: Step, expectedPeriod: string) {
  return run("signOff", async () => {
    const me = await requireUser();
    if (!STEP_SET.has(step)) throw new AppError("Unknown step.");
    return prisma.$transaction(async (t) => {
      await lockGl(t, String(glId));
      const c = await loadGlContext(t, me, String(glId));
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.sign[step]);
      const now = new Date();

      if (step === "assembler") {
        await t.accountReconciliation.upsert({
          where: { glId_periodId: { glId: c.gl.id, periodId: c.active } },
          create: { glId: c.gl.id, periodId: c.active, status: "IN_PROGRESS", assemblerId: me.id, assembledAt: now },
          update: { status: "IN_PROGRESS", assemblerId: me.id, assembledAt: now },
        });
        // the period row must exist for the foreign key even if it has no lines yet
        await t.financialPeriod.upsert({ where: { id: c.active }, create: { id: c.active }, update: {} });
      } else if (step === "reviewer") {
        await t.accountReconciliation.update({
          where: { glId_periodId: { glId: c.gl.id, periodId: c.active } },
          data: { reviewerId: me.id, reviewedAt: now },
        });
      } else {
        await t.accountReconciliation.update({
          where: { glId_periodId: { glId: c.gl.id, periodId: c.active } },
          data: { approverId: me.id, approvedAt: now, status: "COMPLETED" },
        });
        // Roll every uncleared line into the next period, remembering where it
        // came from so a reopen can move exactly these lines back.
        const next = nextPeriod(c.active);
        await t.financialPeriod.upsert({ where: { id: next }, create: { id: next }, update: {} });
        const moved = await t.transaction.updateMany({
          where: { glId: c.gl.id, periodId: c.active, cleared: false },
          data: { periodId: next, rolledFromPeriodId: c.active },
        });
        await logEvent(t, { actorId: me.id, action: "ITEMS_ROLLED_FORWARD", entityCode: c.gl.entityCode, glId: c.gl.id, periodId: c.active, detail: { to: next, count: moved.count } });
      }
      await logEvent(t, { actorId: me.id, action: `SIGNED_${step.toUpperCase()}`, entityCode: c.gl.entityCode, glId: c.gl.id, periodId: c.active });
      return null;
    });
  });
}

export async function undoSignOff(glId: string, step: "assembler" | "reviewer", expectedPeriod: string) {
  return run("undoSignOff", async () => {
    const me = await requireUser();
    if (step !== "assembler" && step !== "reviewer") throw new AppError("Final approval is undone by reopening the period.");
    return prisma.$transaction(async (t) => {
      await lockGl(t, String(glId));
      const c = await loadGlContext(t, me, String(glId));
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.unsign[step]);
      const signer = step === "assembler" ? c.rec?.assemblerId : c.rec?.reviewerId;
      await t.accountReconciliation.update({
        where: { glId_periodId: { glId: c.gl.id, periodId: c.active } },
        data: step === "assembler"
          ? { assemblerId: null, assembledAt: null, status: "PENDING" }
          : { reviewerId: null, reviewedAt: null },
      });
      await logEvent(t, { actorId: me.id, action: `UNSIGNED_${step.toUpperCase()}`, entityCode: c.gl.entityCode, glId: c.gl.id, periodId: c.active, targetUserId: signer ?? null });
      return null;
    });
  });
}

/** The reviewer sends it back to assembly; the approver sends it back to the
 *  start. A reason is required and kept. */
export async function rejectReconciliation(glId: string, level: "reviewer" | "approver", reasonRaw: string, expectedPeriod: string) {
  return run("rejectReconciliation", async () => {
    const me = await requireUser();
    if (level !== "reviewer" && level !== "approver") throw new AppError("Unknown step.");
    const reason = String(reasonRaw ?? "").trim().slice(0, REASON_MAX);
    if (reason.length < 5) throw new AppError("Give a reason for the rejection (at least 5 characters).");
    return prisma.$transaction(async (t) => {
      await lockGl(t, String(glId));
      const c = await loadGlContext(t, me, String(glId));
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.reject[level]);
      await t.accountReconciliation.update({
        where: { glId_periodId: { glId: c.gl.id, periodId: c.active } },
        data: level === "reviewer"
          ? { assemblerId: null, assembledAt: null, status: "PENDING" }
          : { assemblerId: null, assembledAt: null, reviewerId: null, reviewedAt: null, status: "PENDING" },
      });
      await logEvent(t, { actorId: me.id, action: `REJECTED_AT_${level.toUpperCase()}`, entityCode: c.gl.entityCode, glId: c.gl.id, periodId: c.active, detail: { reason } });
      return null;
    });
  });
}

/** Admin only. Removes the final approval on the last closed period and moves
 *  back exactly the lines that approval rolled forward, so the data once more
 *  matches the assembly and review signatures that remain. */
export async function reopenPeriod(glId: string, reasonRaw: string, expectedPeriod: string) {
  return run("reopenPeriod", async () => {
    const me = await requireUser();
    const reason = String(reasonRaw ?? "").trim().slice(0, REASON_MAX);
    if (reason.length < 5) throw new AppError("Give a reason for reopening (at least 5 characters).");
    return prisma.$transaction(async (t) => {
      await lockGl(t, String(glId));
      const c = await loadGlContext(t, me, String(glId));
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.reopen);
      const period = c.lastClosed!;
      const moved = await t.transaction.updateMany({
        where: { glId: c.gl.id, periodId: c.active, rolledFromPeriodId: period },
        data: { periodId: period, rolledFromPeriodId: null },
      });
      await t.accountReconciliation.update({
        where: { glId_periodId: { glId: c.gl.id, periodId: period } },
        data: { approverId: null, approvedAt: null, status: "IN_PROGRESS" },
      });
      // An empty, unsigned record for the period that is no longer active
      // would only confuse the history; remove it if that is all it is.
      await t.accountReconciliation.deleteMany({
        where: { glId: c.gl.id, periodId: c.active, assemblerId: null, reviewerId: null, approverId: null },
      });
      await logEvent(t, { actorId: me.id, action: "PERIOD_REOPENED", entityCode: c.gl.entityCode, glId: c.gl.id, periodId: period, detail: { reason, itemsMovedBack: moved.count } });
      return null;
    });
  });
}

/** Mark lines cleared (they must net to $0.00 together) or un-clear them. */
export async function setCleared(glId: string, lineIds: string[], cleared: boolean, expectedPeriod: string) {
  return run("setCleared", async () => {
    const me = await requireUser();
    const ids = cleanIds(lineIds);
    return prisma.$transaction(async (t) => {
      await lockGl(t, String(glId));
      const c = await loadGlContext(t, me, String(glId));
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.editLines);
      const lines = await t.transaction.findMany({ where: { id: { in: ids } }, select: { id: true, glId: true, periodId: true, amount: true, cleared: true } });
      if (lines.length !== ids.length || lines.some((l) => l.glId !== c.gl.id || l.periodId !== c.active)) {
        throw new AppError("Some selected lines are not open in this account's current period. Reload and try again.", "CONFLICT");
      }
      if (cleared) {
        const net = lines.reduce((s, l) => s + decimalToCents(l.amount), 0);
        if (net !== 0) throw new AppError("Selected lines must net to exactly $0.00 to be cleared together.");
      }
      const changed = await t.transaction.updateMany({ where: { id: { in: ids }, cleared: !cleared }, data: { cleared } });
      await logEvent(t, { actorId: me.id, action: cleared ? "LINES_CLEARED" : "LINES_UNCLEARED", entityCode: c.gl.entityCode, glId: c.gl.id, periodId: c.active, detail: { count: changed.count, ids } });
      return { count: changed.count };
    });
  });
}

/** Upload one supporting file and attach it to one or more lines. */
export async function uploadAttachment(form: FormData) {
  return run("uploadAttachment", async () => {
    const me = await requireUser();
    const glId = String(form.get("glId") ?? "");
    const expectedPeriod = String(form.get("expectedPeriod") ?? "");
    const ids = cleanIds(JSON.parse(String(form.get("lineIds") ?? "[]")));
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose a file to attach.");
    if (file.size === 0) throw new AppError("That file is empty.");
    if (file.size > MAX_ATTACHMENT_BYTES) throw new AppError("Attachments can be at most 10 MB.");
    const ext = extensionOf(file.name);
    const mime = ALLOWED_TYPES[ext];
    if (!mime) throw new AppError("Allowed types: PDF, images, CSV, TXT, Excel, Word and email files.");
    const fileName = file.name.replace(/[\u0000-\u001f"\\/]/g, "_").slice(0, 200) || `attachment.${ext}`;

    // Authorise before touching the disk, so a refused request writes nothing.
    await prisma.$transaction(async (t) => {
      const c = await loadGlContext(t, me, glId);
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.attach);
    });

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await saveFile(buf);

    return prisma.$transaction(async (t) => {
      await lockGl(t, glId);
      const c = await loadGlContext(t, me, glId);
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.attach);
      const lines = await t.transaction.findMany({ where: { id: { in: ids } }, select: { glId: true, periodId: true } });
      if (lines.length !== ids.length || lines.some((l) => l.glId !== c.gl.id || l.periodId !== c.active)) {
        throw new AppError("Some selected lines are not open in this account's current period. Reload and try again.", "CONFLICT");
      }
      const att = await t.attachment.create({
        data: { fileName, mimeType: mime, size: buf.length, sha256: stored.sha256, storageKey: stored.key, uploadedById: me.id },
      });
      await t.transaction.updateMany({ where: { id: { in: ids } }, data: { attachmentId: att.id } });
      await logEvent(t, { actorId: me.id, action: "SUPPORT_ATTACHED", entityCode: c.gl.entityCode, glId: c.gl.id, periodId: c.active, detail: { file: fileName, size: buf.length, lines: ids.length } });
      return { attachmentId: att.id };
    });
  });
}

/** Attach an already-uploaded file (from this account) to more lines. */
export async function linkAttachment(glId: string, attachmentId: string, lineIds: string[], expectedPeriod: string) {
  return run("linkAttachment", async () => {
    const me = await requireUser();
    const ids = cleanIds(lineIds);
    return prisma.$transaction(async (t) => {
      await lockGl(t, String(glId));
      const c = await loadGlContext(t, me, String(glId));
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.attach);
      // Only a file already used in this same account may be reused, so this
      // cannot be used to pull another entity's document into view.
      const owned = await t.transaction.count({ where: { glId: c.gl.id, attachmentId: String(attachmentId) } });
      if (!owned) throw new AppError("That file is not attached to this account.", "FORBIDDEN");
      const lines = await t.transaction.findMany({ where: { id: { in: ids } }, select: { glId: true, periodId: true } });
      if (lines.length !== ids.length || lines.some((l) => l.glId !== c.gl.id || l.periodId !== c.active)) {
        throw new AppError("Some selected lines are not open in this account's current period. Reload and try again.", "CONFLICT");
      }
      await t.transaction.updateMany({ where: { id: { in: ids } }, data: { attachmentId: String(attachmentId) } });
      await logEvent(t, { actorId: me.id, action: "SUPPORT_LINKED", entityCode: c.gl.entityCode, glId: c.gl.id, periodId: c.active, detail: { attachmentId, lines: ids.length } });
      return null;
    });
  });
}

export async function removeAttachment(glId: string, lineIds: string[], expectedPeriod: string) {
  return run("removeAttachment", async () => {
    const me = await requireUser();
    const ids = cleanIds(lineIds);
    return prisma.$transaction(async (t) => {
      await lockGl(t, String(glId));
      const c = await loadGlContext(t, me, String(glId));
      assertFresh(expectedPeriod, c.active);
      assertAllowed(c.decisions.attach);
      const res = await t.transaction.updateMany({
        where: { id: { in: ids }, glId: c.gl.id, periodId: c.active },
        data: { attachmentId: null, supportFileUrl: null },
      });
      // The file itself is kept: it may be referenced by an audit event, and
      // evidence that was once attached should not quietly disappear.
      await logEvent(t, { actorId: me.id, action: "SUPPORT_REMOVED", entityCode: c.gl.entityCode, glId: c.gl.id, periodId: c.active, detail: { lines: res.count } });
      return null;
    });
  });
}
