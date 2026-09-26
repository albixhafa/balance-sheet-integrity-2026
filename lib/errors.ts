/* Error handling for server actions.
 *
 * Next.js replaces the message of any error thrown out of a server action with
 * a generic one in production, so a thrown "Cleared items must net to $0.00"
 * reaches the user as "An error occurred in the Server Components render".
 * Every action therefore returns an ActionResult instead of throwing, and only
 * AppError messages - which are written for users - are passed through.
 * Anything else is logged server-side and reported generically.
 */

export class AppError extends Error {
  constructor(message: string, public code: "BAD_REQUEST" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
  }
}

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export async function run<T>(label: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e: unknown) {
    if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
    const code = (e as { code?: string })?.code;
    if (code === "P2002") return { ok: false, error: "That record already exists.", code: "CONFLICT" };
    console.error(`[action:${label}]`, e);
    return { ok: false, error: "Something went wrong on the server. It has been logged - please try again." };
  }
}
