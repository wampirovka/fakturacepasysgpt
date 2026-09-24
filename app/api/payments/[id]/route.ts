import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { session, membership: await prisma.companyMember.findFirst({ where: { userId: session.user.id } }) };
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await getMembership();
  if (!result?.membership || !result.session) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(result.membership.role)) return NextResponse.json({ error: "Nemáte oprávnění mazat úhrady." }, { status: 403 });
  const { id } = await context.params;

  try {
    await prisma.$transaction(async tx => {
      const payment = await tx.payment.findFirst({
        where: { id, companyId: result.membership!.companyId },
        include: { invoice: true, cashDocument: true },
      });
      if (!payment) throw new Error("Úhrada nebyla nalezena.");

      const newPaid = Math.max(0, Math.round((Number(payment.invoice.paidAmount) - Number(payment.amount)) * 100) / 100);
      const now = new Date();
      const status = newPaid >= Number(payment.invoice.total) - 0.005
        ? "PAID"
        : payment.invoice.dueDate && new Date(payment.invoice.dueDate).getTime() < now.getTime()
          ? "OVERDUE"
          : newPaid > 0.005 ? "PARTIALLY_PAID" : "ISSUED";

      if (payment.cashDocument) await tx.cashDocument.delete({ where: { id: payment.cashDocument.id } });
      await tx.payment.delete({ where: { id: payment.id } });
      await tx.invoice.update({ where: { id: payment.invoiceId }, data: { paidAmount: newPaid, status } });
      await writeAudit(tx, {
        companyId: result.membership!.companyId,
        userId: result.session!.user.id,
        action: "DELETE",
        entity: "PAYMENT",
        entityId: payment.id,
        details: Number(payment.amount).toFixed(2),
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/payments/[id] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Úhradu se nepodařilo smazat." }, { status: 500 });
  }
}
