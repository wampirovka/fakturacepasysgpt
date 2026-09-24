import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { reserveNumber } from "@/lib/numbering";
import { calculateInvoiceItems, parseInvoiceItems } from "@/lib/invoice-calculation";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
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
  const paymentMethod = body.paymentMethod === "CASH" ? "CASH" : "BANK_TRANSFER";
  const issueDate = body.issueDate ? new Date(String(body.issueDate)) : new Date();
  const dueDays = Math.max(0, Math.min(365, Number(body.dueDays ?? 14)));
  const rawApplications = Array.isArray(body.advanceApplications) ? body.advanceApplications : [];

  if (!customerId) return NextResponse.json({ error: "Zákazník je u koncové faktury povinný." }, { status: 400 });
  if (Number.isNaN(issueDate.getTime())) return NextResponse.json({ error: "Neplatné datum vystavení." }, { status: 400 });

  const applications = rawApplications
    .map((item) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        advanceInvoiceId: typeof value.advanceInvoiceId === "string" ? value.advanceInvoiceId : "",
        amount: Number(value.amount ?? 0),
      };
    })
    .filter((item) => item.advanceInvoiceId && item.amount > 0);

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: membership.companyId } });
      if (!company) throw new Error("Firma nebyla nalezena.");

      const customer = await tx.customer.findFirst({
        where: { id: customerId, companyId: company.id, isActive: true },
      });
      if (!customer) throw new Error("Vybraný zákazník nebyl nalezen.");

      const rawItems = Array.isArray(body.items) ? body.items : [{
        description: typeof body.description === "string" ? body.description : "",
        quantity: Number(body.quantity ?? 1),
        unit: "ks",
        unitPrice: Number(body.unitPrice ?? 0),
        discount: 0,
        vatRate: null,
      }];
      const calculation = calculateInvoiceItems(parseInvoiceItems(rawItems), company.vatStatus === "VAT_PAYER");
      const total = calculation.total;

      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + dueDays);

      const uniqueAdvanceIds = new Set(applications.map((item) => item.advanceInvoiceId));
      if (uniqueAdvanceIds.size !== applications.length) {
        throw new Error("Stejnou zálohu nelze na jednu fakturu započíst vícekrát.");
      }

      let advanceTotal = 0;
      const checkedApplications: { advanceInvoiceId: string; amount: number }[] = [];

      for (const application of applications) {
        const advance = await tx.invoice.findFirst({
          where: {
            id: application.advanceInvoiceId,
            companyId: company.id,
            customerId: customer.id,
            type: "ADVANCE",
          },
          include: { appliedToFinalInvoices: { select: { amount: true } } },
        });

        if (!advance) throw new Error("Vybraná záloha nepatří k této firmě a zákazníkovi.");

        const alreadyApplied = advance.appliedToFinalInvoices.reduce((sum, item) => sum + Number(item.amount), 0);
        const available = Math.max(0, Number(advance.paidAmount) - alreadyApplied);

        if (available <= 0) throw new Error(`Záloha ${advance.number ?? ""} nemá žádnou částku k započtení.`);
        if (!Number.isFinite(application.amount) || application.amount <= 0) {
          throw new Error("Částka započtené zálohy musí být větší než 0.");
        }
        if (application.amount > available + 0.005) {
          throw new Error(`U zálohy ${advance.number ?? ""} lze započíst nejvýše ${available.toFixed(2)} Kč.`);
        }

        advanceTotal += application.amount;
        checkedApplications.push(application);
      }

      if (advanceTotal > total + 0.005) {
        throw new Error("Započtené zálohy nemohou být vyšší než celková částka faktury.");
      }

      const paidAmount = Math.round(advanceTotal * 100) / 100;
      const status = paidAmount >= total - 0.005 ? "PAID" : paidAmount > 0 ? "PARTIALLY_PAID" : "ISSUED";
      const number = await reserveNumber(tx, company.id, "INVOICE", issueDate.getFullYear());

      const created = await tx.invoice.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          type: "INVOICE",
          status,
          number,
          issueDate,
          dueDate,
          taxableDate: issueDate,
          paymentMethod,
          variableSymbol: number,
          subtotal: calculation.subtotal,
          total,
          paidAmount,
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
          advanceApplications: {
            create: checkedApplications.map((item) => ({
              advanceInvoiceId: item.advanceInvoiceId,
              amount: item.amount,
            })),
          },
        },
      });
      for (const application of checkedApplications) {
        const advance = await tx.invoice.findUnique({
          where: { id: application.advanceInvoiceId },
          include: { appliedToFinalInvoices: { select: { amount: true } } },
        });
        if (advance) {
          const applied = advance.appliedToFinalInvoices.reduce((sum, item) => sum + Number(item.amount), 0);
          const paid = Number(advance.paidAmount);
          const status = paid >= Number(advance.total) - 0.005
            ? (applied >= paid - 0.005 ? "PAID" : "PARTIALLY_PAID")
            : (paid > 0.005 ? "PARTIALLY_PAID" : "ISSUED");
          await tx.invoice.update({ where: { id: advance.id }, data: { status } });
        }
      }

      await writeAudit(tx, { companyId: company.id, userId: membership.userId, action: "CREATE_FINAL", entity: "INVOICE", entityId: created.id, details: created.number });
      return created;
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices/final failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se vytvořit koncovou fakturu." }, { status: 500 });
  }
}
