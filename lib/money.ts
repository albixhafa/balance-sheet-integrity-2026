/* Amount parsing for imports.
 *
 * The old import ran every amount through parseFloat, which stops at the first
 * character it does not understand: "1,234.56" became 1, "$500" became NaN.
 * This parser works on the string itself and returns integer cents, or null
 * with no guessing - a value it cannot read exactly is rejected, never
 * approximated.
 */

// Decimal(12,2): up to 9,999,999,999.99
export const MAX_ABS_CENTS = 999_999_999_999;

export function parseAmountToCents(raw: string): number | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;

  let negative = false;
  // Accounting negatives: (1,234.56)
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1).trim(); }
  else if (s.startsWith("+")) s = s.slice(1).trim();
  if (s.startsWith("$")) s = s.slice(1).trim();
  // "-$5" and "$-5" are both common in exports
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1).trim(); }

  // Either plain digits, or digits grouped by commas in threes - never a comma
  // in any other position, which is how a European "1.234,56" is caught
  // instead of silently becoming 1.23.
  const m = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;

  const whole = m[1].replace(/,/g, "");
  const frac = (m[2] ?? "").padEnd(2, "0");
  if (whole.length > 10) return null;
  const cents = parseInt(whole, 10) * 100 + parseInt(frac || "0", 10);
  if (!Number.isSafeInteger(cents) || cents > MAX_ABS_CENTS) return null;
  return negative ? -cents : cents;
}

export function centsToDecimalString(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Prisma Decimal (or anything with toFixed) to integer cents, exactly. */
export function decimalToCents(d: { toFixed: (n: number) => string } | number | string): number {
  const s = typeof d === "object" ? d.toFixed(2) : Number(d).toFixed(2);
  const negative = s.startsWith("-");
  const [w, f = "00"] = s.replace("-", "").split(".");
  const cents = parseInt(w, 10) * 100 + parseInt(f.padEnd(2, "0").slice(0, 2), 10);
  return negative ? -cents : cents;
}
