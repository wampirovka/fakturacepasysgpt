import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateInvoiceItems, parseInvoiceItems } from "@/lib/invoice-calculation";

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
      advanceApplications: {
        include: { advanceInvoice: { select: { id: true, number: true } } },
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
  return NextResponse.json({ invoice: result.invoice });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await getAccess(id);
  if ("error" in result) return result.error;
  const { membership, invoice } = result;

  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění upravovat doklady." }, { status: 403 });
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
  const issueDate = body.issueDate ? new Date(String(body.issueDate)) : invoice.issueDate;
  const dueDays = Math.max(0, Math.min(365, Number(body.dueDays ?? 14)));
  const paymentMethod = body.paymentMethod === "CASH" ? "CASH" : "BANK_TRANSFER";

  if (Number.isNaN(issueDate.getTime())) return NextResponse.json({ error: "Neplatné datum vystavení." }, { status: 400 });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: membership.companyId } });
      if (!company) throw new Error("Firma nebyla nalezena.");

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
          issueDate,
          dueDate,
          taxableDate: issueDate,
          paymentMethod,
          variableSymbol: invoice.number ?? invoice.variableSymbol,
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
  if (invoice.payments.length > 0) {
    return NextResponse.json({ error: "Doklad nelze smazat, protože obsahuje zaevidovanou úhradu." }, { status: 409 });
  }
  if (invoice.advanceApplications.length > 0) {
    return NextResponse.json({ error: "Doklad nelze smazat, protože obsahuje vypořádanou zálohu." }, { status: 409 });
  }

  try {
    await prisma.invoice.delete({ where: { id: invoice.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/invoices/[id] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepodařilo se smazat doklad." }, { status: 500 });
  }
}
