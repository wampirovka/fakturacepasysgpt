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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await getMembership();
  if (!result) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  const { id } = await context.params;
  const payment = await prisma.payment.findFirst({
    where: { id, companyId: result.companyId },
    include: { invoice: { select: { id: true, number: true, total: true, customer: { select: { name: true } } } }, cashDocument: { select: { id: true, number: true } } },
  });
  if (!payment) return NextResponse.json({ error: "Úhrada nebyla nalezena." }, { status: 404 });
  return NextResponse.json({ payment });
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


export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await getMembership();
  if (!result) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(result.role)) return NextResponse.json({ error: "Nemáte oprávnění upravovat úhrady." }, { status: 403 });
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data formuláře." }, { status: 400 }); }

  const amount = Number(body.amount ?? 0);
  const method = ["BANK_TRANSFER", "CASH", "CARD", "OTHER"].includes(String(body.method)) ? String(body.method) : "BANK_TRANSFER";
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date();
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Částka úhrady musí být větší než 0." }, { status: 400 });
  if (Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: "Neplatné datum úhrady." }, { status: 400 });

  try {
    const payment = await prisma.$transaction(async tx => {
      const existing = await tx.payment.findFirst({
        where: { id, companyId: result!.companyId },
        include: { invoice: true, cashDocument: true },
      });
      if (!existing) throw new Error("Úhrada nebyla nalezena.");
      if (["CANCELLED", "DRAFT"].includes(existing.invoice.status)) throw new Error("Na tento doklad nelze upravit úhradu.");

      const [otherPayments, advanceAggregate] = await Promise.all([
        tx.payment.aggregate({ where: { invoiceId: existing.invoiceId, NOT: { id } }, _sum: { amount: true } }),
        tx.invoiceAdvanceApplication.aggregate({ where: { finalInvoiceId: existing.invoiceId }, _sum: { amount: true } }),
      ]);
      const paidByOtherPayments = Number(otherPayments._sum.amount ?? 0);
      const coveredByAdvances = Number(advanceAggregate._sum.amount ?? 0);
      const maxAmount = Math.max(0, Number(existing.invoice.total) - paidByOtherPayments - coveredByAdvances);
      if (amount > maxAmount + 0.005) throw new Error(`Úhrada je vyšší než zbývající částka ${maxAmount.toFixed(2)} Kč.`);

      const newPaid = Math.round((paidByOtherPayments + amount + coveredByAdvances) * 100) / 100;
      const status = newPaid >= Number(existing.invoice.total) - 0.005
        ? "PAID"
        : newPaid > 0.005
          ? "PARTIALLY_PAID"
          : existing.invoice.dueDate && new Date(existing.invoice.dueDate).getTime() < Date.now() ? "OVERDUE" : "ISSUED";

      const updated = await tx.payment.update({
        where: { id: existing.id },
        data: { amount, paidAt, method: method as any, note },
      });

      if (method === "CASH") {
        if (existing.cashDocument) {
          await tx.cashDocument.update({
            where: { id: existing.cashDocument.id },
            data: { date: paidAt, amount, note },
          });
        } else {
          const number = await reserveNumber(tx, result!.companyId, "CASH_DOCUMENT", paidAt.getFullYear());
          await tx.cashDocument.create({
            data: { companyId: result!.companyId, paymentId: updated.id, number, date: paidAt, amount, method: "CASH", note },
          });
        }
      } else if (existing.cashDocument) {
        await tx.cashDocument.delete({ where: { id: existing.cashDocument.id } });
      }

      await tx.invoice.update({ where: { id: existing.invoiceId }, data: { paidAmount: newPaid, status } });
      await writeAudit(tx, { companyId: result!.companyId, userId: result!.userId, action: "UPDATE", entity: "PAYMENT", entityId: existing.id, details: amount.toFixed(2) });

      return tx.payment.findUnique({
        where: { id: updated.id },
        include: { invoice: { select: { id: true, number: true } }, cashDocument: true },
      });
    });

    return NextResponse.json({ payment });
  } catch (error) {
    console.error("PATCH /api/payments/[id] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Úhradu se nepodařilo upravit." }, { status: 500 });
  }
}
