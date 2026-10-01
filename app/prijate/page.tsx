"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Doc={id:string;documentNumber:string;supplierName:string;issueDate:string;dueDate:string|null;amount:string;paidAmount:string;category:{name:string}|null};
const money=(v:number)=>v.toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})+" Kč";

export default function ReceivedPage(){
 const [items,setItems]=useState<Doc[]>([]); const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/received-documents").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setItems(d.documents)}).catch(e=>setError(e.message))},[]);
 const outstanding=items.reduce((s,x)=>s+Math.max(0,Number(x.amount)-Number(x.paidAmount)),0);
 return <AppShell><div className="content">
  <header className="page-header"><div><p className="eyebrow">Přijaté</p><h1 className="page-title">Přijaté faktury</h1><p className="page-subtitle">Evidence dodavatelských dokladů a závazků.</p></div></header>
  {error&&<div className="auth-error settings-message">{error}</div>}
  <section className="stats-grid"><div className="stat-card"><span>Počet dokladů</span><strong>{items.length}</strong><small>evidovaných dodavatelských dokladů</small></div><div className="stat-card"><span>Závazky</span><strong>{money(outstanding)}</strong><small>neuhrazená část</small></div></section>
  <section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>Číslo</th><th>Dodavatel</th><th>Datum</th><th>Splatnost</th><th>Kategorie</th><th className="amount">Částka</th><th className="amount">Zbývá</th></tr></thead><tbody>{items.length?items.map(x=><tr key={x.id}><td>{x.documentNumber}</td><td>{x.supplierName}</td><td>{new Date(x.issueDate).toLocaleDateString("cs-CZ")}</td><td>{x.dueDate?new Date(x.dueDate).toLocaleDateString("cs-CZ"):"—"}</td><td>{x.category?.name||"—"}</td><td className="amount">{money(Number(x.amount))}</td><td className="amount">{money(Math.max(0,Number(x.amount)-Number(x.paidAmount)))}</td></tr>):<tr><td colSpan={7} className="empty-cell">Zatím nejsou žádné přijaté doklady.</td></tr>}</tbody></table></div></section>
 </div></AppShell>
}
