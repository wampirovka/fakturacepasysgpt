"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Customer = { id: string; name: string };
type Advance = {
  id: string;
  number: string | null;
  issueDate: string;
  dueDate: string | null;
  total: string | number;
  status: string;
  customer: Customer | null;
  appliedToFinalInvoices: { amount: string | number; finalInvoice: { id: string; number: string | null } }[];
};

const statusText: Record<string, string> = {
  ISSUED: "Vystavená",
  PAID: "Uhrazená",
  PARTIALLY_PAID: "Částečně uhrazená",
  OVERDUE: "Po splatnosti",
  CANCELLED: "Stornovaná",
};

export default function ZalohyPage() {
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    customerId: "",
    description: "Záloha na zakázku",
    amount: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDays: "14",
  });

  async function load() {
    const [ar, cr] = await Promise.all([fetch("/api/advances"), fetch("/api/customers")]);
    const a = await ar.json().catch(() => ({}));
    const c = await cr.json().catch(() => ({}));
    if (ar.ok) setAdvances(a.advances ?? []);
    else setMessage(a.error ?? "Nepodařilo se načíst zálohy.");
    if (cr.ok) setCustomers(c.customers ?? []);
  }

  useEffect(() => { load().catch(() => setMessage("Nepodařilo se načíst data.")); }, []);

  async function createAdvance(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const r = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Zálohovou fakturu se nepodařilo vytvořit.");
      setOpen(false);
      setForm({ ...form, customerId: "", amount: "" });
      await load();
      setMessage(`Zálohová faktura ${data.advance.number} byla vytvořena.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Zálohovou fakturu se nepodařilo vytvořit.");
    } finally {
      setSaving(false);
    }
  }

  return <AppShell><div className="content">
    <header className="page-header">
      <div><p className="eyebrow">Doklady</p><h1 className="page-title">Zálohové faktury</h1><p className="page-subtitle">Zálohy vystavené zákazníkům a jejich budoucí započtení do vyúčtování.</p></div>
      <button className="button button-primary" onClick={() => setOpen(!open)}>+ Nová zálohová faktura</button>
    </header>

    {message && <div className={message.includes("byla vytvořena") ? "auth-success settings-message" : "auth-error settings-message"}>{message}</div>}

    {open && <form className="panel invoice-editor" onSubmit={createAdvance}>
      <div className="panel-header"><div><h2>Nová zálohová faktura</h2><span>Číslo se přidělí automaticky jako 9 + rok + 3 číslice.</span></div></div>
      <div className="settings-grid">
        <div className="auth-field"><label>Zákazník</label><select value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} required><option value="">Vyberte zákazníka</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <Field label="Datum vystavení" type="date" value={form.issueDate} onChange={v => setForm({ ...form, issueDate: v })} />
        <Field label="Popis zálohy" value={form.description} onChange={v => setForm({ ...form, description: v })} required />
        <Field label="Částka zálohy" type="number" value={form.amount} onChange={v => setForm({ ...form, amount: v })} required />
        <Field label="Splatnost (dny)" type="number" value={form.dueDays} onChange={v => setForm({ ...form, dueDays: v })} />
      </div>
      <div className="invoice-form-actions"><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Zrušit</button><button className="button button-primary" disabled={saving}>{saving ? "Vytvářím…" : "Vytvořit zálohovou fakturu"}</button></div>
    </form>}

    <section className="panel"><div className="panel-header"><div><h2>Seznam zálohových faktur</h2><span>{advances.length} dokladů</span></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Číslo</th><th>Zákazník</th><th>Vystavení</th><th>Splatnost</th><th>Stav</th><th>Započteno</th><th className="amount">Částka</th></tr></thead>
      <tbody>{advances.length ? advances.map(a => {
        const applied = a.appliedToFinalInvoices.reduce((sum, x) => sum + Number(x.amount), 0);
        return <tr key={a.id}><td><strong>{a.number ?? "Rozpracovaná"}</strong></td><td>{a.customer?.name ?? "Neuvedený zákazník"}</td><td>{new Date(a.issueDate).toLocaleDateString("cs-CZ")}</td><td>{a.dueDate ? new Date(a.dueDate).toLocaleDateString("cs-CZ") : "-"}</td><td><span className="status status-due">{statusText[a.status] ?? a.status}</span></td><td>{applied.toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč</td><td className="amount">{Number(a.total).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč</td></tr>;
      }) : <tr><td colSpan={7} className="table-muted">Zatím tu nejsou žádné zálohové faktury.</td></tr>}</tbody></table></div>
    </section>
  </div></AppShell>;
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <div className="auth-field"><label htmlFor={id}>{label}{required ? " *" : ""}</label><input id={id} type={type} value={value} required={required} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} onChange={e => onChange(e.target.value)} /></div>;
}
