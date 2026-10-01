import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function membership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, membership: null };
  const membership = await prisma.companyMember.findFirst({ where: { userId: session.user.id } });
  return { session, membership };
}
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const money = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;

export async function GET() {
  const { session, membership } = await membership();
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  const cashRegisters = await prisma.cashRegister.findMany({ where: { companyId: membership.companyId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return NextResponse.json({ cashRegisters });
}

export async function POST(request: Request) {
  const { session, membership } = await membership();
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění upravovat pokladny." }, { status: 403 });
  const body = await request.json();
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Název pokladny je povinný." }, { status: 400 });
  const cashRegister = await prisma.cashRegister.create({ data: { companyId: membership.companyId, name, openingBalance: money(body.openingBalance) } });
  await prisma.auditLog.create({ data: { companyId: membership.companyId, userId: session.user.id, action: "CREATE", entity: "CASH_REGISTER", entityId: cashRegister.id } });
  return NextResponse.json({ cashRegister }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { session, membership } = await membership();
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění upravovat pokladny." }, { status: 403 });
  const body = await request.json();
  if (typeof body.id !== "string") return NextResponse.json({ error: "Chybí ID pokladny." }, { status: 400 });
  const existing = await prisma.cashRegister.findFirst({ where: { id: body.id, companyId: membership.companyId } });
  if (!existing) return NextResponse.json({ error: "Pokladna nebyla nalezena." }, { status: 404 });
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Název pokladny je povinný." }, { status: 400 });
  const cashRegister = await prisma.cashRegister.update({ where: { id: existing.id }, data: { name, openingBalance: money(body.openingBalance), isActive: body.isActive !== false } });
  await prisma.auditLog.create({ data: { companyId: membership.companyId, userId: session.user.id, action: "UPDATE", entity: "CASH_REGISTER", entityId: cashRegister.id } });
  return NextResponse.json({ cashRegister });
}