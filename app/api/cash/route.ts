import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function GET() {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  const documents = await prisma.cashDocument.findMany({
    where: { companyId: membership.companyId },
    include: { payment: { include: { invoice: { select: { id: true, number: true, customer: { select: { name: true } } } } } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const balance = documents.reduce((sum, doc) => sum + Number(doc.amount), 0);
  return NextResponse.json({ documents, balance });
}
