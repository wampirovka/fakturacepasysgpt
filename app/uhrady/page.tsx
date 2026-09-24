"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Invoice = { id: string; number: string | null; total: string | number; paidAmount: string | number; customer: { name: string } | null };
type Payment = { id: string; amount: string | number; paidAt: string; method: string; invoice: { number: string | null; customer: { name: string } | null }; cashDocument: { number: string | null } | null };

const methods: Record<string, string> = { BANK_TRANSFER: "Bankovní převod", CASH: "Hotově", CARD: "Kartou", OTHER: "Jiné" };

export default function UhradyPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [form, setForm] = useState({ invoiceId: "", amount: "", paidAt: new Date().toISOString().slice(0, 10), method: "BANK_TRANSFER", note: "" });

  async function load() {
    const [ir, pr] = await Promise.all([fetch("/api/invoices"), fetch("/api/payments")]);
    const i = await ir.json().catch(() => ({}));
    const p = await pr.json().catch(() => ({}));
    if (ir.ok) setInvoices((i.invoices ?? []).filter((x: Invoice) => Number(x.total) > Number(x.paidAmount)));
    else setMessage(i.error ?? "Nepodařilo se načíst faktury.");
    if (pr.ok) setPayments(p.payments ?? []);
  }

  useEffect(() => { load().catch(() => setMessage("Nepodařilo se načíst data.")); }, []);

  const filteredPayments = payments.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [p.invoice.number ?? "", p.invoice.customer?.name ?? "", p.cashDocument?.number ?? ""].some((v) => v.toLowerCase().includes(q));
    const matchesMethod = methodFilter === "ALL" || p.method === methodFilter;
    return matchesSearch && matchesMethod;
  });

  async function deletePayment(id: string, amount: string | number) {
    if (!window.confirm(`Opravdu chcete smazat úhradu ${Number(amount).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč?`)) return;
    const r = await fetch("/api/payments/" + id, { method: "DELETE" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(data.error ?? "Úhradu se nepodařilo smazat."); return; }
    await load(); setMessage("Úhrada byla smazána a částka byla vrácena do pohledávky.");
  }

  async function createPayment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const r = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Úhradu se nepodařilo zadat.");
      setOpen(false);
      setForm({ ...form, invoiceId: "", amount: "", note: "" });
      await load();
      setMessage(data.payment?.cashDocument?.number ? `Úhrada byla zadána. Pokladní doklad ${data.payment.cashDocument.number} byl vytvořen.` : "Úhrada byla zadána.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Úhradu se nepodařilo zadat.");
    } finally {
      setSaving(false);
    }
  }

  return <AppShell><div className="content">
    <header className="page-header">
      <div><p className="eyebrow">Finance</p><h1 className="page-title">Úhrady</h1><p className="page-subtitle">Evidence plateb faktur. Při hotovostní úhradě se automaticky vytvoří pokladní doklad.</p></div>
      <button className="button button-primary" onClick={() => setOpen(!open)}>+ Nová úhrada</button>
    </header>

    {message && <div className={message.includes("zadána") ? "auth-success settings-message" : "auth-error settings-message"}>{message}</div>}

    {open && <form className="panel invoice-editor" onSubmit={createPayment}>
      <div className="panel-header"><div><h2>Zadat úhradu</h2><span>Částka nesmí překročit zbývající částku dokladu.</span></div></div>
      <div className="settings-grid">
        <div className="auth-field"><label>Faktura</label><select value={form.invoiceId} onChange={e => {
          const invoice = invoices.find(i => i.id === e.target.value);
          setForm({ ...form, invoiceId: e.target.value, amount: invoice ? (Number(invoice.total) - Number(invoice.paidAmount)).toFixed(2) : "" });
        }} required><option value="">Vyberte fakturu</option>{invoices.map(i => <option key={i.id} value={i.id}>{i.number ?? "Bez čísla"} · {i.customer?.name ?? "Bez zákazníka"} · zbývá {(Number(i.total)-Number(i.paidAmount)).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč</option>)}</select></div>
        <Field label="Částka" type="number" value={form.amount} onChange={v => setForm({ ...form, amount: v })} required />
        <Field label="Datum úhrady" type="date" value={form.paidAt} onChange={v => setForm({ ...form, paidAt: v })} />
        <div className="auth-field"><label>Způsob úhrady</label><select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}><option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option><option value="CARD">Kartou</option><option value="OTHER">Jiné</option></select></div>
        <Field label="Poznámka" value={form.note} onChange={v => setForm({ ...form, note: v })} />
      </div>
      <div className="invoice-form-actions"><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Zrušit</button><button className="button button-primary" disabled={saving}>{saving ? "Ukládám…" : "Zadat úhradu"}</button></div>
    </form>}

    <section className="panel"><div className="panel-header"><div><h2>Historie úhrad</h2><span>{filteredPayments.length} z {payments.length} plateb</span></div></div>
      <div className="document-filters">
        <input className="customer-search" placeholder="Hledat fakturu, zákazníka nebo pokladní doklad…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
          <option value="ALL">Všechny způsoby</option><option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option><option value="CARD">Kartou</option><option value="OTHER">Jiné</option>
        </select>
      </div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Datum</th><th>Faktura</th><th>Zákazník</th><th>Způsob</th><th>Pokladní doklad</th><th className="amount">Částka</th><th></th></tr></thead>
      <tbody>{filteredPayments.length ? filteredPayments.map(p => <tr key={p.id}><td>{new Date(p.paidAt).toLocaleDateString("cs-CZ")}</td><td><strong>{p.invoice.number ?? "-"}</strong></td><td>{p.invoice.customer?.name ?? "-"}</td><td>{methods[p.method] ?? p.method}</td><td>{p.cashDocument?.number ?? "-"}</td><td className="amount">{Number(p.amount).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč</td><td><button className="button button-danger button-small" onClick={() => deletePayment(p.id, p.amount)}>Smazat</button></td></tr>) : <tr><td colSpan={7} className="table-muted">Zatím nejsou evidované žádné úhrady.</td></tr>}</tbody></table></div>
    </section>
  </div></AppShell>;
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <div className="auth-field"><label htmlFor={id}>{label}{required ? " *" : ""}</label><input id={id} type={type} value={value} required={required} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} onChange={e => onChange(e.target.value)} /></div>;
}
