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

function normalizeType(value: unknown) {
  return value === "PERSON" ? "PERSON" : "BUSINESS";
}

export async function GET(request: Request) {
  const { session, membership } = await getMembership();

  if (!session) {
    return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  }
  if (!membership) {
    return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  const customers = await prisma.customer.findMany({
    where: {
      companyId: membership.companyId,
      isActive: true,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { ico: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { city: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  const { session, membership } = await getMembership();

  if (!session) {
    return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  }
  if (!membership) {
    return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  }
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění upravovat zákazníky." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatná data formuláře. Zkuste to znovu." }, { status: 400 });
  }

  const name = text(body.name);

  if (!name) {
    return NextResponse.json({ error: "Název / jméno zákazníka je povinné." }, { status: 400 });
  }

  const customer = await prisma.customer.create({
    data: {
      companyId: membership.companyId,
      type: normalizeType(body.type),
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

  return NextResponse.json({ customer }, { status: 201 });
}
