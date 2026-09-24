import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { reserveNumber } from "@/lib/numbering";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { session, membership: await prisma.companyMember.findFirst({ where: { userId: session.user.id } }) };
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await getMembership();
  if (!result?.membership || !result.session) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(result.membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění vystavovat opravné doklady." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const corrective = await prisma.$transaction(async tx => {
      const original = await tx.invoice.findFirst({
        where: { id, companyId: result.membership!.companyId },
        include: { items: { orderBy: { position: "asc" } }, customer: true },
      });

      if (!original) throw new Error("Původní doklad nebyl nalezen.");
      if (original.type === "CORRECTIVE") throw new Error("Opravný doklad nelze opravovat dalším opravným dokladem.");
      if (original.type === "ADVANCE") throw new Error("Opravu zálohové faktury zatím nelze vytvořit tímto způsobem.");
      if (original.status === "DRAFT") throw new Error("Rozpracovaný doklad nejprve dokončete.");
      if (original.status === "CANCELLED") throw new Error("Stornovaný doklad nelze znovu opravovat.");
      if (Number(original.paidAmount) > 0.005) {
        throw new Error("Uhrazený doklad nelze tímto způsobem stornovat. Nejdříve je potřeba vyřešit vrácení úhrady.");
      }

      const company = await tx.company.findUnique({ where: { id: original.companyId } });
      if (!company) throw new Error("Firma nebyla nalezena.");

      const number = await reserveNumber(tx, company.id, "INVOICE", new Date().getFullYear());
      const created = await tx.invoice.create({
        data: {
          companyId: original.companyId,
          customerId: original.customerId,
          type: "CORRECTIVE",
          status: "ISSUED",
          number,
          issueDate: new Date(),
          dueDate: new Date(),
          taxableDate: new Date(),
          currency: original.currency,
          paymentMethod: original.paymentMethod,
          variableSymbol: number,
          constantSymbol: original.constantSymbol,
          specificSymbol: original.specificSymbol,
          note: `Opravný doklad k faktuře ${original.number ?? original.id}. Důvod: storno původního dokladu.`,
          correctiveOfId: original.id,
          subtotal: -Number(original.subtotal),
          total: -Number(original.total),
          paidAmount: 0,
          sellerName: original.sellerName,
          sellerIco: original.sellerIco,
          sellerDic: original.sellerDic,
          sellerStreet: original.sellerStreet,
          sellerCity: original.sellerCity,
          sellerZip: original.sellerZip,
          sellerCountry: original.sellerCountry,
          sellerEmail: original.sellerEmail,
          sellerPhone: original.sellerPhone,
          buyerName: original.buyerName,
          buyerIco: original.buyerIco,
          buyerDic: original.buyerDic,
          buyerStreet: original.buyerStreet,
          buyerCity: original.buyerCity,
          buyerZip: original.buyerZip,
          buyerCountry: original.buyerCountry,
          buyerEmail: original.buyerEmail,
          buyerPhone: original.buyerPhone,
          items: {
            create: original.items.map(item => ({
              position: item.position,
              description: item.description,
              quantity: -Number(item.quantity),
              unit: item.unit,
              unitPrice: Number(item.unitPrice),
              discount: Number(item.discount),
              vatRate: item.vatRate,
              lineTotal: -Number(item.lineTotal),
            })),
          },
        },
      });

      await writeAudit(tx, {
        companyId: company.id,
        userId: result.session!.user.id,
        action: "CREATE_CORRECTIVE",
        entity: "INVOICE",
        entityId: created.id,
        details: `${created.number} ← ${original.number ?? original.id}`,
      });

      return created;
    });

    return NextResponse.json({ invoice: corrective }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices/[id]/corrective failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Opravný doklad se nepodařilo vytvořit." }, { status: 409 });
  }
}
