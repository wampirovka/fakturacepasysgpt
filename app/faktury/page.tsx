"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
type ItemForm = { description: string; quantity: string; unit: string; unitPrice: string; discount: string; vatRate: string };

const statusText: Record<string, string> = {
  ISSUED: "Vystavená", PAID: "Uhrazená", PARTIALLY_PAID: "Částečně uhrazená",
  OVERDUE: "Po splatnosti", DRAFT: "Rozpracovaná", CANCELLED: "Stornovaná",
};

const emptyItem = (): ItemForm => ({ description: "", quantity: "1", unit: "ks", unitPrice: "", discount: "0", vatRate: "21" });
const emptyForm = () => ({
  customerId: "", issueDate: new Date().toISOString().slice(0, 10), dueDays: "14", paymentMethod: "BANK_TRANSFER",
  items: [emptyItem()],
});

export default function FakturyPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [vatPayer, setVatPayer] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"standard" | "final">("standard");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [advanceAmounts, setAdvanceAmounts] = useState<Record<string, string>>({});

  async function load() {
    const [ir, cr, ar, companyResponse] = await Promise.all([
      fetch("/api/invoices"), fetch("/api/customers"), fetch("/api/advances"), fetch("/api/company/me"),
    ]);
    const i = await ir.json().catch(() => ({})); const c = await cr.json().catch(() => ({}));
    const a = await ar.json().catch(() => ({})); const company = await companyResponse.json().catch(() => ({}));
    if (ir.ok) setInvoices(i.invoices ?? []); else setMessage(i.error ?? "Nepodařilo se načíst faktury.");
    if (cr.ok) setCustomers(c.customers ?? []);
    if (ar.ok) setAdvances(a.advances ?? []);
    if (companyResponse.ok) setVatPayer(company.company?.vatStatus === "VAT_PAYER");
  }

  useEffect(() => { load().catch(() => setMessage("Nepodařilo se načíst data.")); }, []);

  const calculation = useMemo(() => {
    return form.items.reduce((acc, item) => {
      const qty = Number(item.quantity); const price = Number(item.unitPrice); const discount = Number(item.discount) || 0;
      const net = Number.isFinite(qty) && Number.isFinite(price) ? Math.round(qty * price * (1 - discount / 100) * 100) / 100 : 0;
      const vat = vatPayer ? Math.round(net * (Number(item.vatRate) || 0) / 100 * 100) / 100 : 0;
      acc.net += net; acc.vat += vat; acc.total += net + vat; return acc;
    }, { net: 0, vat: 0, total: 0 });
  }, [form.items, vatPayer]);

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
    const amount = Number(value); return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);

  function updateItem(index: number, field: keyof ItemForm, value: string) {
    setForm(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  }
  function addItem() { setForm(current => ({ ...current, items: [...current.items, emptyItem()] })); }
  function removeItem(index: number) {
    setForm(current => ({ ...current, items: current.items.length === 1 ? current.items : current.items.filter((_, i) => i !== index) }));
  }

  async function deleteInvoice(id: string, number: string | null) {
    if (!window.confirm(`Opravdu chcete smazat fakturu ${number ?? ""}? Tato akce je nevratná.`)) return;
    const r = await fetch("/api/invoices/" + id, { method: "DELETE" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(data.error ?? "Fakturu se nepodařilo smazat."); return; }
    await load(); setMessage("Faktura byla smazána.");
  }

  async function createCorrective(id: string, number: string | null) {
    if (!window.confirm(`Vytvořit opravný doklad (storno) k faktuře ${number ?? ""}? Původní doklad zůstane zachovaný.`)) return;
    setMessage("");
    const r = await fetch("/api/invoices/" + id + "/corrective", { method: "POST" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(data.error ?? "Opravný doklad se nepodařilo vytvořit."); return; }
    await load();
    setMessage(`Opravný doklad ${data.invoice.number} byl vytvořen.`);
  }

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const endpoint = mode === "final" ? "/api/invoices/final" : "/api/invoices";
      const body = {
        customerId: form.customerId,
        issueDate: form.issueDate,
        dueDays: Number(form.dueDays),
        paymentMethod: form.paymentMethod,
        items: form.items.map(item => ({
          ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice),
          discount: Number(item.discount), vatRate: vatPayer ? Number(item.vatRate) : null,
        })),
        ...(mode === "final" ? {
          advanceApplications: Object.entries(advanceAmounts)
            .filter(([, value]) => Number(value) > 0)
            .map(([advanceInvoiceId, amount]) => ({ advanceInvoiceId, amount: Number(amount) })),
        } : {}),
      };
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Fakturu se nepodařilo vytvořit.");
      setOpen(false); setMode("standard"); setForm(emptyForm()); setAdvanceAmounts({});
      await load(); setMessage(`Faktura ${data.invoice.number} byla vytvořena.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Fakturu se nepodařilo vytvořit."); }
    finally { setSaving(false); }
  }

  function changeMode(next: "standard" | "final") { setMode(next); setMessage(""); setAdvanceAmounts({}); }

  return (
    <AppShell><div className="content">
      <header className="page-header">
        <div><p className="eyebrow">Doklady</p><h1 className="page-title">Faktury</h1><p className="page-subtitle">Vystavené, uhrazené a rozpracované faktury.</p></div>
        <button className="button button-primary" onClick={() => setOpen(!open)}>+ Nová faktura</button>
      </header>

      {message && <div className={message.includes("byla vytvořena") ? "auth-success settings-message" : "auth-error settings-message"}>{message}</div>}

      {open && <form className="panel invoice-editor" onSubmit={createInvoice}>
        <div className="panel-header"><div><h2>{mode === "final" ? "Nová koncová faktura" : "Nová faktura"}</h2><span>{mode === "final" ? "Zálohy se odečtou pod položkami faktury." : "Číslo se přidělí automaticky podle nastavené řady."}</span></div></div>

        <div className="invoice-mode-switch">
          <button type="button" className={mode === "standard" ? "button button-primary" : "button button-secondary"} onClick={() => changeMode("standard")}>Běžná faktura</button>
          <button type="button" className={mode === "final" ? "button button-primary" : "button button-secondary"} onClick={() => changeMode("final")}>Vyúčtovat zálohu</button>
        </div>

        <div className="settings-grid">
          <div className="auth-field"><label>Zákazník</label><select value={form.customerId} onChange={e => { setForm({...form, customerId:e.target.value}); setAdvanceAmounts({}); }}><option value="">Vyberte zákazníka</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <Field label="Datum vystavení" type="date" value={form.issueDate} onChange={v => setForm({...form, issueDate:v})}/>
          <Field label="Splatnost (dny)" type="number" value={form.dueDays} onChange={v => setForm({...form, dueDays:v})}/>
          <div className="auth-field"><label>Způsob úhrady</label><select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod:e.target.value})}><option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option></select></div>
        </div>

        <section className="invoice-items-editor">
          <div className="panel-header"><div><h3>Položky faktury</h3><span>{vatPayer ? "Ceny zadáváte bez DPH." : "Firma není plátce DPH, částky jsou konečné."}</span></div><button type="button" className="button button-secondary button-small" onClick={addItem}>+ Přidat položku</button></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Popis</th><th>Množství</th><th>Jedn.</th><th className="amount">Cena {vatPayer ? "bez DPH" : "za j."}</th><th>Sleva %</th>{vatPayer && <th>DPH</th>}<th className="amount">Celkem</th><th></th></tr></thead>
          <tbody>{form.items.map((item, index) => {
            const qty=Number(item.quantity)||0, price=Number(item.unitPrice)||0, discount=Number(item.discount)||0;
            const net=Math.round(qty*price*(1-discount/100)*100)/100; const vat=vatPayer?Math.round(net*(Number(item.vatRate)||0)/100*100)/100:0; const gross=net+vat;
            return <tr key={index}>
              <td><input className="table-input" value={item.description} placeholder="Popis položky" onChange={e=>updateItem(index,"description",e.target.value)} required/></td>
              <td><input className="table-input table-number" type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>updateItem(index,"quantity",e.target.value)} required/></td>
              <td><input className="table-input table-number" value={item.unit} onChange={e=>updateItem(index,"unit",e.target.value)}/></td>
              <td><input className="table-input table-number" type="number" min="0" step="0.01" value={item.unitPrice} onChange={e=>updateItem(index,"unitPrice",e.target.value)} required/></td>
              <td><input className="table-input table-number" type="number" min="0" max="100" step="0.01" value={item.discount} onChange={e=>updateItem(index,"discount",e.target.value)}/></td>
              {vatPayer && <td><select className="table-input" value={item.vatRate} onChange={e=>updateItem(index,"vatRate",e.target.value)}><option value="21">21 %</option><option value="12">12 %</option><option value="0">0 %</option></select></td>}
              <td className="amount">{gross.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td>
              <td><button type="button" className="button button-danger button-small" disabled={form.items.length===1} onClick={()=>removeItem(index)}>×</button></td>
            </tr>;
          })}</tbody></table></div>
          <div className="invoice-summary"><div><span>Základ</span><strong>{calculation.net.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>{vatPayer && <div><span>DPH</span><strong>{calculation.vat.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>}<div className="grand"><span>Celkem</span><strong>{calculation.total.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div></div>
        </section>

        {mode === "final" && <section className="advance-settlement">
          <div className="panel-header"><div><h3>Vypořádání záloh</h3><span>Vyberte uhrazenou část zálohy, která se má na této faktuře započíst.</span></div></div>
          {!form.customerId ? <p className="table-muted">Nejdříve vyberte zákazníka.</p> :
            customerAdvances.length === 0 ? <p className="table-muted">U tohoto zákazníka není žádná záloha s volnou částkou k započtení.</p> :
            <div className="advance-settlement-list">{customerAdvances.map(a => <div className="advance-settlement-row" key={a.id}>
              <div><strong>{a.number ?? "Záloha"}</strong><span>{new Date(a.issueDate).toLocaleDateString("cs-CZ")} · k započtení {a.available.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</span></div>
              <input type="number" min="0" max={Math.min(a.available, calculation.total).toFixed(2)} step="0.01" placeholder="0,00" value={advanceAmounts[a.id] ?? ""} onChange={e=>setAdvanceAmounts({...advanceAmounts,[a.id]:e.target.value})}/>
            </div>)}</div>}
          {selectedAdvanceTotal > 0 && <div className="advance-settlement-total"><span>Započtené zálohy</span><strong>− {selectedAdvanceTotal.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>}
          {mode === "final" && <div className="advance-settlement-total"><span>K úhradě po zálohách</span><strong>{Math.max(0, calculation.total-selectedAdvanceTotal).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>}
        </section>}

        <div className="invoice-form-actions"><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Zrušit</button><button className="button button-primary" disabled={saving}>{saving ? "Vytvářím…" : mode === "final" ? "Vytvořit koncovou fakturu" : "Vytvořit fakturu"}</button></div>
      </form>}

      <section className="panel"><div className="panel-header"><div><h2>Seznam faktur</h2><span>{invoices.length} dokladů</span></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Číslo</th><th>Typ</th><th>Zákazník</th><th>Vystavení</th><th>Splatnost</th><th>Stav</th><th></th><th className="amount">Částka</th></tr></thead>
        <tbody>{invoices.length ? invoices.map(i => <tr key={i.id}>
          <td><strong>{i.number ?? "Rozpracovaná"}</strong></td><td>{i.type === "ADVANCE" ? "Zálohová" : i.type === "CORRECTIVE" ? "Opravná" : "Faktura"}</td><td>{i.customer?.name ?? "Neuvedený zákazník"}</td>
          <td>{new Date(i.issueDate).toLocaleDateString("cs-CZ")}</td><td>{i.dueDate ? new Date(i.dueDate).toLocaleDateString("cs-CZ") : "-"}</td><td><span className="status status-due">{statusText[i.status] ?? i.status}</span></td>
          <td><div className="row-actions"><Link className="button button-secondary button-small" href={`/doklad/${i.id}`}>Detail</Link>{i.type !== "CORRECTIVE" && i.status !== "CANCELLED" && <button className="button button-secondary button-small" onClick={() => createCorrective(i.id, i.number)}>Opravný doklad</button>}<Link className="button button-secondary button-small" href={`/doklad/${i.id}?edit=1`}>Upravit</Link><button className="button button-danger button-small" onClick={() => deleteInvoice(i.id, i.number)}>Smazat</button></div></td>
          <td className="amount">{Number(i.total).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td>
        </tr>) : <tr><td colSpan={8} className="table-muted">Zatím tu nejsou žádné faktury.</td></tr>}</tbody></table></div>
      </section>
    </div></AppShell>
  );
}

function Field({label,value,onChange,type="text",required=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}) {
  const id=label.toLowerCase().replace(/[^a-z0-9]+/g,"-");
  return <div className="auth-field"><label htmlFor={id}>{label}{required?" *":""}</label><input id={id} type={type} value={value} required={required} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined} onChange={e=>onChange(e.target.value)}/></div>;
}
