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
  const invoices = await prisma.invoice.findMany({
    where: { companyId: membership.companyId },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění vystavovat faktury." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data formuláře." }, { status: 400 }); }

  const customerId = typeof body.customerId === "string" && body.customerId ? body.customerId : null;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const quantity = Number(body.quantity ?? 1);
  const unitPrice = Number(body.unitPrice ?? 0);
  const paymentMethod = body.paymentMethod === "CASH" ? "CASH" : "BANK_TRANSFER";
  const issueDate = body.issueDate ? new Date(String(body.issueDate)) : new Date();
  const dueDays = Math.max(0, Math.min(365, Number(body.dueDays ?? 14)));

  if (!description) return NextResponse.json({ error: "Popis položky je povinný." }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Množství musí být větší než 0." }, { status: 400 });
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return NextResponse.json({ error: "Cena musí být 0 nebo vyšší." }, { status: 400 });
  if (Number.isNaN(issueDate.getTime())) return NextResponse.json({ error: "Neplatné datum vystavení." }, { status: 400 });

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: membership.companyId } });
      if (!company) throw new Error("Firma nebyla nalezena.");
      const customer = customerId ? await tx.customer.findFirst({ where: { id: customerId, companyId: company.id, isActive: true } }) : null;
      if (customerId && !customer) throw new Error("Vybraný zákazník nebyl nalezen.");

      const total = Math.round(quantity * unitPrice * 100) / 100;
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + dueDays);
      const number = await reserveNumber(tx, company.id, "INVOICE", issueDate.getFullYear());

      return tx.invoice.create({
        data: {
          companyId: company.id,
          customerId: customer?.id ?? null,
          type: "INVOICE",
          status: "ISSUED",
          number,
          issueDate,
          dueDate,
          taxableDate: issueDate,
          paymentMethod,
          variableSymbol: number,
          subtotal: total,
          total,
          sellerName: company.name,
          sellerIco: company.ico,
          sellerDic: company.dic,
          sellerStreet: company.street,
          sellerCity: company.city,
          sellerZip: company.zip,
          sellerCountry: company.country,
          sellerEmail: company.email,
          sellerPhone: company.phone,
          buyerName: customer?.name ?? null,
          buyerIco: customer?.ico ?? null,
          buyerDic: customer?.dic ?? null,
          buyerStreet: customer?.street ?? null,
          buyerCity: customer?.city ?? null,
          buyerZip: customer?.zip ?? null,
          buyerCountry: customer?.country ?? null,
          buyerEmail: customer?.email ?? null,
          buyerPhone: customer?.phone ?? null,
          items: { create: { position: 1, description, quantity, unit: "ks", unitPrice, lineTotal: total, vatRate: null } },
        },
      });
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se vytvořit fakturu." }, { status: 500 });
  }
}
