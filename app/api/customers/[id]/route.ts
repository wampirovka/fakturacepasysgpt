import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, membership: null };

  const membership = await prisma.companyMember.findFirst({
    where: { userId: session.user.id },
  });

  return { session, membership };
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, membership } = await getMembership();
  const { id } = await context.params;

  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění upravovat zákazníky." }, { status: 403 });
  }

  const body = await request.json();
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Název / jméno zákazníka je povinné." }, { status: 400 });

  const existing = await prisma.customer.findFirst({
    where: { id, companyId: membership.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Zákazník nebyl nalezen." }, { status: 404 });

  const customer = await prisma.customer.update({
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

  return NextResponse.json({ customer });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, membership } = await getMembership();
  const { id } = await context.params;

  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění deaktivovat zákazníky." }, { status: 403 });
  }

  const existing = await prisma.customer.findFirst({
    where: { id, companyId: membership.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Zákazník nebyl nalezen." }, { status: 404 });

  await prisma.customer.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
