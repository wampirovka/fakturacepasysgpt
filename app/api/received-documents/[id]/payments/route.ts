import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

async function membership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await membership();
  if (!member) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role)) return NextResponse.json({ error: "Nemáte oprávnění zadávat úhrady." }, { status: 403 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data formuláře." }, { status: 400 }); }

  const amount = Number(body.amount ?? 0);
  const method = ["BANK_TRANSFER","CASH","CARD","OTHER"].includes(String(body.method)) ? String(body.method) : "BANK_TRANSFER";
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date();
  const note = typeof body.note === "string" ? body.note.trim() || null : null;
  const bankAccountId = typeof body.bankAccountId === "string" ? body.bankAccountId : null;
  const cashRegisterId = typeof body.cashRegisterId === "string" ? body.cashRegisterId : null;

  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Částka úhrady musí být větší než 0." }, { status: 400 });
  if (Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: "Neplatné datum úhrady." }, { status: 400 });
  if (method === "BANK_TRANSFER" && !bankAccountId) return NextResponse.json({ error: "Pro bankovní úhradu vyberte bankovní účet." }, { status: 400 });
  if (method === "CASH" && !cashRegisterId) return NextResponse.json({ error: "Pro hotovostní úhradu vyberte pokladnu." }, { status: 400 });

  try {
    const payment = await prisma.$transaction(async tx => {
      const document = await tx.receivedDocument.findFirst({ where: { id, companyId: member.companyId } });
      if (!document) throw new Error("Přijatý doklad nebyl nalezen.");
      const remaining = Math.round((Number(document.amount) - Number(document.paidAmount)) * 100) / 100;
      if (remaining <= 0) throw new Error("Tento doklad je již plně uhrazen.");
      if (amount > remaining + 0.000001) throw new Error(`Úhrada je vyšší než zbývající částka ${remaining.toFixed(2)} Kč.`);

      if (bankAccountId) {
        const account = await tx.bankAccount.findFirst({ where: { id: bankAccountId, companyId: member.companyId, isActive: true } });
        if (!account) throw new Error("Bankovní účet nebyl nalezen.");
      }
      if (cashRegisterId) {
        const register = await tx.cashRegister.findFirst({ where: { id: cashRegisterId, companyId: member.companyId, isActive: true } });
        if (!register) throw new Error("Pokladna nebyla nalezena.");
      }

      const created = await tx.receivedDocumentPayment.create({
        data: { companyId: member.companyId, receivedDocumentId: document.id, amount, paidAt, method: method as any, bankAccountId, cashRegisterId, note },
      });
      const newPaid = Math.round((Number(document.paidAmount) + amount) * 100) / 100;
      await tx.receivedDocument.update({ where: { id: document.id }, data: { paidAmount: newPaid } });
      await tx.financialMovement.create({
        data: {
          companyId: member.companyId, type: "EXPENSE", amount, date: paidAt, method: method as any,
          description: `Úhrada přijatého dokladu ${document.documentNumber}`, categoryId: document.categoryId,
          bankAccountId, cashRegisterId, receivedDocumentId: document.id, receivedDocumentPaymentId: created.id, note,
        },
      });
      await writeAudit(tx, { companyId: member.companyId, userId: member.userId, action: "CREATE", entity: "RECEIVED_DOCUMENT_PAYMENT", entityId: created.id, details: amount.toFixed(2) });
      return created;
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("POST received document payment failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se zadat úhradu." }, { status: 500 });
  }
}
