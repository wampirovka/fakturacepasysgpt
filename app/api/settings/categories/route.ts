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
const types = ["INCOME", "EXPENSE", "BOTH"] as const;

export async function GET() {
  const { session, membership } = await membership();
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  const categories = await prisma.category.findMany({ where: { companyId: membership.companyId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const { session, membership } = await membership();
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění upravovat kategorie." }, { status: 403 });
  const body = await request.json();
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Název kategorie je povinný." }, { status: 400 });
  const type = types.includes(body.type) ? body.type : "BOTH";
  try {
    const category = await prisma.category.create({ data: { companyId: membership.companyId, name, type, isTaxDeductible: body.isTaxDeductible !== false } });
    await prisma.auditLog.create({ data: { companyId: membership.companyId, userId: session.user.id, action: "CREATE", entity: "CATEGORY", entityId: category.id } });
    return NextResponse.json({ category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Kategorie s tímto názvem už existuje." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const { session, membership } = await membership();
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!membership || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění upravovat kategorie." }, { status: 403 });
  const body = await request.json();
  if (typeof body.id !== "string") return NextResponse.json({ error: "Chybí ID kategorie." }, { status: 400 });
  const existing = await prisma.category.findFirst({ where: { id: body.id, companyId: membership.companyId } });
  if (!existing) return NextResponse.json({ error: "Kategorie nebyla nalezena." }, { status: 404 });
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Název kategorie je povinný." }, { status: 400 });
  const type = types.includes(body.type) ? body.type : "BOTH";
  try {
    const category = await prisma.category.update({ where: { id: existing.id }, data: { name, type, isTaxDeductible: body.isTaxDeductible !== false, isActive: body.isActive !== false } });
    await prisma.auditLog.create({ data: { companyId: membership.companyId, userId: session.user.id, action: "UPDATE", entity: "CATEGORY", entityId: category.id } });
    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "Kategorie s tímto názvem už existuje." }, { status: 409 });
  }
}