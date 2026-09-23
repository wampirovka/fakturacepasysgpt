import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reserveNumber } from "@/lib/numbering";
import { calculateInvoiceItems, parseInvoiceItems } from "@/lib/invoice-calculation";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function GET() {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });

  const advances = await prisma.invoice.findMany({
    where: { companyId: membership.companyId, type: "ADVANCE" },
    include: {
      customer: { select: { id: true, name: true } },
      appliedToFinalInvoices: { select: { amount: true, finalInvoice: { select: { id: true, number: true } } } },
    },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ advances });
}

export async function POST(request: Request) {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění vystavovat zálohové faktury." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data formuláře." }, { status: 400 }); }

  const customerId = typeof body.customerId === "string" && body.customerId ? body.customerId : null;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const amount = Number(body.amount ?? 0);
  const rawItems = Array.isArray(body.items) ? body.items : [{ description, quantity: 1, unit: "ks", unitPrice: amount, discount: 0, vatRate: null }];
  const issueDate = body.issueDate ? new Date(String(body.issueDate)) : new Date();
  const dueDays = Math.max(0, Math.min(365, Number(body.dueDays ?? 14)));

  if (!customerId) return NextResponse.json({ error: "Zákazník je u zálohové faktury povinný." }, { status: 400 });
  if (!description && !Array.isArray(body.items)) return NextResponse.json({ error: "Popis zálohy je povinný." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Částka zálohy není platná." }, { status: 400 });
  if (Number.isNaN(issueDate.getTime())) return NextResponse.json({ error: "Neplatné datum vystavení." }, { status: 400 });

  try {
    const advance = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: membership.companyId } });
      if (!company) throw new Error("Firma nebyla nalezena.");

      const customer = await tx.customer.findFirst({
        where: { id: customerId, companyId: company.id, isActive: true },
      });
      if (!customer) throw new Error("Vybraný zákazník nebyl nalezen.");

      const calculation = calculateInvoiceItems(parseInvoiceItems(rawItems), company.vatStatus === "VAT_PAYER");
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + dueDays);
      const number = await reserveNumber(tx, company.id, "ADVANCE", issueDate.getFullYear());

      return tx.invoice.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          type: "ADVANCE",
          status: "ISSUED",
          number,
          issueDate,
          dueDate,
          paymentMethod: "BANK_TRANSFER",
          variableSymbol: number,
          subtotal: calculation.subtotal,
          total: calculation.total,
          sellerName: company.name,
          sellerIco: company.ico,
          sellerDic: company.dic,
          sellerStreet: company.street,
          sellerCity: company.city,
          sellerZip: company.zip,
          sellerCountry: company.country,
          sellerEmail: company.email,
          sellerPhone: company.phone,
          buyerName: customer.name,
          buyerIco: customer.ico,
          buyerDic: customer.dic,
          buyerStreet: customer.street,
          buyerCity: customer.city,
          buyerZip: customer.zip,
          buyerCountry: customer.country,
          buyerEmail: customer.email,
          buyerPhone: customer.phone,
          items: {
            create: calculation.items.map((item, index) => ({
              position: index + 1,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              discount: item.discount,
              lineTotal: item.lineTotal,
              vatRate: item.vatRate,
            })),
          },
        },
      });
    });

    return NextResponse.json({ advance }, { status: 201 });
  } catch (error) {
    console.error("POST /api/advances failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se vytvořit zálohovou fakturu." }, { status: 500 });
  }
}
