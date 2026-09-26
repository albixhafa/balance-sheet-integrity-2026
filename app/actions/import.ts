"use server";

import { prisma } from "@/lib/prisma";
import { AppError, run } from "@/lib/errors";
import { requireUser, requireWritable, canAccessEntity, isAdmin } from "@/lib/auth";
import { lockGl } from "@/lib/ledger";
import { PERIOD_RE, isValidTxnDate, resolvePeriods } from "@/lib/periods";
import { parseAmountToCents, centsToDecimalString, decimalToCents } from "@/lib/money";
import { formatPeriod } from "@/lib/format";
import { logEvent } from "@/lib/audit";

/* GL activity import.
 *
 * The browser only splits the CSV into cells. Every rule is enforced here,
 * because the browser is not a place any rule can be enforced. The whole file
 * is validated before anything is written; if any row is wrong, nothing is
 * imported and every problem is reported with its row number. A partial load
 * of a ledger file is worse than no load - it looks finished and is not.
 *
 * Columns (no header): entity, period YYYYMM, date YYYYMMDD, reference,
 * description, GL, amount, then up to 10 sub-account values.
 */

// Not exported: a "use server" module may only export async functions.
const MAX_ROWS = 5000;

type RowError = { row: number; message: string };

export async function importLedger(rawRows: unknown, fileName: string) {
  return run("importLedger", async () => {
    const me = await requireUser();
    requireWritable(me);
    if (!(isAdmin(me) || me.role === "ASSEMBLER")) throw new AppError("Only Assemblers and Admins can import activity.", "FORBIDDEN");
    if (!Array.isArray(rawRows) || rawRows.length === 0) throw new AppError("The file has no rows.");
    if (rawRows.length > MAX_ROWS + 1) throw new AppError(`A single import can hold at most ${MAX_ROWS.toLocaleString()} rows. Split the file.`);

    let rows = rawRows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []));
    let headerSkipped = false;
    // A header row is tolerated rather than reported as 1 bad row: if the
    // first row's amount is not a number but the second row's is, it is one.
    if (rows.length > 1 && parseAmountToCents(rows[0][6] ?? "") === null && parseAmountToCents(rows[1][6] ?? "") !== null) {
      rows = rows.slice(1);
      headerSkipped = true;
    }
    const rowNo = (i: number) => i + 1 + (headerSkipped ? 1 : 0);

    // Reference data for every entity and GL named in the file, in two queries.
    const entityCodes = [...new Set(rows.map((r) => (r[0] ?? "").toUpperCase()).filter(Boolean))];
    const glIds = [...new Set(rows.map((r) => r[5] ?? "").filter(Boolean))];
    const [entities, gls] = await Promise.all([
      prisma.entity.findMany({ where: { code: { in: entityCodes } }, select: { code: true, status: true } }),
      prisma.gLAccount.findMany({ where: { id: { in: glIds } }, select: { id: true, entityCode: true, status: true, reconciliations: { select: { periodId: true, status: true } } } }),
    ]);
    const entityMap = new Map(entities.map((e) => [e.code, e]));
    const glMap = new Map(gls.map((g) => [g.id, g]));
    const lastClosedByGl = new Map(gls.map((g) => [g.id, resolvePeriods([], g.reconciliations).lastClosed]));

    const errors: RowError[] = [];
    const valid: {
      row: number; entityCode: string; periodId: string; txnDate: string; reference: string | null;
      description: string | null; glId: string; cents: number; subs: (string | null)[];
    }[] = [];

    rows.forEach((r, i) => {
      const n = rowNo(i);
      const fail = (message: string) => errors.push({ row: n, message });
      if (r.every((c) => c === "")) return; // blank line
      if (r.length < 7) return fail(`Has ${r.length} columns; at least 7 are required.`);
      if (r.length > 17) return fail(`Has ${r.length} columns; at most 17 are allowed.`);

      const [entRaw, period, date, ref, desc, glId, amountRaw, ...subsRaw] = r;
      const entityCode = entRaw.toUpperCase();
      const entity = entityMap.get(entityCode);
      if (!entityCode) return fail("Entity code is missing.");
      if (!entity || !canAccessEntity(me, entityCode)) return fail(`Entity "${entRaw}" does not exist or is not assigned to you.`);
      if (entity.status !== "ACTIVE") return fail(`Entity ${entityCode} is inactive.`);
      if (!PERIOD_RE.test(period)) return fail(`Period "${period}" must be YYYYMM, e.g. 202604.`);
      if (!isValidTxnDate(date)) return fail(`Transaction date "${date}" must be a real date in YYYYMMDD form.`);
      const gl = glMap.get(glId);
      if (!gl) return fail(`GL "${glId}" does not exist.`);
      if (gl.entityCode !== entityCode) return fail(`GL ${glId} belongs to entity ${gl.entityCode}, not ${entityCode}.`);
      if (gl.status !== "ACTIVE") return fail(`GL ${glId} is inactive.`);
      const lastClosed = lastClosedByGl.get(glId);
      if (lastClosed && period <= lastClosed) return fail(`${formatPeriod(period)} is closed for GL ${glId} (approved through ${formatPeriod(lastClosed)}).`);
      const cents = parseAmountToCents(amountRaw);
      if (cents === null) return fail(`Amount "${amountRaw}" is not a valid amount. Use e.g. 1234.56, -1,234.56 or (1,234.56).`);
      if (ref.length > 100) return fail("Reference is longer than 100 characters.");
      if (desc.length > 500) return fail("Description is longer than 500 characters.");
      const subs = Array.from({ length: 10 }, (_, k) => (subsRaw[k] ? subsRaw[k].toUpperCase() : null));
      const longSub = subs.findIndex((s) => s && s.length > 50);
      if (longSub !== -1) return fail(`Sub-account ${longSub + 1} is longer than 50 characters.`);

      valid.push({ row: n, entityCode, periodId: period, txnDate: date, reference: ref || null, description: desc || null, glId, cents, subs });
    });

    if (errors.length) {
      return { imported: 0, duplicates: [] as number[], errors: errors.slice(0, 200), errorCount: errors.length, headerSkipped, rejected: true };
    }
    if (!valid.length) throw new AppError("The file has no data rows.");

    // Duplicates: the same entity, GL, date, reference and amount as a line
    // already in the ledger, or earlier in this same file. The database's
    // unique constraint cannot catch lines without a reference (NULLs never
    // compare equal), so this check is done explicitly for every row.
    const keyOf = (v: { entityCode: string; glId: string; txnDate: string; reference: string | null; cents: number }) =>
      [v.entityCode, v.glId, v.txnDate, v.reference ?? "", v.cents].join("|");

    const result = await prisma.$transaction(async (t) => {
      for (const g of [...new Set(valid.map((v) => v.glId))].sort()) await lockGl(t, g);

      // Re-check closed periods under the lock: a sign-off may have landed
      // between validation and now.
      const freshRecs = await t.accountReconciliation.findMany({
        where: { glId: { in: [...new Set(valid.map((v) => v.glId))] } },
        select: { glId: true, periodId: true, status: true },
      });
      for (const v of valid) {
        const lc = resolvePeriods([], freshRecs.filter((r) => r.glId === v.glId)).lastClosed;
        if (lc && v.periodId <= lc) throw new AppError(`Row ${v.row}: ${formatPeriod(v.periodId)} was closed for GL ${v.glId} while you were importing. Nothing was imported.`, "CONFLICT");
      }

      const existing = await t.transaction.findMany({
        where: { OR: [...new Set(valid.map((v) => v.glId))].map((glId) => ({ glId, txnDate: { in: [...new Set(valid.filter((v) => v.glId === glId).map((v) => v.txnDate))] } })) },
        select: { entityCode: true, glId: true, txnDate: true, reference: true, amount: true },
      });
      const seen = new Set(existing.map((e) => keyOf({ ...e, cents: decimalToCents(e.amount) })));
      const duplicates: number[] = [];
      const toInsert = valid.filter((v) => {
        const k = keyOf(v);
        if (seen.has(k)) { duplicates.push(v.row); return false; }
        seen.add(k);
        return true;
      });

      for (const p of [...new Set(toInsert.map((v) => v.periodId))]) {
        await t.financialPeriod.upsert({ where: { id: p }, create: { id: p }, update: {} });
      }
      if (toInsert.length) {
        await t.transaction.createMany({
          data: toInsert.map((v) => ({
            entityCode: v.entityCode, glId: v.glId, periodId: v.periodId, txnDate: v.txnDate,
            reference: v.reference, description: v.description, amount: centsToDecimalString(v.cents),
            sub1Value: v.subs[0], sub2Value: v.subs[1], sub3Value: v.subs[2], sub4Value: v.subs[3], sub5Value: v.subs[4],
            sub6Value: v.subs[5], sub7Value: v.subs[6], sub8Value: v.subs[7], sub9Value: v.subs[8], sub10Value: v.subs[9],
          })),
        });
      }
      const byGl = Object.fromEntries([...new Set(toInsert.map((v) => v.glId))].map((g) => [g, toInsert.filter((v) => v.glId === g).length]));
      await logEvent(t, {
        actorId: me.id, action: "IMPORT",
        detail: { file: String(fileName ?? "").slice(0, 200), rows: valid.length, imported: toInsert.length, duplicates: duplicates.length, byGl },
      });
      return { imported: toInsert.length, duplicates };
    }, { timeout: 60_000 });

    return { ...result, errors: [] as RowError[], errorCount: 0, headerSkipped, rejected: false };
  });
}
