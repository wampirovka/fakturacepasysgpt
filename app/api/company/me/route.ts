import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, membership: null };

  const membership = await prisma.companyMember.findFirst({
    where: { userId: session.user.id },
    include: { company: true },
  });

  return { session, membership };
}

export async function GET() {
  const { session, membership } = await getMembership();

  if (!session) {
    return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  }

  return NextResponse.json({ company: membership?.company ?? null });
}

export async function PATCH(request: Request) {
  const { session, membership } = await getMembership();

  if (!session) {
    return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  }

  if (!membership) {
    return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  }

  if (!["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění upravovat údaje firmy." }, { status: 403 });
  }

  const body = await request.json();

  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const name = text(body.name);
  if (!name) {
    return NextResponse.json({ error: "Název firmy je povinný." }, { status: 400 });
  }

  const defaultDueDays = Number(body.defaultDueDays);
  if (!Number.isInteger(defaultDueDays) || defaultDueDays < 0 || defaultDueDays > 365) {
    return NextResponse.json({ error: "Splatnost musí být celé číslo od 0 do 365 dní." }, { status: 400 });
  }

  const vatStatus = ["NON_VAT_PAYER", "VAT_PAYER"].includes(body.vatStatus)
    ? body.vatStatus
    : membership.company.vatStatus;

  const company = await prisma.company.update({
    where: { id: membership.companyId },
    data: {
      name,
      ico: text(body.ico),
      dic: text(body.dic),
      street: text(body.street),
      city: text(body.city),
      zip: text(body.zip),
      country: text(body.country) ?? "CZ",
      phone: text(body.phone),
      email: text(body.email),
      website: text(body.website),
      logoUrl: text(body.logoUrl),
      bankAccount: text(body.bankAccount),
      bankCode: text(body.bankCode),
      iban: text(body.iban),
      vatStatus,
      defaultDueDays,
    },
  });

  return NextResponse.json({ company });
}
