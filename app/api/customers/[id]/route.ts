import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, membership: null };
  const membership = await prisma.companyMember.findFirst({ where: { userId: session.user.id } });
  return { session, membership };
}

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, membership } = await getMembership();
  const { id } = await context.params;
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });

  const customer = await prisma.customer.findFirst({
    where: { id, companyId: membership.companyId },
    include: { invoices: { orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }], include: { payments: { orderBy: { paidAt: "desc" } } } } },
  });
  if (!customer) return NextResponse.json({ error: "Zákazník nebyl nalezen." }, { status: 404 });

  const invoiced = customer.invoices.filter(i => i.type !== "ADVANCE").reduce((s, i) => s + Number(i.total), 0);
  const paid = customer.invoices.filter(i => i.type !== "ADVANCE").reduce((s, i) => s + Number(i.paidAmount), 0);
  const advances = customer.invoices.filter(i => i.type === "ADVANCE");
  return NextResponse.json({
    customer,
    summary: {
      invoiced,
      paid,
      outstanding: Math.max(0, invoiced - paid),
      advances: advances.reduce((s, i) => s + Number(i.total), 0),
    },
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, membership } = await getMembership();
  const { id } = await context.params;
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění upravovat zákazníky." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data formuláře." }, { status: 400 }); }
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Název / jméno zákazníka je povinné." }, { status: 400 });

  const existing = await prisma.customer.findFirst({ where: { id, companyId: membership.companyId } });
  if (!existing) return NextResponse.json({ error: "Zákazník nebyl nalezen." }, { status: 404 });

  try {
    const customer = await prisma.$transaction(async tx => {
      const updated = await tx.customer.update({
        where: { id },
        data: {
          type: body.type === "PERSON" ? "PERSON" : "BUSINESS",
          name,
          ico: text(body.ico),
          dic: text(body.dic),
          street: text(body.street),
          city: text(body.city),
          zip: text(body.zip),
          country: text(body.country) ?? "CZ",
          email: text(body.email),
          phone: text(body.phone),
          note: text(body.note),
        },
      });
      await writeAudit(tx, { companyId: membership.companyId, userId: session.user.id, action: "UPDATE", entity: "CUSTOMER", entityId: id, details: updated.name });
      return updated;
    });
    return NextResponse.json({ customer });
  } catch (error) {
    console.error("PATCH /api/customers/[id] failed:", error);
    return NextResponse.json({ error: "Nepodařilo se upravit zákazníka.", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, membership } = await getMembership();
  const { id } = await context.params;
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění deaktivovat zákazníky." }, { status: 403 });

  const existing = await prisma.customer.findFirst({ where: { id, companyId: membership.companyId } });
  if (!existing) return NextResponse.json({ error: "Zákazník nebyl nalezen." }, { status: 404 });

  await prisma.$transaction(async tx => {
    await tx.customer.update({ where: { id }, data: { isActive: false } });
    await writeAudit(tx, { companyId: membership.companyId, userId: session.user.id, action: "DEACTIVATE", entity: "CUSTOMER", entityId: id, details: existing.name });
  });
  return NextResponse.json({ ok: true });
}
