import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function membership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function GET() {
  const member = await membership();
  if (!member) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  const documents = await prisma.receivedDocument.findMany({
    where: { companyId: member.companyId },
    include: { category: { select: { id: true, name: true, isTaxDeductible: true } } },
    orderBy: { issueDate: "desc" },
  });
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const member = await membership();
  if (!member) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role)) return NextResponse.json({ error: "Nemáte oprávnění přidávat přijaté doklady." }, { status: 403 });
  try {
    const body = await request.json();
    const amount = Number(body.amount);
    const issueDate = new Date(String(body.issueDate));
    const dueDate = body.dueDate ? new Date(String(body.dueDate)) : null;
    if (!String(body.supplierName ?? "").trim() || !String(body.documentNumber ?? "").trim() || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(issueDate.getTime())) {
      return NextResponse.json({ error: "Dodavatel, číslo dokladu, datum a částka jsou povinné." }, { status: 400 });
    }
    const document = await prisma.receivedDocument.create({
      data: {
        companyId: member.companyId,
        supplierName: String(body.supplierName).trim(),
        supplierIco: typeof body.supplierIco === "string" ? body.supplierIco.trim() || null : null,
        supplierDic: typeof body.supplierDic === "string" ? body.supplierDic.trim() || null : null,
        documentNumber: String(body.documentNumber).trim(),
        issueDate,
        dueDate,
        amount,
        paymentMethod: ["BANK_TRANSFER","CASH","CARD","OTHER"].includes(String(body.paymentMethod)) ? String(body.paymentMethod) as any : "BANK_TRANSFER",
        categoryId: typeof body.categoryId === "string" ? body.categoryId : null,
        note: typeof body.note === "string" ? body.note.trim() || null : null,
        attachmentUrl: typeof body.attachmentUrl === "string" ? body.attachmentUrl.trim() || null : null,
      },
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Přijatý doklad se nepodařilo uložit." }, { status: 400 });
  }
}
