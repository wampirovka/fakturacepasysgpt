import { Prisma } from "@/app/generated/prisma/client";

export async function writeAudit(tx: Prisma.TransactionClient, data: { companyId: string; userId?: string | null; action: string; entity: string; entityId?: string | null; details?: string | null }) {
  return tx.auditLog.create({ data });
}
