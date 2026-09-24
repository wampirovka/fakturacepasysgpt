import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { effectiveInvoiceStatus } from "@/lib/invoice-status";

function money(value: number) {
  return value.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";
}

function date(value: Date) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

const statusText: Record<string, string> = {
  ISSUED: "Vystavená",
  PAID: "Uhrazená",
  PARTIALLY_PAID: "Částečně uhrazená",
  OVERDUE: "Po splatnosti",
  DRAFT: "Rozpracovaná",
  CANCELLED: "Stornovaná",
};

const statusClass: Record<string, string> = {
  PAID: "status-paid",
  OVERDUE: "status-overdue",
  PARTIALLY_PAID: "status-due",
  ISSUED: "status-due",
  DRAFT: "status-muted",
  CANCELLED: "status-muted",
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/prihlaseni");

  const membership = await prisma.companyMember.findFirst({
    where: { userId: session.user.id },
    include: { company: true },
  });
  if (!membership) redirect("/firma");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [invoices, payments, recentInvoices, recentPayments] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId: membership.companyId, type: { not: "ADVANCE" } },
      select: { total: true, paidAmount: true, status: true, dueDate: true, issueDate: true },
    }),
    prisma.payment.findMany({
      where: { companyId: membership.companyId },
      select: { amount: true, paidAt: true },
    }),
    prisma.invoice.findMany({
      where: { companyId: membership.companyId },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
    prisma.payment.findMany({
      where: { companyId: membership.companyId },
      include: { invoice: { select: { id: true, number: true, customer: { select: { name: true } } } } },
      orderBy: { paidAt: "desc" },
      take: 5,
    }),
  ]);

  const outstanding = invoices.reduce((sum, invoice) =>
    sum + Math.max(0, Number(invoice.total) - Number(invoice.paidAmount)), 0);

  const overdue = invoices.reduce((sum, invoice) =>
    effectiveInvoiceStatus(invoice) === "OVERDUE"
      ? sum + Math.max(0, Number(invoice.total) - Number(invoice.paidAmount))
      : sum, 0);

  const monthInvoices = invoices.filter(i => i.issueDate >= monthStart && i.issueDate < monthEnd);
  const monthPayments = payments.filter(p => p.paidAt >= monthStart && p.paidAt < monthEnd);
  const monthInvoiced = monthInvoices.reduce((sum, i) => sum + Number(i.total), 0);
  const monthPaid = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const unpaidCount = invoices.filter(i => Number(i.paidAmount) < Number(i.total) - 0.005 && Number(i.total) > 0).length;
  const overdueCount = invoices.filter(i => effectiveInvoiceStatus(i) === "OVERDUE").length;

  const monthLabels = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];
  const monthly = monthLabels.map((label, index) => ({
    label,
    invoiced: invoices.filter(i => i.issueDate.getMonth() === index && i.issueDate.getFullYear() === now.getFullYear()).reduce((s, i) => s + Number(i.total), 0),
    paid: payments.filter(p => p.paidAt.getMonth() === index && p.paidAt.getFullYear() === now.getFullYear()).reduce((s, p) => s + Number(p.amount), 0),
  }));
  const maxMonth = Math.max(1, ...monthly.flatMap(m => [m.invoiced, m.paid]));

  return (
    <AppShell>
      <div className="content">
        <header className="page-header dashboard-hero">
          <div>
            <p className="eyebrow">Přehled firmy</p>
            <h1 className="page-title">Dobrý den, {session.user.name}</h1>
            <p className="page-subtitle">{membership.company.name} · rychlý přehled toho, co se ve firmě děje.</p>
          </div>
          <div className="dashboard-actions">
            <Link className="button button-secondary" href="/uhrady">+ Zadat úhradu</Link>
            <Link className="button button-primary" href="/faktury">+ Nová faktura</Link>
          </div>
        </header>

        <section className="dashboard-grid" aria-label="Souhrnné údaje">
          <article className="stat-card dashboard-stat">
            <div className="stat-label">K pohledávce</div>
            <div className="stat-value">{money(outstanding)}</div>
            <div className="stat-note">{unpaidCount} neuhrazených dokladů</div>
          </article>
          <article className="stat-card dashboard-stat dashboard-stat-danger">
            <div className="stat-label">Po splatnosti</div>
            <div className="stat-value">{money(overdue)}</div>
            <div className="stat-note">{overdueCount} doklady po termínu</div>
          </article>
          <article className="stat-card dashboard-stat">
            <div className="stat-label">Vystaveno tento měsíc</div>
            <div className="stat-value">{money(monthInvoiced)}</div>
            <div className="stat-note">{monthInvoices.length} dokladů</div>
          </article>
          <article className="stat-card dashboard-stat dashboard-stat-success">
            <div className="stat-label">Přijato tento měsíc</div>
            <div className="stat-value">{money(monthPaid)}</div>
            <div className="stat-note">{monthPayments.length} úhrad</div>
          </article>
        </section>

        <section className="dashboard-columns">
          <div className="panel dashboard-chart-panel">
            <div className="panel-header">
              <div><h2>Vývoj fakturace</h2><span>{now.getFullYear()} · vystaveno vs. skutečně přijato</span></div>
              <Link className="text-link" href="/prehledy">Detail přehledů →</Link>
            </div>
            <div className="dashboard-chart">
              {monthly.map((item) => (
                <div className="chart-month" key={item.label}>
                  <div className="chart-bars">
                    <div className="chart-bar chart-bar-invoiced" style={{ height: `${Math.max(4, (item.invoiced / maxMonth) * 100)}%` }} title={`Vystaveno: ${money(item.invoiced)}`} />
                    <div className="chart-bar chart-bar-paid" style={{ height: `${Math.max(4, (item.paid / maxMonth) * 100)}%` }} title={`Přijato: ${money(item.paid)}`} />
                  </div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span><i className="legend-dot legend-invoiced" /> Vystaveno</span>
              <span><i className="legend-dot legend-paid" /> Přijato</span>
            </div>
          </div>

          <div className="panel dashboard-quick-panel">
            <div className="panel-header"><div><h2>Rychlé akce</h2><span>Nejčastější operace</span></div></div>
            <div className="quick-actions">
              <Link href="/faktury" className="quick-action"><strong>Nová faktura</strong><span>Vystavit běžný nebo konečný doklad</span><b>→</b></Link>
              <Link href="/zalohy" className="quick-action"><strong>Nová záloha</strong><span>Vystavit zálohovou fakturu</span><b>→</b></Link>
              <Link href="/uhrady" className="quick-action"><strong>Zadat úhradu</strong><span>Zaúčtovat přijatou platbu</span><b>→</b></Link>
              <Link href="/zakaznici" className="quick-action"><strong>Zákazníci</strong><span>Správa firem a kontaktů</span><b>→</b></Link>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div><h2>Poslední doklady</h2><span>Nejnovější faktury a zálohy</span></div>
            <Link className="text-link" href="/faktury">Zobrazit vše →</Link>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Číslo</th><th>Zákazník</th><th>Vystaveno</th><th>Částka</th><th>Stav</th></tr></thead>
              <tbody>
                {recentInvoices.length ? recentInvoices.map((invoice) => {
                  const status = effectiveInvoiceStatus(invoice);
                  return (
                    <tr key={invoice.id}>
                      <td><Link className="table-link" href={`/doklad/${invoice.id}`}>{invoice.number ?? "Bez čísla"}</Link></td>
                      <td>{invoice.customer?.name ?? "Bez zákazníka"}</td>
                      <td>{date(invoice.issueDate)}</td>
                      <td className="amount">{money(Number(invoice.total))}</td>
                      <td><span className={`status ${statusClass[status] ?? "status-muted"}`}>{statusText[status] ?? status}</span></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={5} className="empty-cell">Zatím tu nejsou žádné doklady.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div><h2>Poslední úhrady</h2><span>Skutečně přijaté platby</span></div>
            <Link className="text-link" href="/uhrady">Zobrazit vše →</Link>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Datum</th><th>Doklad</th><th>Zákazník</th><th>Způsob</th><th className="amount">Částka</th></tr></thead>
              <tbody>
                {recentPayments.length ? recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{date(payment.paidAt)}</td>
                    <td><Link className="table-link" href={`/doklad/${payment.invoice.id}`}>{payment.invoice.number ?? "Bez čísla"}</Link></td>
                    <td>{payment.invoice.customer?.name ?? "Bez zákazníka"}</td>
                    <td>{payment.method === "CASH" ? "Hotově" : payment.method === "BANK_TRANSFER" ? "Bankovní převod" : payment.method === "CARD" ? "Kartou" : "Jiný"}</td>
                    <td className="amount">{money(Number(payment.amount))}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="empty-cell">Zatím tu nejsou žádné úhrady.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
