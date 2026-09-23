import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reserveNumber } from "@/lib/numbering";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function GET() {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });

  const payments = await prisma.payment.findMany({
    where: { companyId: membership.companyId },
    include: { invoice: { select: { id: true, number: true, type: true, customer: { select: { name: true } } } }, cashDocument: { select: { number: true } } },
    orderBy: { paidAt: "desc" },
  });
  return NextResponse.json({ payments });
}

export async function POST(request: Request) {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění zadávat úhrady." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data formuláře." }, { status: 400 }); }

  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
  const amount = Number(body.amount ?? 0);
  const method = ["BANK_TRANSFER", "CASH", "CARD", "OTHER"].includes(String(body.method)) ? String(body.method) : "BANK_TRANSFER";
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date();
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  if (!invoiceId) return NextResponse.json({ error: "Faktura je povinná." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Částka úhrady musí být větší než 0." }, { status: 400 });
  if (Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: "Neplatné datum úhrady." }, { status: 400 });

  try {
    const payment = await prisma.$transaction(async tx => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId: membership.companyId } });
      if (!invoice) throw new Error("Faktura nebyla nalezena.");
      if (["CANCELLED", "DRAFT"].includes(invoice.status)) throw new Error("Na tento doklad nelze zadat úhradu.");

      const remaining = Number(invoice.total) - Number(invoice.paidAmount);
      if (amount > Math.round((remaining + 0.000001) * 100) / 100) throw new Error(`Úhrada je vyšší než zbývající částka ${remaining.toFixed(2)} Kč.`);

      const newPaid = Math.round((Number(invoice.paidAmount) + amount) * 100) / 100;
      const status = newPaid >= Number(invoice.total) ? "PAID" : "PARTIALLY_PAID";

      const created = await tx.payment.create({
        data: { companyId: membership.companyId, invoiceId, amount, paidAt, method: method as any, note },
      });

      await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: newPaid, status } });

      if (method === "CASH") {
        const number = await reserveNumber(tx, membership.companyId, "CASH_DOCUMENT", paidAt.getFullYear());
        await tx.cashDocument.create({
          data: { companyId: membership.companyId, paymentId: created.id, number, date: paidAt, amount, method: "CASH", note },
        });
      }

      return tx.payment.findUnique({
        where: { id: created.id },
        include: { invoice: { select: { id: true, number: true } }, cashDocument: true },
      });
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se zadat úhradu." }, { status: 500 });
  }
}
