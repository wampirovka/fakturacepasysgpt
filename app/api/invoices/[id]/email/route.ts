import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id }, include: { company: true } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"\']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "\'":"&#39;" }[char] ?? char));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) return NextResponse.json({ error: "Nemáte oprávnění odesílat doklady." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Neplatná data." }, { status: 400 }); }
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) return NextResponse.json({ error: "Zadejte platnou e-mailovou adresu." }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Předmět e-mailu je povinný." }, { status: 400 });

  const { id } = await context.params;
  const invoice = await prisma.invoice.findFirst({ where: { id, companyId: membership.companyId }, include: { customer: true } });
  if (!invoice) return NextResponse.json({ error: "Doklad nebyl nalezen." }, { status: 404 });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || membership.company.email;
  if (!apiKey || !from) return NextResponse.json({ error: "E-mail není nastavený. Na serveru chybí RESEND_API_KEY a/nebo RESEND_FROM_EMAIL." }, { status: 503 });

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><div>${escapeHtml(message).replace(/\n/g,"<br>")}</div><hr><p style="color:#666;font-size:12px">Doklad: <strong>${escapeHtml(invoice.number ?? invoice.id)}</strong><br>Odesílatel: ${escapeHtml(membership.company.name)}</p></div>`;
  const response = await fetch("https://api.resend.com/emails", { method:"POST", headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"}, body:JSON.stringify({from,to:[to],subject,html}) });
  if (!response.ok) { const error = await response.json().catch(()=>({})); console.error("Resend error",error); return NextResponse.json({ error: "E-mail se nepodařilo odeslat." }, { status: 502 }); }
  return NextResponse.json({ success: true });
}
