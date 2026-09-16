import { AppShell } from "@/components/app-shell";

const invoices = [
  { number: "FV-2026-0045", customer: "Novák s.r.o.", date: "17. 9. 2026", amount: "25 000 Kč", status: "Uhrazena", statusClass: "status-paid" },
  { number: "FV-2026-0044", customer: "Stavby ABC", date: "15. 9. 2026", amount: "48 000 Kč", status: "Po splatnosti", statusClass: "status-overdue" },
  { number: "ZF-2026-0012", customer: "Petrák", date: "14. 9. 2026", amount: "30 000 Kč", status: "Čeká na úhradu", statusClass: "status-due" },
];

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Přehled firmy</p>
            <h1 className="page-title">Dobrý den</h1>
            <p className="page-subtitle">Tady máte rychlý přehled fakturace a úhrad.</p>
          </div>
          <button className="button button-primary">＋ Nová faktura</button>
        </header>

        <section className="dashboard-grid" aria-label="Souhrnné údaje">
          <article className="stat-card">
            <div className="stat-label">K úhradě</div>
            <div className="stat-value">84 500 Kč</div>
            <div className="stat-note">3 neuhrazené doklady</div>
          </article>
          <article className="stat-card">
            <div className="stat-label">Po splatnosti</div>
            <div className="stat-value">12 300 Kč</div>
            <div className="stat-note">2 doklady</div>
          </article>
          <article className="stat-card">
            <div className="stat-label">Vystaveno tento měsíc</div>
            <div className="stat-value">156 000 Kč</div>
            <div className="stat-note">8 dokladů</div>
          </article>
          <article className="stat-card">
            <div className="stat-label">Uhrazeno tento měsíc</div>
            <div className="stat-value">103 500 Kč</div>
            <div className="stat-note">6 úhrad</div>
          </article>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Poslední doklady</h2>
              <span>Nejnovější faktury a zálohy</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Číslo</th>
                  <th>Zákazník</th>
                  <th>Vystaveno</th>
                  <th>Částka</th>
                  <th>Stav</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.number}>
                    <td>{invoice.number}</td>
                    <td>{invoice.customer}</td>
                    <td>{invoice.date}</td>
                    <td className="amount">{invoice.amount}</td>
                    <td><span className={`status ${invoice.statusClass}`}>{invoice.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
