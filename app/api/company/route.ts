import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const ico = typeof body.ico === "string" ? body.ico.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Název firmy je povinný." }, { status: 400 });
  }

  const existingMembership = await prisma.companyMember.findFirst({
    where: { userId: session.user.id },
  });

  if (existingMembership) {
    return NextResponse.json({ error: "Uživatel už má přiřazenou firmu." }, { status: 409 });
  }

  const company = await prisma.company.create({
    data: {
      name,
      ico: ico || null,
      email: email || null,
      members: {
        create: {
          userId: session.user.id,
          role: "OWNER",
        },
      },
    },
  });

  return NextResponse.json({ companyId: company.id }, { status: 201 });
}
