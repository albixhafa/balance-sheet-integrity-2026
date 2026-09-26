/* Accounting periods (YYYYMM) and which one an account is working on.
 *
 * The old code decided the "active" period by taking the latest period that had
 * any activity. That meant importing next month's file early silently skipped
 * the current month - it became invisible and could never be signed off.
 *
 * Periods are now worked strictly in order: the active period is the one right
 * after the last fully approved period. If nothing has been approved yet, it is
 * the earliest period with activity. Activity in later periods waits its turn.
 */

export const PERIOD_RE = /^\d{4}(0[1-9]|1[0-2])$/;

export function nextPeriod(p: string) {
  let y = parseInt(p.slice(0, 4), 10);
  let m = parseInt(p.slice(4), 10) + 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}${String(m).padStart(2, "0")}`;
}

export function previousPeriod(p: string) {
  let y = parseInt(p.slice(0, 4), 10);
  let m = parseInt(p.slice(4), 10) - 1;
  if (m < 1) { m = 12; y -= 1; }
  return `${y}${String(m).padStart(2, "0")}`;
}

export function currentCalendarPeriod(now = new Date()) {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function isValidTxnDate(d: string) {
  if (!/^\d{8}$/.test(d)) return false;
  const y = +d.slice(0, 4), m = +d.slice(4, 6), day = +d.slice(6);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function resolvePeriods(
  activityPeriods: string[],
  recs: { periodId: string; status: string }[],
) {
  const completed = recs.filter((r) => r.status === "COMPLETED").map((r) => r.periodId).sort();
  const lastClosed = completed.length ? completed[completed.length - 1] : null;
  let active: string;
  if (lastClosed) {
    active = nextPeriod(lastClosed);
  } else {
    const all = [...new Set([...activityPeriods, ...recs.map((r) => r.periodId)])].sort();
    active = all[0] ?? currentCalendarPeriod();
  }
  return { lastClosed, active };
}
