import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function membership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function GET(request: Request) {
  const member = await membership();
  if (!member) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const type = searchParams.get("type");
  const movements = await prisma.financialMovement.findMany({
    where: {
      companyId: member.companyId,
      date: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
      ...(type === "INCOME" || type === "EXPENSE" ? { type } : {}),
    },
    include: {
      category: { select: { id: true, name: true, isTaxDeductible: true } },
      bankAccount: { select: { id: true, name: true } },
      cashRegister: { select: { id: true, name: true } },
      invoice: { select: { id: true, number: true } },
      receivedDocument: { select: { id: true, documentNumber: true, supplierName: true } },
    },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ movements });
}

export async function POST(request: Request) {
  const member = await membership();
  if (!member) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role)) return NextResponse.json({ error: "Nemáte oprávnění měnit finance." }, { status: 403 });

  try {
    const body = await request.json();
    const type = body.type === "EXPENSE" ? "EXPENSE" : body.type === "INCOME" ? "INCOME" : null;
    const amount = Number(body.amount);
    const date = new Date(String(body.date ?? new Date().toISOString()));
    const method = ["BANK_TRANSFER", "CASH", "CARD", "OTHER"].includes(String(body.method)) ? String(body.method) : null;
    if (!type || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime()) || !method) {
      return NextResponse.json({ error: "Neplatný finanční pohyb." }, { status: 400 });
    }

    const created = await prisma.financialMovement.create({
      data: {
        companyId: member.companyId,
        type,
        amount,
        date,
        method: method as any,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        note: typeof body.note === "string" ? body.note.trim() || null : null,
        categoryId: typeof body.categoryId === "string" ? body.categoryId : null,
        bankAccountId: typeof body.bankAccountId === "string" ? body.bankAccountId : null,
        cashRegisterId: typeof body.cashRegisterId === "string" ? body.cashRegisterId : null,
        invoiceId: typeof body.invoiceId === "string" ? body.invoiceId : null,
        receivedDocumentId: typeof body.receivedDocumentId === "string" ? body.receivedDocumentId : null,
      },
    });
    return NextResponse.json({ movement: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pohyb se nepodařilo uložit." }, { status: 400 });
  }
}
