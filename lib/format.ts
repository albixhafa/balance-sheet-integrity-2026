/* Formatting shared by server and client. No server-only imports here. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatPeriod(p: string | null | undefined, style: "long" | "short" = "long", fallback = "-") {
  if (!p || !/^\d{6}$/.test(p)) return fallback;
  const m = parseInt(p.slice(4), 10);
  if (m < 1 || m > 12) return fallback;
  const name = MONTHS[m - 1];
  return `${style === "short" ? name.slice(0, 3) : name} ${p.slice(0, 4)}`;
}

/** Money travels as integer cents end to end, so no total is ever the result
 *  of adding up binary floating-point dollars. */
export function formatCents(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatTxnDate(d: string | null | undefined) {
  if (!d || !/^\d{8}$/.test(d)) return d || "-";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

export function formatDateTime(iso: string | Date | null | undefined) {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const ROLE_LABEL: Record<string, string> = {
  ASSEMBLER: "Assembler",
  REVIEWER: "Reviewer",
  APPROVER: "Approver",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};
