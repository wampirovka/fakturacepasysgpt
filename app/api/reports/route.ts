import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function GET(request: Request) {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel nebo chybějící firma." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return NextResponse.json({ error: "Neplatný rok." }, { status: 400 });
  const from = new Date(year, 0, 1); const to = new Date(year + 1, 0, 1);
  const [invoices, payments, cashDocuments] = await Promise.all([
    prisma.invoice.findMany({ where: { companyId: membership.companyId, issueDate: { gte: from, lt: to }, type: { not: "ADVANCE" } }, select: { total: true, paidAmount: true, status: true, issueDate: true } }),
    prisma.payment.findMany({ where: { companyId: membership.companyId, paidAt: { gte: from, lt: to } }, select: { amount: true, paidAt: true } }),
    prisma.cashDocument.findMany({ where: { companyId: membership.companyId, date: { gte: from, lt: to } }, select: { amount: true } }),
  ]);
  const month = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, invoiced: 0, paid: 0 }));
  for (const invoice of invoices) month[new Date(invoice.issueDate).getMonth()].invoiced += Number(invoice.total);
  for (const payment of payments) month[new Date(payment.paidAt).getMonth()].paid += Number(payment.amount);
  return NextResponse.json({
    year,
    totalInvoiced: invoices.reduce((s, x) => s + Number(x.total), 0),
    totalPaid: payments.reduce((s, x) => s + Number(x.amount), 0),
    outstanding: invoices.reduce((s, x) => s + Math.max(0, Number(x.total) - Number(x.paidAmount)), 0),
    overdue: invoices.filter(x => x.status === "OVERDUE").reduce((s, x) => s + Math.max(0, Number(x.total) - Number(x.paidAmount)), 0),
    cash: cashDocuments.reduce((s, x) => s + Number(x.amount), 0),
    invoiceCount: invoices.length,
    month,
  });
}
