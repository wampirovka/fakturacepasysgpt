"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

type CashDoc={id:string;number:string|null;date:string;amount:string|number;method:string;note:string|null;payment:{invoice:{id:string;number:string|null;customer:{name:string}|null}}|null};
export default function PokladnaPage(){
  const [docs,setDocs]=useState<CashDoc[]>([]); const [balance,setBalance]=useState(0); const [message,setMessage]=useState("");
  async function load(){const r=await fetch("/api/cash");const d=await r.json().catch(()=>({}));if(!r.ok){setMessage(d.error??"Pokladnu se nepodařilo načíst.");return;}setDocs(d.documents??[]);setBalance(Number(d.balance??0));}
  useEffect(()=>{load().catch(()=>setMessage("Pokladnu se nepodařilo načíst."));},[]);
  return <AppShell><div className="content">
    <header className="page-header"><div><p className="eyebrow">Finance</p><h1 className="page-title">Pokladna</h1><p className="page-subtitle">Přehled hotovostních příjmů a automaticky vytvořených pokladních dokladů.</p></div>
      <div className="customer-actions"><button className="button button-primary" onClick={()=>window.print()}>Tisk</button></div>
    </header>
    {message&&<div className="auth-error settings-message">{message}</div>}
    <section className="stats-grid"><div className="stat-card"><span>Hotovostní příjmy</span><strong>{balance.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>evidováno v pokladně</small></div><div className="stat-card"><span>Doklady</span><strong>{docs.length}</strong><small>pokladních dokladů</small></div></section>
    <section className="panel"><div className="panel-header"><div><h2>Pokladní doklady</h2><span>Doklad vzniká automaticky při hotovostní úhradě faktury.</span></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Číslo</th><th>Datum</th><th>Faktura</th><th>Zákazník</th><th>Poznámka</th><th></th><th className="amount">Částka</th></tr></thead><tbody>{docs.length?docs.map(d=><tr key={d.id}><td><strong>{d.number??"-"}</strong></td><td>{new Date(d.date).toLocaleDateString("cs-CZ")}</td><td>{d.payment?.invoice.number??"-"}</td><td>{d.payment?.invoice.customer?.name??"-"}</td><td>{d.note??"-"}</td><td><Link className="button button-secondary button-small" href={`/pokladna/${d.id}`}>Doklad</Link></td><td className="amount">{Number(d.amount).toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td></tr>):<tr><td colSpan={7} className="table-muted">Zatím nejsou žádné pokladní doklady.</td></tr>}</tbody></table></div>
    </section>
    <section className="panel print-only-cash"><h2>Pokladna za aktuální období</h2><p>Celkem hotovostních příjmů: <strong>{balance.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></p></section>
  </div></AppShell>
}
