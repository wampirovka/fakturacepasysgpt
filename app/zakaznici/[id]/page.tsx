"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Invoice = {
  id:string; number:string|null; type:string; status:string; issueDate:string; dueDate:string|null;
  total:string|number; paidAmount:string|number;
  payments:{ id:string; amount:string|number; paidAt:string }[];
};
type Customer = { id:string; name:string; ico:string|null; dic:string|null; street:string|null; city:string|null; zip:string|null; email:string|null; phone:string|null };
type Summary = { invoiced:number; paid:number; outstanding:number; advances:number };

const statusText:Record<string,string>={ISSUED:"Vystavená",PARTIALLY_PAID:"Částečně uhrazená",PAID:"Uhrazená",OVERDUE:"Po splatnosti",CANCELLED:"Stornovaná",DRAFT:"Rozpracovaná"};

export default function CustomerDetail({params}:{params:Promise<{id:string}>}) {
  const [customer,setCustomer]=useState<Customer|null>(null);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [message,setMessage]=useState("");

  useEffect(()=>{params.then(({id})=>fetch("/api/customers/"+id,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setCustomer(d.customer);setInvoices(d.customer.invoices??[]);setSummary(d.summary)}).catch(e=>setMessage(e.message??"Zákazníka se nepodařilo načíst.")))},[params]);

  if(message) return <AppShell><div className="content"><div className="auth-error settings-message">{message}</div></div></AppShell>;
  if(!customer) return <AppShell><div className="content"><p>Načítám…</p></div></AppShell>;

  return <AppShell><div className="content">
    <header className="page-header">
      <div><p className="eyebrow">Zákazník</p><h1 className="page-title">{customer.name}</h1><p className="page-subtitle">{[customer.street,customer.zip,customer.city].filter(Boolean).join(", ")||"Bez adresy"}{customer.ico?" · IČO "+customer.ico:""}</p></div>
      <div className="customer-actions"><Link className="button button-secondary" href="/zakaznici">Zpět na zákazníky</Link></div>
    </header>

    <section className="stats-grid">
      <div className="stat-card"><span>Fakturace</span><strong>{(summary?.invoiced??0).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>běžné faktury</small></div>
      <div className="stat-card"><span>Uhrazeno</span><strong>{(summary?.paid??0).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>evidované úhrady</small></div>
      <div className="stat-card"><span>Neuhrazeno</span><strong>{(summary?.outstanding??0).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>aktuální pohledávka</small></div>
      <div className="stat-card"><span>Zálohy</span><strong>{(summary?.advances??0).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>vystavené zálohy</small></div>
    </section>

    <section className="panel"><div className="panel-header"><div><h2>Kontaktní údaje</h2></div></div>
      <div className="settings-grid">
        <div><strong>{customer.name}</strong></div><div>{customer.ico?"IČO: "+customer.ico:""}</div><div>{customer.dic?"DIČ: "+customer.dic:""}</div>
        <div>{customer.email??"Bez e-mailu"}</div><div>{customer.phone??"Bez telefonu"}</div>
      </div>
    </section>

    <section className="panel"><div className="panel-header"><div><h2>Historie dokladů</h2><span>{invoices.length} dokladů</span></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Číslo</th><th>Typ</th><th>Datum</th><th>Stav</th><th className="amount">Částka</th><th className="amount">Uhrazeno</th><th></th></tr></thead>
      <tbody>{invoices.length?invoices.map(i=><tr key={i.id}><td><strong>{i.number??"-"}</strong></td><td>{i.type==="ADVANCE"?"Zálohová":"Faktura"}</td><td>{new Date(i.issueDate).toLocaleDateString("cs-CZ")}</td><td>{statusText[i.status]??i.status}</td><td className="amount">{Number(i.total).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td><td className="amount">{Number(i.paidAmount).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td><td><Link className="button button-secondary button-small" href={"/doklad/"+i.id}>Detail</Link></td></tr>):<tr><td colSpan={7} className="table-muted">Zatím žádné doklady.</td></tr>}</tbody></table></div>
    </section>
  </div></AppShell>;
}
