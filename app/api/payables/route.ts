import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  const member = await prisma.companyMember.findFirst({ where: { userId: session.user.id } });
  if (!member) return NextResponse.json({ error: "Firma nebyla nalezena." }, { status: 403 });

  const docs = await prisma.receivedDocument.findMany({
    where: { companyId: member.companyId },
    orderBy: [{ dueDate: "asc" }, { issueDate: "desc" }],
  });

  const now = Date.now();
  const rows = docs.map((d) => {
    const total = Number(d.amount);
    const paid = Number(d.paidAmount);
    const remaining = Math.max(0, total - paid);
    const due = d.dueDate ? new Date(d.dueDate).getTime() : 0;
    const overdueDays = remaining > 0 && due < now ? Math.max(1, Math.floor((now - due) / 86400000)) : 0;
    return { id:d.id, number:d.documentNumber, supplier:d.supplierName, issueDate:d.issueDate, dueDate:d.dueDate, total, paid, remaining, overdueDays, currency:d.currency };
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