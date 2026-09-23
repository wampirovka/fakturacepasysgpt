"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Customer = { id: string; name: string };
type Invoice = { id: string; number: string | null; issueDate: string; dueDate: string | null; total: string | number; status: string; customer: Customer | null };

const statusText: Record<string, string> = { ISSUED: "Vystavená", PAID: "Uhrazená", PARTIALLY_PAID: "Částečně uhrazená", OVERDUE: "Po splatnosti", DRAFT: "Rozpracovaná", CANCELLED: "Stornovaná" };

export default function FakturyPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ customerId: "", description: "", quantity: "1", unitPrice: "", issueDate: new Date().toISOString().slice(0, 10), dueDays: "14", paymentMethod: "BANK_TRANSFER" });

  async function load() {
    const [ir, cr] = await Promise.all([fetch("/api/invoices"), fetch("/api/customers")]);
    const i = await ir.json(); const c = await cr.json();
    if (ir.ok) setInvoices(i.invoices ?? []); else setMessage(i.error ?? "Nepodařilo se načíst faktury.");
    if (cr.ok) setCustomers(c.customers ?? []);
  }
  useEffect(() => { load().catch(() => setMessage("Nepodařilo se načíst data.")); }, []);

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const r = await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Fakturu se nepodařilo vytvořit.");
      setOpen(false);
      setForm({ ...form, customerId: "", description: "", quantity: "1", unitPrice: "" });
      await load();
      setMessage(`Faktura ${data.invoice.number} byla vytvořena.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Fakturu se nepodařilo vytvořit."); }
    finally { setSaving(false); }
  }

  return <AppShell><div className="content">
    <header className="page-header"><div><p className="eyebrow">Doklady</p><h1 className="page-title">Faktury</h1><p className="page-subtitle">Vystavené, uhrazené a rozpracované faktury.</p></div><button className="button button-primary" onClick={() => setOpen(!open)}>+ Nová faktura</button></header>
    {message && <div className={message.includes("byla vytvořena") ? "auth-success settings-message" : "auth-error settings-message"}>{message}</div>}
    {open && <form className="panel invoice-editor" onSubmit={createInvoice}>
      <div className="panel-header"><div><h2>Nová faktura</h2><span>Číslo se přidělí automaticky podle nastavené řady.</span></div></div>
      <div className="settings-grid">
        <div className="auth-field"><label>Zákazník</label><select value={form.customerId} onChange={e => setForm({...form, customerId:e.target.value})}><option value="">Bez zákazníka</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <Field label="Datum vystavení" type="date" value={form.issueDate} onChange={v => setForm({...form, issueDate:v})}/>
        <Field label="Popis položky" value={form.description} onChange={v => setForm({...form, description:v})} required/>
        <Field label="Množství" type="number" value={form.quantity} onChange={v => setForm({...form, quantity:v})} required/>
        <Field label="Cena za jednotku" type="number" value={form.unitPrice} onChange={v => setForm({...form, unitPrice:v})} required/>
        <Field label="Splatnost (dny)" type="number" value={form.dueDays} onChange={v => setForm({...form, dueDays:v})}/>
        <div className="auth-field"><label>Způsob úhrady</label><select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod:e.target.value})}><option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option></select></div>
      </div>
      <div className="invoice-form-actions"><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Zrušit</button><button className="button button-primary" disabled={saving}>{saving ? "Vytvářím…" : "Vytvořit fakturu"}</button></div>
    </form>}
    <section className="panel"><div className="panel-header"><div><h2>Seznam faktur</h2><span>{invoices.length} dokladů</span></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Číslo</th><th>Zákazník</th><th>Vystavení</th><th>Splatnost</th><th>Stav</th><th className="amount">Částka</th></tr></thead><tbody>{invoices.length ? invoices.map(i => <tr key={i.id}><td><strong>{i.number ?? "Rozpracovaná"}</strong></td><td>{i.customer?.name ?? "Neuvedený zákazník"}</td><td>{new Date(i.issueDate).toLocaleDateString("cs-CZ")}</td><td>{i.dueDate ? new Date(i.dueDate).toLocaleDateString("cs-CZ") : "-"}</td><td><span className="status status-due">{statusText[i.status] ?? i.status}</span></td><td className="amount">{Number(i.total).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč</td></tr>) : <tr><td colSpan={6} className="table-muted">Zatím tu nejsou žádné faktury.</td></tr>}</tbody></table></div></section>
  </div></AppShell>;
}

function Field({label,value,onChange,type="text",required=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}) {
  const id=label.toLowerCase().replace(/[^a-z0-9]+/g,"-");
  return <div className="auth-field"><label htmlFor={id}>{label}{required?" *":""}</label><input id={id} type={type} value={value} required={required} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined} onChange={e=>onChange(e.target.value)}/></div>;
}
