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
  const bankAccounts = await prisma.bankAccount.findMany({ where: { companyId: membership.companyId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return NextResponse.json({ bankAccounts });
}

export async function POST(request: Request) {
  const { session, membership } = await membership();
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění upravovat bankovní účty." }, { status: 403 });
  const body = await request.json();
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Název účtu je povinný." }, { status: 400 });
  const bankAccount = await prisma.bankAccount.create({ data: { companyId: membership.companyId, name, accountNumber: text(body.accountNumber), bankCode: text(body.bankCode), iban: text(body.iban), openingBalance: money(body.openingBalance) } });
  await prisma.auditLog.create({ data: { companyId: membership.companyId, userId: session.user.id, action: "CREATE", entity: "BANK_ACCOUNT", entityId: bankAccount.id } });
  return NextResponse.json({ bankAccount }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { session, membership } = await membership();
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění upravovat bankovní účty." }, { status: 403 });
  const body = await request.json();
  if (typeof body.id !== "string") return NextResponse.json({ error: "Chybí ID účtu." }, { status: 400 });
  const existing = await prisma.bankAccount.findFirst({ where: { id: body.id, companyId: membership.companyId } });
  if (!existing) return NextResponse.json({ error: "Bankovní účet nebyl nalezen." }, { status: 404 });
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Název účtu je povinný." }, { status: 400 });
  const bankAccount = await prisma.bankAccount.update({ where: { id: existing.id }, data: { name, accountNumber: text(body.accountNumber), bankCode: text(body.bankCode), iban: text(body.iban), openingBalance: money(body.openingBalance), isActive: body.isActive !== false } });
  await prisma.auditLog.create({ data: { companyId: membership.companyId, userId: session.user.id, action: "UPDATE", entity: "BANK_ACCOUNT", entityId: bankAccount.id } });
  return NextResponse.json({ bankAccount });
}