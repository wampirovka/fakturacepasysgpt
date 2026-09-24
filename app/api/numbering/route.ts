import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateSeries } from "@/lib/numbering";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function GET() {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  const year = new Date().getFullYear();
  const series = await prisma.$transaction(async tx => Promise.all([
    getOrCreateSeries(tx, membership.companyId, "INVOICE", year),
    getOrCreateSeries(tx, membership.companyId, "ADVANCE", year),
    getOrCreateSeries(tx, membership.companyId, "CASH_DOCUMENT", year),
  ]));
  return NextResponse.json({ series, year });
}

export async function PATCH(request: Request) {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění měnit číselné řady." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data." }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const prefix = typeof body.prefix === "string" ? body.prefix.trim() : "";
  const nextNumber = Number(body.nextNumber); const padding = Number(body.padding);
  if (!id || !Number.isInteger(nextNumber) || nextNumber < 1) return NextResponse.json({ error: "Další číslo musí být celé číslo od 1." }, { status: 400 });
  if (!Number.isInteger(padding) || padding < 1 || padding > 8) return NextResponse.json({ error: "Počet číslic musí být 1 až 8." }, { status: 400 });
  if (prefix.length > 20) return NextResponse.json({ error: "Prefix je příliš dlouhý." }, { status: 400 });
  const series = await prisma.numberingSeries.findFirst({ where: { id, companyId: membership.companyId } });
  if (!series) return NextResponse.json({ error: "Číselná řada nebyla nalezena." }, { status: 404 });
  const updated = await prisma.numberingSeries.update({ where: { id }, data: { prefix, nextNumber, padding } });
  return NextResponse.json({ series: updated });
}
