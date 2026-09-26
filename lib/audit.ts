import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export async function logEvent(
  db: Db,
  e: {
    actorId: string | null;
    action: string;
    entityCode?: string | null;
    glId?: string | null;
    periodId?: string | null;
    targetUserId?: string | null;
    detail?: Prisma.InputJsonValue;
  },
) {
  await db.auditEvent.create({ data: { ...e, detail: e.detail ?? Prisma.JsonNull } });
}
