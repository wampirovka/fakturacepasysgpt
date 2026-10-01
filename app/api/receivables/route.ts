import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  const member = await prisma.companyMember.findFirst({ where: { userId: session.user.id } });
  if (!member) return NextResponse.json({ error: "Firma nebyla nalezena." }, { status: 403 });

  const invoices = await prisma.invoice.findMany({
    where: { companyId: member.companyId, status: { notIn: ["DRAFT", "CANCELLED"] } },
    include: { customer: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { issueDate: "desc" }],
  });

  const now = Date.now();
  const rows = invoices.map((i) => {
    const total = Number(i.total);
    const paid = Number(i.paidAmount);
    const remaining = Math.max(0, total - paid);
    const due = i.dueDate ? new Date(i.dueDate).getTime() : 0;
    const overdueDays = remaining > 0 && due < now ? Math.max(1, Math.floor((now - due) / 86400000)) : 0;
    return { id:i.id, number:i.number ?? "Bez čísla", customer:i.customer?.name ?? i.buyerName ?? "Neznámý odběratel", issueDate:i.issueDate, dueDate:i.dueDate, total, paid, remaining, overdueDays, status:i.status };
  });

  return NextResponse.json({
    summary: {
      total: rows.reduce((s,x)=>s+x.total,0),
      paid: rows.reduce((s,x)=>s+x.paid,0),
      remaining: rows.reduce((s,x)=>s+x.remaining,0),
      overdue: rows.filter(x=>x.overdueDays>0).reduce((s,x)=>s+x.remaining,0),
    },
    rows,
  });
}