import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canAccessEntity } from "@/lib/auth";
import { readFile, INLINE_TYPES } from "@/lib/storage";

/* Serves an attachment to someone who may see an account it is attached to.
 * Anything else gets the same 404, so ids cannot be probed. */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = () => new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user || user.requiresPasswordChange) return notFound();

  const att = await prisma.attachment.findUnique({
    where: { id: String(id) },
    include: { transactions: { select: { entityCode: true }, distinct: ["entityCode"] } },
  });
  if (!att || !att.transactions.some((t) => canAccessEntity(user, t.entityCode))) return notFound();

  let body: Buffer;
  try { body = await readFile(att.storageKey); } catch { return notFound(); }

  const inline = INLINE_TYPES.has(att.mimeType);
  const encoded = encodeURIComponent(att.fileName);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(body.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${att.fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      // Even a hostile PDF or image opened inline cannot run script against the app.
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'",
      "Cache-Control": "private, no-store",
    },
  });
}
