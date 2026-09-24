"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";

type Customer = { id: string; name: string; ico?: string | null; dic?: string | null; street?: string | null; city?: string | null; zip?: string | null; country?: string | null; email?: string | null; phone?: string | null };
type Item = { id: string; description: string; quantity: string | number; unit: string; unitPrice: string | number; discount: string | number; vatRate: string | number | null; lineTotal: string | number };
type Payment = { id: string; amount: string | number; paidAt: string; method: string; note: string | null };
type Application = { id: string; amount: string | number; advanceInvoice: { id: string; number: string | null; payments: { amount: string | number; paidAt: string }[] } };
type ItemForm = { description: string; quantity: string; unit: string; unitPrice: string; discount: string; vatRate: string };
type ExportStyle = "CLASSIC" | "POHODA" | "IDOKLAD";
type Invoice = {
  id: string; number: string | null; type: string; status: string; issueDate: string; dueDate: string | null; taxableDate: string | null;
  subtotal: string | number; total: string | number; paidAmount: string | number; paymentMethod: string; variableSymbol: string | null; constantSymbol: string | null; specificSymbol: string | null; note: string | null;
  sellerName: string | null; sellerIco: string | null; sellerDic: string | null; sellerStreet: string | null; sellerCity: string | null; sellerZip: string | null; sellerCountry: string | null;
  sellerEmail: string | null; sellerPhone: string | null; buyerName: string | null; buyerIco: string | null; buyerDic: string | null; buyerStreet: string | null; buyerCity: string | null; buyerZip: string | null;
  buyerCountry: string | null; buyerEmail: string | null; buyerPhone: string | null; customer: Customer | null; items: Item[]; payments: Payment[]; advanceApplications: Application[]; appliedToFinalInvoices: { id: string; amount: string | number; finalInvoice: { id: string; number: string | null } }[];
  correctiveOf: { id: string; number: string | null } | null; corrections: { id: string; number: string | null; total: string | number }[];
};

const statusText: Record<string, string> = { ISSUED: "Vystavená", PAID: "Uhrazená", PARTIALLY_PAID: "Částečně uhrazená", OVERDUE: "Po splatnosti", DRAFT: "Rozpracovaná", CANCELLED: "Stornovaná" };
const methodText: Record<string, string> = { BANK_TRANSFER: "Bankovní převod", CASH: "Hotově", CARD: "Kartou", OTHER: "Jiný způsob" };

export default function DokladDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vatPayer, setVatPayer] = useState(false);
  const [company, setCompany] = useState<{name?: string|null; ico?: string|null; dic?: string|null; street?: string|null; city?: string|null; zip?: string|null; country?: string|null; email?: string|null; phone?: string|null; logoUrl?: string|null; bankAccount?: string|null; bankCode?: string|null; iban?: string|null; exportStyle?: ExportStyle}>({});
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ number: "", customerId: "", issueDate: "", dueDays: "14", paymentMethod: "BANK_TRANSFER", items: [] as ItemForm[] });
  const [availableAdvances, setAvailableAdvances] = useState<any[]>([]);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const advanceAmountInput = useRef<HTMLInputElement>(null);
  const [applyingAdvance, setApplyingAdvance] = useState(false);

  useEffect(() => {
    params.then(({ id }) => {
      Promise.all([fetch("/api/invoices/" + id), fetch("/api/customers"), fetch("/api/company/me")]).then(async ([ir, cr, companyResponse]) => {
        const data = await ir.json().catch(() => ({})); const cd = await cr.json().catch(() => ({})); const company = await companyResponse.json().catch(() => ({}));
        if (!ir.ok) { setMessage(data.error ?? "Doklad se nepodařilo načíst."); return; }
        setInvoice(data.invoice); setCustomers(cd.customers ?? []); setVatPayer(company.company?.vatStatus === "VAT_PAYER"); setCompany(company.company ?? {});
      }).catch(() => setMessage("Doklad se nepodařilo načíst."));
    });
  }, [params]);

  useEffect(() => {
    if (!invoice || invoice.type !== "INVOICE" || !invoice.customer?.id) { setAvailableAdvances([]); return; }
    fetch("/api/advances")
      .then(r => r.json())
      .then(data => setAvailableAdvances((data.advances ?? []).filter((a: any) =>
        a.customerId === invoice.customer?.id && Number(a.availableToApply ?? 0) > 0 && a.status !== "CANCELLED"
      )))
      .catch(() => setAvailableAdvances([]));
  }, [invoice?.id, invoice?.type, invoice?.customer?.id]);

  useEffect(() => {
    if (!invoice) return;
    const issue = new Date(invoice.issueDate);
    const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const dueDays = due ? Math.max(0, Math.round((due.getTime() - issue.getTime()) / 86400000)).toString() : "14";
    setForm({
      number: invoice.number ?? "",
      customerId: invoice.customer?.id ?? "",
      issueDate: issue.toISOString().slice(0, 10),
      dueDays,
      paymentMethod: invoice.paymentMethod === "CASH" ? "CASH" : "BANK_TRANSFER",
      items: invoice.items.map(item => ({
        description: item.description, quantity: String(item.quantity), unit: item.unit, unitPrice: String(item.unitPrice),
        discount: String(item.discount ?? 0), vatRate: item.vatRate === null ? "21" : String(item.vatRate),
      })),
    });
  }, [invoice]);

  useEffect(() => {
    if (invoice && searchParams.get("edit") === "1" && invoice.payments.length === 0 && invoice.advanceApplications.length === 0) setEditing(true);
  }, [invoice, searchParams]);

  const isAdvance = invoice?.type === "ADVANCE";
  const isCorrective = invoice?.type === "CORRECTIVE";
  const isFinal = invoice?.advanceApplications?.length > 0;
  const locked = Boolean(invoice && (invoice.payments.length > 0 || isFinal || isCorrective));

  const calculation = useMemo(() => form.items.reduce((acc, item) => {
    const qty=Number(item.quantity)||0, price=Number(item.unitPrice)||0, discount=Number(item.discount)||0;
    const net=Math.round(qty*price*(1-discount/100)*100)/100;
    const vat=vatPayer?Math.round(net*(Number(item.vatRate)||0)/100*100)/100:0;
    acc.net+=net; acc.vat+=vat; acc.total+=net+vat; return acc;
  }, {net:0,vat:0,total:0}), [form.items, vatPayer]);

  function updateItem(index:number, field:keyof ItemForm, value:string) {
    setForm(current=>({...current,items:current.items.map((item,i)=>i===index?{...item,[field]:value}:item)}));
  }
  function addItem() { setForm(current=>({...current,items:[...current.items,{description:"",quantity:"1",unit:"ks",unitPrice:"",discount:"0",vatRate:"21"}]})); }
  function removeItem(index:number) { setForm(current=>({...current,items:current.items.length===1?current.items:current.items.filter((_,i)=>i!==index)})); }

  async function applyAdvance() {
    if (!invoice || !selectedAdvanceId) return;
    const amount = Number(advanceAmountInput.current?.value ?? advanceAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setMessage("Zadejte částku zálohy větší než 0."); return; }
    setApplyingAdvance(true); setMessage("");
    try {
      const r = await fetch("/api/invoices/" + invoice.id, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advanceInvoiceId: selectedAdvanceId, amount }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setMessage(data.error ?? "Zálohu se nepodařilo uplatnit."); return; }
      const refreshed = await fetch("/api/invoices/" + invoice.id);
      const refreshedData = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) setInvoice(refreshedData.invoice);
      setSelectedAdvanceId(""); setAdvanceAmount(""); setMessage("Záloha byla uplatněna.");
    } catch { setMessage("Zálohu se nepodařilo uplatnit."); }
    finally { setApplyingAdvance(false); }
  }

  async function save() {
    if (!invoice) return;
    setSaving(true); setMessage("");
    const r = await fetch("/api/invoices/" + invoice.id, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...form, items:form.items.map(item=>({...item,quantity:Number(item.quantity),unitPrice:Number(item.unitPrice),discount:Number(item.discount),vatRate:vatPayer?Number(item.vatRate):null}))}),
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) setMessage(data.error??"Doklad se nepodařilo upravit.");
    else { setInvoice({...invoice,...data.invoice}); setEditing(false); setMessage("Doklad byl upraven."); }
    setSaving(false);
  }

  async function remove() {
    if (!invoice) return;
    if (!window.confirm("Opravdu chcete tento doklad smazat? Tato akce je nevratná.")) return;
    const r=await fetch("/api/invoices/"+invoice.id,{method:"DELETE"}); const data=await r.json().catch(()=>({}));
    if(!r.ok){setMessage(data.error??"Doklad se nepodařilo smazat.");return;}
    router.push(isAdvance?"/zalohy":"/faktury");
  }

  useEffect(() => {
    if (!invoice) return;
    const total = Number(invoice.total);
    const paid = invoice.payments.reduce((sum,x)=>sum+Number(x.amount),0) + invoice.advanceApplications.reduce((sum,x)=>sum+Number(x.amount),0);
    const remaining = Math.max(0, total - paid);
    const account = company.iban || (company.bankAccount && company.bankCode ? company.bankAccount + "/" + company.bankCode : "");
    if (!account || remaining <= 0) { setQrCode(null); return; }
    const parts = [
      "SPD*1.0",
      `ACC:${account}`,
      `AM:${remaining.toFixed(2)}`,
      "CC:CZK",
      `X-VS:${invoice.variableSymbol ?? invoice.number ?? ""}`,
    ];
    QRCode.toDataURL(parts.join("*"), { width: 150, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrCode)
      .catch(() => setQrCode(null));
  }, [invoice, company]);

  if (!invoice) return <AppShell><div className="content"><Link className="button button-secondary" href="/faktury">← Zpět</Link>{message&&<div className="auth-error settings-message">{message}</div>}</div></AppShell>;

  const total=Number(invoice.total);
  const applied=invoice.advanceApplications.reduce((sum,x)=>sum+Number(x.amount),0);
  const paidByPayments=invoice.payments.reduce((sum,x)=>sum+Number(x.amount),0);
  const paid=paidByPayments + applied;
  const remaining=Math.max(0,total-paid);
  const isFullySettledAdvance = isAdvance && applied >= total - 0.005;
  const advanceAvailableToApply = isAdvance ? Math.max(0, paid - applied) : 0;
  const detailNet=invoice.items.reduce((sum,x)=>sum+Number(x.lineTotal),0);
  const detailVat=invoice.items.reduce((sum,x)=>sum+Number(x.lineTotal)*(Number(x.vatRate)||0)/100,0);
  return <AppShell><div className="content">
    <header className="page-header">
      <div><p className="eyebrow">{isCorrective?"Opravný doklad":isAdvance?"Zálohová faktura":"Faktura"}</p><h1 className="page-title">{invoice.number??"Doklad"}</h1><p className="page-subtitle">{invoice.customer?.name??invoice.buyerName??"Neuvedený zákazník"}</p></div>
      <div className="customer-actions print-hide"><button className="button button-primary" onClick={()=>window.print()}>Tisk / PDF</button><Link className="button button-secondary" href={isAdvance?"/zalohy":"/faktury"}>← Zpět</Link>{!locked&&<button className="button button-secondary" onClick={()=>setEditing(!editing)}>{editing?"Zrušit úpravy":"Upravit"}</button>}{!locked&&<button className="button button-secondary button-delete-subtle" onClick={remove}>Smazat</button>}</div>
    </header>

    {message&&<div className={message==="Doklad byl upraven."?"auth-success settings-message":"auth-error settings-message"}>{message}</div>}

    {editing&&<section className="panel invoice-editor print-hide">
      <div className="panel-header"><div><h2>Úprava dokladu</h2><span>Číslo lze upravit, pokud ještě nebyla zaevidována úhrada.</span></div></div>
      <div className="settings-grid">
        <Field label="Číslo dokladu" value={form.number} onChange={v=>setForm({...form,number:v})}/>
        <div className="auth-field"><label>Zákazník</label><select value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Vyberte zákazníka</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <Field label="Datum vystavení" type="date" value={form.issueDate} onChange={v=>setForm({...form,issueDate:v})}/>
        <Field label="Splatnost (dny)" type="number" value={form.dueDays} onChange={v=>setForm({...form,dueDays:v})}/>
        {!isAdvance&&<div className="auth-field"><label>Způsob úhrady</label><select value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})}><option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option></select></div>}
      </div>
      <section className="invoice-items-editor">
        <div className="panel-header"><div><h3>Položky</h3><span>{vatPayer?"Ceny bez DPH.":"Částky jsou konečné, bez DPH."}</span></div><button type="button" className="button button-secondary button-small" onClick={addItem}>+ Přidat položku</button></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Popis</th><th>Množství</th><th>Jedn.</th><th className="amount">Cena</th><th>Sleva %</th>{vatPayer&&<th>DPH</th>}<th className="amount">Celkem</th><th></th></tr></thead>
        <tbody>{form.items.map((item,index)=>{const qty=Number(item.quantity)||0,price=Number(item.unitPrice)||0,discount=Number(item.discount)||0;const net=Math.round(qty*price*(1-discount/100)*100)/100;const vat=vatPayer?Math.round(net*(Number(item.vatRate)||0)/100*100)/100:0;return <tr key={index}><td><input className="table-input" value={item.description} onChange={e=>updateItem(index,"description",e.target.value)} required/></td><td><input className="table-input table-number" type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>updateItem(index,"quantity",e.target.value)}/></td><td><input className="table-input table-number" value={item.unit} onChange={e=>updateItem(index,"unit",e.target.value)}/></td><td><input className="table-input table-number" type="number" min="0" step="0.01" value={item.unitPrice} onChange={e=>updateItem(index,"unitPrice",e.target.value)}/></td><td><input className="table-input table-number" type="number" min="0" max="100" step="0.01" value={item.discount} onChange={e=>updateItem(index,"discount",e.target.value)}/></td>{vatPayer&&<td><select className="table-input" value={item.vatRate} onChange={e=>updateItem(index,"vatRate",e.target.value)}><option value="21">21 %</option><option value="12">12 %</option><option value="0">0 %</option></select></td>}<td className="amount">{(net+vat).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td><td><button type="button" className="button button-danger button-small" disabled={form.items.length===1} onClick={()=>removeItem(index)}>×</button></td></tr>})}</tbody></table></div>
        <div className="invoice-summary"><div><span>Základ</span><strong>{calculation.net.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>{vatPayer&&<div><span>DPH</span><strong>{calculation.vat.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>}<div className="grand"><span>Celkem</span><strong>{calculation.total.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div></div>
      </section>
      <div className="invoice-form-actions"><button type="button" className="button button-secondary" onClick={()=>setEditing(false)}>Zrušit</button><button className="button button-primary" disabled={saving} onClick={save}>{saving?"Ukládám…":"Uložit změny"}</button></div>
    </section>}

    <section className="panel detail-card"><div className="panel-header"><div><h2>Přehled dokladu</h2><span><span className="status status-due">{statusText[invoice.status]??invoice.status}</span></span></div></div><div className="detail-grid"><div><small>Vystavení</small><strong>{new Date(invoice.issueDate).toLocaleDateString("cs-CZ")}</strong></div><div><small>Splatnost</small><strong>{invoice.dueDate?new Date(invoice.dueDate).toLocaleDateString("cs-CZ"):"-"}</strong></div><div><small>Způsob úhrady</small><strong>{methodText[invoice.paymentMethod]??invoice.paymentMethod}</strong></div><div><small>Variabilní symbol</small><strong>{invoice.variableSymbol??"-"}</strong></div></div></section>

    <section className="panel detail-card"><div className="party-grid"><div><h3>Dodavatel</h3><strong>{invoice.sellerName??"-"}</strong><span>{invoice.sellerIco?"IČO "+invoice.sellerIco:""}</span><span>{invoice.sellerDic?"DIČ "+invoice.sellerDic:""}</span><span>{[invoice.sellerStreet,invoice.sellerZip,invoice.sellerCity].filter(Boolean).join(", ")}</span><span>{invoice.sellerEmail??""}</span></div><div><h3>Odběratel</h3><strong>{invoice.buyerName??"-"}</strong><span>{invoice.buyerIco?"IČO "+invoice.buyerIco:""}</span><span>{invoice.buyerDic?"DIČ "+invoice.buyerDic:""}</span><span>{[invoice.buyerStreet,invoice.buyerZip,invoice.buyerCity].filter(Boolean).join(", ")}</span><span>{invoice.buyerEmail??""}</span></div></div></section>

    {isAdvance && <section className="panel detail-card"><div className="panel-header"><div><h2>Vypořádání zálohy</h2><span>Kolik z této uhrazené zálohy už bylo použito na konečné faktury.</span></div></div><div className="detail-grid"><div><small>Uhrazeno</small><strong>{paid.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div><div><small>Vypořádáno</small><strong>{applied.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div><div><small>K uplatnění</small><strong>{advanceAvailableToApply.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div><div><small>Stav</small><strong>{isFullySettledAdvance ? "Vypořádaná" : applied > 0 ? "Částečně vypořádaná" : "Nevypořádaná"}</strong></div></div>{invoice.appliedToFinalInvoices?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Konečná faktura</th><th className="amount">Uplatněno</th></tr></thead><tbody>{invoice.appliedToFinalInvoices.map((a:any)=><tr key={a.id}><td><Link href={`/doklad/${a.finalInvoice.id}`}>{a.finalInvoice.number ?? a.finalInvoice.id}</Link></td><td className="amount">− {Number(a.amount).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td></tr>)}</tbody></table></div> : null}</section>}

    {isCorrective && invoice.correctiveOf && <section className="panel detail-card"><div className="panel-header"><div><h2>Opravný doklad</h2><span>Původní doklad zůstává v historii zachovaný.</span></div></div><div className="detail-grid"><div><small>Opravuje doklad</small><strong><Link href={`/doklad/${invoice.correctiveOf.id}`}>{invoice.correctiveOf.number ?? invoice.correctiveOf.id}</Link></strong></div></div></section>}
    {!isCorrective && invoice.corrections.length>0 && <section className="panel detail-card"><div className="panel-header"><div><h2>Opravné doklady</h2><span>K tomuto dokladu byly vystaveny následující opravy.</span></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Doklad</th><th className="amount">Částka</th></tr></thead><tbody>{invoice.corrections.map(x=><tr key={x.id}><td><Link href={`/doklad/${x.id}`}>{x.number ?? x.id}</Link></td><td className="amount">{Number(x.total).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td></tr>)}</tbody></table></div></section>}

    <section className="panel detail-card"><div className="panel-header"><div><h2>Položky</h2></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Popis</th><th>Množství</th><th>Jedn.</th><th className="amount">Cena/j.</th>{vatPayer&&<th>DPH</th>}<th className="amount">Celkem</th></tr></thead>
      <tbody>{invoice.items.map(x=><tr key={x.id}><td>{x.description}</td><td>{Number(x.quantity).toLocaleString("cs-CZ")}</td><td>{x.unit}</td><td className="amount">{Number(x.unitPrice).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td>{vatPayer&&<td>{x.vatRate===null?"-":Number(x.vatRate).toLocaleString("cs-CZ")+" %"}</td>}<td className="amount">{(Number(x.lineTotal)+(vatPayer?Number(x.lineTotal)*Number(x.vatRate||0)/100:0)).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td></tr>)}</tbody></table></div>
      <div className="detail-total"><span>Základ</span><strong>{detailNet.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>
      {vatPayer&&<div className="detail-total"><span>DPH</span><strong>{detailVat.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>}
      <div className="detail-total"><span>Celkem za plnění</span><strong>{total.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>
      {applied>0&&<div className="detail-total settlement"><span>Vypořádané zálohy</span><strong>− {applied.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>}
      <div className="detail-total grand"><span>K úhradě</span><strong>{remaining.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>
    </section>

    <section className="panel detail-card print-hide"><div className="panel-header"><div><h2>Úhrady</h2><span>{invoice.payments.length} záznamů</span></div></div>{invoice.payments.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Datum</th><th>Způsob</th><th>Poznámka</th><th className="amount">Částka</th></tr></thead><tbody>{invoice.payments.map(p=><tr key={p.id}><td>{new Date(p.paidAt).toLocaleDateString("cs-CZ")}</td><td>{methodText[p.method]??p.method}</td><td>{p.note??"-"}</td><td className="amount">{Number(p.amount).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td></tr>)}</tbody></table></div>:<p className="detail-empty">Zatím bez úhrady.</p>}</section>

    <section className={`print-invoice print-style-${(company.exportStyle ?? "CLASSIC").toLowerCase()}`}>
      <div className="print-topline">
        <div className="print-brand">{company.logoUrl && <img className="print-logo" src={company.logoUrl} alt="" />}<div><strong>{company.name ?? invoice.sellerName ?? "Fakturace"}</strong><span>{[company.street, company.zip, company.city].filter(Boolean).join(", ")}</span></div></div>
        <div className="print-type"><span>{vatPayer ? "DAŇOVÝ DOKLAD" : "FAKTURA"}</span><strong>{isCorrective ? "OPRAVNÝ DOKLAD" : isAdvance ? "ZÁLOHOVÁ FAKTURA" : "FAKTURA"}</strong></div>
      </div>

      <div className="print-head">
        <div><div className="print-number-label">ČÍSLO DOKLADU</div><h1>{invoice.number ?? "Doklad"}</h1></div>
        <div className="print-meta">
          <div><span>Vystaveno</span><strong>{new Date(invoice.issueDate).toLocaleDateString("cs-CZ")}</strong></div>
          {invoice.taxableDate && <div><span>DUZP</span><strong>{new Date(invoice.taxableDate).toLocaleDateString("cs-CZ")}</strong></div>}
          <div><span>Splatnost</span><strong>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("cs-CZ") : "-"}</strong></div>
        </div>
      </div>

      <div className="print-parties">
        <div><span className="print-label">DODAVATEL</span><strong>{company.name ?? invoice.sellerName ?? "-"}</strong><span>{[company.street, company.zip, company.city].filter(Boolean).join(", ")}</span><span>{company.ico ? "IČO: " + company.ico : invoice.sellerIco ? "IČO: " + invoice.sellerIco : ""}</span><span>{company.dic ? "DIČ: " + company.dic : invoice.sellerDic ? "DIČ: " + invoice.sellerDic : ""}</span><span>{company.email ?? invoice.sellerEmail ?? ""}{company.phone ? " · " + company.phone : invoice.sellerPhone ? " · " + invoice.sellerPhone : ""}</span><span style={{ marginTop: "0.5rem" }}>Fyzická osoba zapsaná v živnostenském rejstříku</span></div>
        <div><span className="print-label">ODBĚRATEL</span><strong>{invoice.buyerName ?? "-"}</strong><span>{[invoice.buyerStreet, invoice.buyerZip, invoice.buyerCity].filter(Boolean).join(", ")}</span><span>{invoice.buyerIco ? "IČO: " + invoice.buyerIco : ""}</span><span>{invoice.buyerDic ? "DIČ: " + invoice.buyerDic : ""}</span><span>{invoice.buyerEmail ?? ""}{invoice.buyerPhone ? " · " + invoice.buyerPhone : ""}</span></div>
      </div>

      <table className="print-items">
        <thead><tr><th>Předmět plnění</th><th className="qty">Množství</th><th className="unit">Jedn.</th><th className="right">Cena / jedn.</th>{vatPayer&&<th className="vat">DPH</th>}<th className="right">Cena celkem</th></tr></thead>
        <tbody>{invoice.items.map(x=><tr key={x.id}><td><strong>{x.description}</strong>{Number(x.discount)>0&&<small>Sleva {Number(x.discount).toLocaleString("cs-CZ")}%</small>}</td><td className="qty">{Number(x.quantity).toLocaleString("cs-CZ")}</td><td className="unit">{x.unit}</td><td className="right">{Number(x.unitPrice).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td>{vatPayer&&<td className="vat">{x.vatRate===null?"-":Number(x.vatRate).toLocaleString("cs-CZ")+" %"}</td>}<td className="right">{(Number(x.lineTotal)+(vatPayer?Number(x.lineTotal)*Number(x.vatRate||0)/100:0)).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td></tr>)}</tbody>
      </table>

      <div className="print-summary">
        <div className="print-payment">
          <span className="print-label">PLATEBNÍ ÚDAJE</span>
          <div>Způsob úhrady: <strong>{methodText[invoice.paymentMethod] ?? invoice.paymentMethod}</strong></div>
          {company.bankAccount && company.bankCode && <div>Bankovní účet: <strong>{company.bankAccount}/{company.bankCode}</strong></div>}
          {company.iban && <div>IBAN: <strong>{company.iban}</strong></div>}
          <div>Variabilní symbol: <strong>{invoice.variableSymbol ?? invoice.number ?? "-"}</strong></div>
          {invoice.constantSymbol && <div>Konstantní symbol: <strong>{invoice.constantSymbol}</strong></div>}
          {invoice.specificSymbol && <div>Specifický symbol: <strong>{invoice.specificSymbol}</strong></div>}
          {!vatPayer && <div className="print-note">Nejsem plátce DPH.</div>}
        </div>
        <div className="print-totals">
          <div><span>Základ</span><strong>{detailNet.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>
          {vatPayer&&<div><span>DPH</span><strong>{detailVat.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>}
          <div><span>Celkem za plnění</span><strong>{total.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>
          {applied>0&&<div className="print-settlement"><span>Vypořádání záloh</span><strong>− {applied.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>}{invoice.advanceApplications.length>0&&<div className="print-advances"><span className="print-label">UHRAZENÉ ZÁLOHY ZAHRNUTÉ DO VYÚČTOVÁNÍ</span>{invoice.advanceApplications.map(a=><div key={a.id}><span><strong>{a.advanceInvoice.number ?? a.advanceInvoice.id}</strong> · datum úhrady: {a.advanceInvoice.payments.length ? a.advanceInvoice.payments.map(p=>new Date(p.paidAt).toLocaleDateString("cs-CZ")).join(", ") : "Neuvedeno"}</span><strong>− {Number(a.amount).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>)}</div>}
          <div className="print-total-grand"><span>K ÚHRADĚ</span><strong>{remaining.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div>
        </div>
      </div>

      {invoice.note && <div className="print-note-block"><span className="print-label">POZNÁMKA</span><div>{invoice.note}</div></div>}
      <div className="print-footer"><span>{company.name ?? invoice.sellerName ?? "Fakturace"}{company.ico ? " · IČO " + company.ico : invoice.sellerIco ? " · IČO " + invoice.sellerIco : ""}{company.dic ? " · DIČ " + company.dic : invoice.sellerDic ? " · DIČ " + invoice.sellerDic : ""}</span><div className="print-qr-wrap">{qrCode ? <><img className="print-qr" src={qrCode} alt="QR platba" /><span>QR PLATBA</span></> : <span>Bankovní údaje nejsou nastavené</span>} </div><span>{statusText[invoice.status] ?? invoice.status}</span></div>
    </section>
    {!isAdvance && !isCorrective && invoice.status !== "PAID" && availableAdvances.length>0 && <section className="panel detail-card print-hide">
      <div className="panel-header"><div><h2>Uplatnit zálohu</h2><span>Uplatnit již uhrazenou zálohu na tuto existující fakturu.</span></div></div>
      <div className="form-grid">
        <div className="auth-field"><label>Záloha</label><select value={selectedAdvanceId} onChange={e => { setSelectedAdvanceId(e.target.value); const a=availableAdvances.find((x:any)=>x.id===e.target.value); setAdvanceAmount(a ? Number(a.availableToApply).toFixed(2) : ""); }}>
          <option value="">Vyberte zálohu</option>
          {availableAdvances.map((a:any)=><option key={a.id} value={a.id}>{a.number ?? a.id} · k uplatnění {Number(a.availableToApply).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</option>)}
        </select></div>
        <div className="auth-field"><label>Částka k uplatnění</label><input key={selectedAdvanceId || "no-advance"} ref={advanceAmountInput} type="text" inputMode="decimal" defaultValue={advanceAmount} autoComplete="off" /></div>
        <div className="customer-actions"><button className="button button-primary" onClick={applyAdvance} disabled={applyingAdvance || !selectedAdvanceId}>{applyingAdvance ? "Uplatňuji…" : "Uplatnit zálohu"}</button></div>
      </div>
    </section>}
    {invoice.advanceApplications.length>0&&<section className="panel detail-card"><div className="panel-header"><div><h2>Vypořádání záloh</h2><span>Uhrazené zálohy započtené do tohoto vyúčtování.</span></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Záloha</th><th>Datum úhrady</th><th className="amount">Uplatněno</th></tr></thead><tbody>{invoice.advanceApplications.map(a=><tr key={a.id}><td><Link href={`/doklad/${a.advanceInvoice.id}`}>{a.advanceInvoice.number??a.advanceInvoice.id}</Link></td><td>{a.advanceInvoice.payments.length ? a.advanceInvoice.payments.map(p=>new Date(p.paidAt).toLocaleDateString("cs-CZ")).join(", ") : "Neuvedeno"}</td><td className="amount">− {Number(a.amount).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td></tr>)}</tbody></table></div></section>}
  </div></AppShell>;
}

function Field({label,value,onChange,type="text"}:{label:string;value:string;onChange:(v:string)=>void;type?:string}) {
  return <div className="auth-field"><label>{label}</label><input type={type} value={value} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined} onChange={e=>onChange(e.target.value)}/></div>;
}
