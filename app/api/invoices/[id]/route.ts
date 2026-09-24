import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { calculateInvoiceItems, parseInvoiceItems } from "@/lib/invoice-calculation";
import { effectiveInvoiceStatus } from "@/lib/invoice-status";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

async function getAccess(id: string) {
  const membership = await getMembership();
  if (!membership) return { error: NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 }) };
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: membership.companyId },
    include: {
      customer: true,
      items: { orderBy: { position: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
      correctiveOf: { select: { id: true, number: true } },
      corrections: { select: { id: true, number: true, total: true } },
      advanceApplications: {
        include: { advanceInvoice: { select: { id: true, number: true } } },
        orderBy: { createdAt: "asc" },
      },
      appliedToFinalInvoices: {
        include: { finalInvoice: { select: { id: true, number: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!invoice) return { error: NextResponse.json({ error: "Doklad nebyl nalezen." }, { status: 404 }) };
  return { membership, invoice };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await getAccess(id);
  if ("error" in result) return result.error;
  return NextResponse.json({ invoice: { ...result.invoice, status: effectiveInvoiceStatus(result.invoice) } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await getAccess(id);
  if ("error" in result) return result.error;
  const { membership, invoice } = result;

  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění upravovat doklady." }, { status: 403 });
  }

  if (invoice.type === "CORRECTIVE") {
    return NextResponse.json({ error: "Opravný doklad je po vystavení neměnný." }, { status: 409 });
  }

  if (invoice.payments.length > 0 || invoice.advanceApplications.length > 0) {
    return NextResponse.json({
      error: invoice.advanceApplications.length > 0
        ? "Doklad už obsahuje vypořádanou zálohu a nelze ho upravit."
        : "Doklad už má zaevidovanou úhradu a nelze ho upravit.",
    }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data formuláře." }, { status: 400 }); }

  const customerId = typeof body.customerId === "string" && body.customerId ? body.customerId : null;
  const requestedNumber = typeof body.number === "string" ? body.number.trim() : invoice.number;
  const issueDate = body.issueDate ? new Date(String(body.issueDate)) : invoice.issueDate;
  const dueDays = Math.max(0, Math.min(365, Number(body.dueDays ?? 14)));
  const paymentMethod = body.paymentMethod === "CASH" ? "CASH" : "BANK_TRANSFER";

  if (Number.isNaN(issueDate.getTime())) return NextResponse.json({ error: "Neplatné datum vystavení." }, { status: 400 });
  if (!requestedNumber) return NextResponse.json({ error: "Číslo dokladu je povinné." }, { status: 400 });
  if (requestedNumber.length > 50) return NextResponse.json({ error: "Číslo dokladu je příliš dlouhé." }, { status: 400 });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: membership.companyId } });
      if (!company) throw new Error("Firma nebyla nalezena.");

      const existingNumber = await tx.invoice.findFirst({
        where: { companyId: membership.companyId, number: requestedNumber, NOT: { id: invoice.id } },
        select: { id: true },
      });
      if (existingNumber) throw new Error(`Číslo dokladu ${requestedNumber} už je použité.`);

      const customer = customerId
        ? await tx.customer.findFirst({ where: { id: customerId, companyId: company.id, isActive: true } })
        : null;
      if (invoice.type === "ADVANCE" && !customer) throw new Error("Zákazník je u zálohové faktury povinný.");
      if (customerId && !customer) throw new Error("Vybraný zákazník nebyl nalezen.");

      const rawItems = Array.isArray(body.items) ? body.items : [{
        description: typeof body.description === "string" ? body.description : "",
        quantity: Number(body.quantity ?? 1),
        unit: "ks",
        unitPrice: Number(body.unitPrice ?? 0),
        discount: 0,
        vatRate: null,
      }];
      const calculation = calculateInvoiceItems(parseInvoiceItems(rawItems), company.vatStatus === "VAT_PAYER");
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + dueDays);

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          customerId: customer?.id ?? null,
          number: requestedNumber,
          issueDate,
          dueDate,
          taxableDate: issueDate,
          paymentMethod,
          variableSymbol: requestedNumber,
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
          buyerName: customer?.name ?? null,
          buyerIco: customer?.ico ?? null,
          buyerDic: customer?.dic ?? null,
          buyerStreet: customer?.street ?? null,
          buyerCity: customer?.city ?? null,
          buyerZip: customer?.zip ?? null,
          buyerCountry: customer?.country ?? null,
          buyerEmail: customer?.email ?? null,
          buyerPhone: customer?.phone ?? null,
          items: {
            deleteMany: {},
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
        include: { items: { orderBy: { position: "asc" } }, customer: true },
      });

      await writeAudit(tx, { companyId: membership.companyId, userId: membership.userId, action: "UPDATE", entity: invoice.type === "ADVANCE" ? "ADVANCE" : "INVOICE", entityId: invoice.id, details: requestedNumber });
      return updatedInvoice;
    });

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    console.error("PATCH /api/invoices/[id] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se upravit doklad." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await getAccess(id);
  if ("error" in result) return result.error;
  const { membership, invoice } = result;

  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění mazat doklady." }, { status: 403 });
  }
  if (invoice.type === "CORRECTIVE") {
    return NextResponse.json({ error: "Vystavený opravný doklad nelze smazat." }, { status: 409 });
  }
  if (invoice.payments.length > 0) {
    return NextResponse.json({ error: "Doklad nelze smazat, protože obsahuje zaevidovanou úhradu." }, { status: 409 });
  }
  if (invoice.advanceApplications.length > 0) {
    return NextResponse.json({ error: "Doklad nelze smazat, protože obsahuje vypořádanou zálohu." }, { status: 409 });
  }

  try {
    await prisma.$transaction(async tx => {
      await tx.invoice.delete({ where: { id: invoice.id } });
      await writeAudit(tx, { companyId: membership.companyId, userId: membership.userId, action: "DELETE", entity: invoice.type === "ADVANCE" ? "ADVANCE" : "INVOICE", entityId: invoice.id, details: invoice.number });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/invoices/[id] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se smazat doklad." }, { status: 500 });
  }
}


export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await getAccess(id);
  if ("error" in result) return result.error;
  const { membership, invoice } = result;

  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění vypořádávat zálohy." }, { status: 403 });
  }
  if (invoice.type !== "INVOICE") {
    return NextResponse.json({ error: "Zálohu lze uplatnit pouze na konečnou fakturu." }, { status: 409 });
  }
  if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") {
    return NextResponse.json({ error: "Na tento doklad nelze uplatnit zálohu." }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data formuláře." }, { status: 400 }); }

  const advanceInvoiceId = typeof body.advanceInvoiceId === "string" ? body.advanceInvoiceId : "";
  const amount = Number(body.amount ?? 0);
  if (!advanceInvoiceId) return NextResponse.json({ error: "Záloha je povinná." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Částka zálohy musí být větší než 0." }, { status: 400 });

  try {
    const application = await prisma.$transaction(async tx => {
      const target = await tx.invoice.findFirst({
        where: { id, companyId: membership.companyId },
        include: {
          payments: { select: { amount: true } },
          advanceApplications: { select: { advanceInvoiceId: true, amount: true } },
        },
      });
      if (!target) throw new Error("Konečná faktura nebyla nalezena.");
      if (target.type !== "INVOICE") throw new Error("Zálohu lze uplatnit pouze na konečnou fakturu.");
      if (["CANCELLED", "DRAFT"].includes(target.status)) throw new Error("Na tento doklad nelze uplatnit zálohu.");
      if (target.advanceApplications.some(item => item.advanceInvoiceId === advanceInvoiceId)) {
        throw new Error("Tato záloha je na faktuře již uplatněná.");
      }

      const advance = await tx.invoice.findFirst({
        where: { id: advanceInvoiceId, companyId: membership.companyId, type: "ADVANCE", customerId: target.customerId },
        include: { appliedToFinalInvoices: { select: { amount: true } } },
      });
      if (!advance) throw new Error("Záloha nepatří ke stejné firmě a zákazníkovi.");

      const appliedFromAdvance = advance.appliedToFinalInvoices.reduce((sum, item) => sum + Number(item.amount), 0);
      const available = Math.max(0, Number(advance.paidAmount) - appliedFromAdvance);
      if (available <= 0.005) throw new Error("Na záloze už není žádná částka k uplatnění.");

      const paidByPayments = target.payments.reduce((sum, item) => sum + Number(item.amount), 0);
      const appliedToTarget = target.advanceApplications.reduce((sum, item) => sum + Number(item.amount), 0);
      const remaining = Math.max(0, Number(target.total) - paidByPayments - appliedToTarget);
      if (remaining <= 0.005) throw new Error("Faktura už nemá žádnou částku k vypořádání.");
      if (amount > available + 0.005) throw new Error(`Na záloze lze uplatnit nejvýše ${available.toFixed(2)} Kč.`);
      if (amount > remaining + 0.005) throw new Error(`Na faktuře lze uplatnit nejvýše ${remaining.toFixed(2)} Kč.`);

      const created = await tx.invoiceAdvanceApplication.create({
        data: { finalInvoiceId: target.id, advanceInvoiceId: advance.id, amount: Math.round(amount * 100) / 100 },
      });

      const newAppliedToTarget = appliedToTarget + amount;
      const newCovered = paidByPayments + newAppliedToTarget;
      const status = newCovered >= Number(target.total) - 0.005 ? "PAID" : newCovered > 0.005 ? "PARTIALLY_PAID" : "ISSUED";
      await tx.invoice.update({ where: { id: target.id }, data: { status } });

      const newAdvanceApplied = appliedFromAdvance + amount;
      const advanceStatus = newAdvanceApplied >= Number(advance.paidAmount) - 0.005
        ? "PAID"
        : Number(advance.paidAmount) > 0.005
          ? "PARTIALLY_PAID"
          : "ISSUED";
      await tx.invoice.update({ where: { id: advance.id }, data: { status: advanceStatus } });

      await writeAudit(tx, {
        companyId: membership.companyId,
        userId: membership.userId,
        action: "APPLY_ADVANCE",
        entity: "INVOICE_ADVANCE_APPLICATION",
        entityId: created.id,
        details: JSON.stringify({ finalInvoiceId: target.id, advanceInvoiceId: advance.id, amount }),
      });

      return created;
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices/[id] advance failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se uplatnit zálohu." }, { status: 500 });
  }
}
