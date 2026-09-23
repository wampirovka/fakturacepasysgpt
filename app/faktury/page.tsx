"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Customer = { id: string; name: string };
type Invoice = {
  id: string; number: string | null; issueDate: string; dueDate: string | null;
  total: string | number; paidAmount: string | number; status: string; type: string; customer: Customer | null;
};
type Advance = {
  id: string; number: string | null; issueDate: string; total: string | number; paidAmount: string | number;
  customer: Customer | null; appliedToFinalInvoices: { amount: string | number }[];
};

const statusText: Record<string, string> = {
  ISSUED: "Vystavená", PAID: "Uhrazená", PARTIALLY_PAID: "Částečně uhrazená",
  OVERDUE: "Po splatnosti", DRAFT: "Rozpracovaná", CANCELLED: "Stornovaná",
};

const emptyForm = {
  customerId: "", description: "", quantity: "1", unitPrice: "",
  issueDate: new Date().toISOString().slice(0, 10), dueDays: "14", paymentMethod: "BANK_TRANSFER",
};

export default function FakturyPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"standard" | "final">("standard");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [advanceAmounts, setAdvanceAmounts] = useState<Record<string, string>>({});

  async function load() {
    const [ir, cr, ar] = await Promise.all([fetch("/api/invoices"), fetch("/api/customers"), fetch("/api/advances")]);
    const i = await ir.json().catch(() => ({})); const c = await cr.json().catch(() => ({})); const a = await ar.json().catch(() => ({}));
    if (ir.ok) setInvoices(i.invoices ?? []); else setMessage(i.error ?? "Nepodařilo se načíst faktury.");
    if (cr.ok) setCustomers(c.customers ?? []);
    if (ar.ok) setAdvances(a.advances ?? []);
  }

  useEffect(() => { load().catch(() => setMessage("Nepodařilo se načíst data.")); }, []);

  const customerAdvances = advances
    .filter((a) => a.customer?.id === form.customerId)
    .map((a) => {
      const applied = a.appliedToFinalInvoices.reduce((sum, x) => sum + Number(x.amount), 0);
      const available = Math.max(0, Number(a.paidAmount) - applied);
      return { ...a, available };
    })
    .filter((a) => a.available > 0.005);

  const selectedAdvanceTotal = Object.entries(advanceAmounts).reduce((sum, [id, value]) => {
    if (!customerAdvances.some((a) => a.id === id)) return sum;
    const amount = Number(value);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const endpoint = mode === "final" ? "/api/invoices/final" : "/api/invoices";
      const body = mode === "final"
        ? {
            ...form,
            advanceApplications: Object.entries(advanceAmounts)
              .filter(([, value]) => Number(value) > 0)
              .map(([advanceInvoiceId, amount]) => ({ advanceInvoiceId, amount: Number(amount) })),
          }
        : form;

      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Fakturu se nepodařilo vytvořit.");
      setOpen(false); setMode("standard"); setForm(emptyForm); setAdvanceAmounts({});
      await load(); setMessage(\`Faktura \${data.invoice.number} byla vytvořena.\`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Fakturu se nepodařilo vytvořit."); }
    finally { setSaving(false); }
  }

  function changeMode(next: "standard" | "final") {
    setMode(next); setMessage(""); setAdvanceAmounts({});
  }

  return (
    <AppShell>
      <div className="content">
        <header className="page-header">
          <div><p className="eyebrow">Doklady</p><h1 className="page-title">Faktury</h1><p className="page-subtitle">Vystavené, uhrazené a rozpracované faktury.</p></div>
          <button className="button button-primary" onClick={() => setOpen(!open)}>+ Nová faktura</button>
        </header>

        {message && <div className={message.includes("byla vytvořena") ? "auth-success settings-message" : "auth-error settings-message"}>{message}</div>}

        {open && <form className="panel invoice-editor" onSubmit={createInvoice}>
          <div className="panel-header"><div>
            <h2>{mode === "final" ? "Nová koncová faktura" : "Nová faktura"}</h2>
            <span>{mode === "final" ? "Zálohy se odečtou pod položkami faktury, nikoliv jako další položky." : "Číslo se přidělí automaticky podle nastavené řady."}</span>
          </div></div>

          <div className="invoice-mode-switch">
            <button type="button" className={mode === "standard" ? "button button-primary" : "button button-secondary"} onClick={() => changeMode("standard")}>Běžná faktura</button>
            <button type="button" className={mode === "final" ? "button button-primary" : "button button-secondary"} onClick={() => changeMode("final")}>Vyúčtovat zálohu</button>
          </div>

          <div className="settings-grid">
            <div className="auth-field"><label>Zákazník</label>
              <select value={form.customerId} onChange={e => { setForm({...form, customerId:e.target.value}); setAdvanceAmounts({}); }}>
                <option value="">Vyberte zákazníka</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Field label="Datum vystavení" type="date" value={form.issueDate} onChange={v => setForm({...form, issueDate:v})}/>
            <Field label="Popis položky" value={form.description} onChange={v => setForm({...form, description:v})} required/>
            <Field label="Množství" type="number" value={form.quantity} onChange={v => setForm({...form, quantity:v})} required/>
            <Field label="Cena za jednotku" type="number" value={form.unitPrice} onChange={v => setForm({...form, unitPrice:v})} required/>
            <Field label="Splatnost (dny)" type="number" value={form.dueDays} onChange={v => setForm({...form, dueDays:v})}/>
            <div className="auth-field"><label>Způsob úhrady</label>
              <select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod:e.target.value})}>
                <option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option>
              </select>
            </div>
          </div>

          {mode === "final" && <section className="advance-settlement">
            <div className="panel-header"><div><h3>Vypořádání záloh</h3><span>Vyberte uhrazenou část zálohy, která se má na této faktuře započíst.</span></div></div>
            {!form.customerId ? <p className="table-muted">Nejdříve vyberte zákazníka.</p> :
              customerAdvances.length === 0 ? <p className="table-muted">U tohoto zákazníka není žádná záloha s volnou částkou k započtení.</p> :
              <div className="advance-settlement-list">{customerAdvances.map(a => <div className="advance-settlement-row" key={a.id}>
                <div><strong>{a.number ?? "Záloha"}</strong><span>{new Date(a.issueDate).toLocaleDateString("cs-CZ")} · k započtení {a.available.toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč</span></div>
                <input type="number" min="0" max={a.available.toFixed(2)} step="0.01" placeholder="0,00" value={advanceAmounts[a.id] ?? ""}
                  onChange={e => setAdvanceAmounts({ ...advanceAmounts, [a.id]: e.target.value })}/>
              </div>)}</div>}
            {selectedAdvanceTotal > 0 && <div className="advance-settlement-total"><span>Započtené zálohy</span><strong>− {selectedAdvanceTotal.toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč</strong></div>}
          </section>}

          <div className="invoice-form-actions">
            <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Zrušit</button>
            <button className="button button-primary" disabled={saving}>{saving ? "Vytvářím…" : mode === "final" ? "Vytvořit koncovou fakturu" : "Vytvořit fakturu"}</button>
          </div>
        </form>}

        <section className="panel"><div className="panel-header"><div><h2>Seznam faktur</h2><span>{invoices.length} dokladů</span></div></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Číslo</th><th>Typ</th><th>Zákazník</th><th>Vystavení</th><th>Splatnost</th><th>Stav</th><th className="amount">Částka</th></tr></thead>
            <tbody>{invoices.length ? invoices.map(i => <tr key={i.id}>
              <td><strong>{i.number ?? "Rozpracovaná"}</strong></td><td>{i.type === "ADVANCE" ? "Zálohová" : i.type === "CORRECTIVE" ? "Opravná" : "Faktura"}</td>
              <td>{i.customer?.name ?? "Neuvedený zákazník"}</td><td>{new Date(i.issueDate).toLocaleDateString("cs-CZ")}</td>
              <td>{i.dueDate ? new Date(i.dueDate).toLocaleDateString("cs-CZ") : "-"}</td><td><span className="status status-due">{statusText[i.status] ?? i.status}</span></td>
              <td className="amount">{Number(i.total).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč</td>
            </tr>) : <tr><td colSpan={7} className="table-muted">Zatím tu nejsou žádné faktury.</td></tr>}</tbody>
          </table></div>
        </section>
      </div>
    </AppShell>
  );
}

function Field({label,value,onChange,type="text",required=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}) {
  const id=label.toLowerCase().replace(/[^a-z0-9]+/g,"-");
  return <div className="auth-field"><label htmlFor={id}>{label}{required?" *":""}</label><input id={id} type={type} value={value} required={required} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined} onChange={e=>onChange(e.target.value)}/></div>;
}
