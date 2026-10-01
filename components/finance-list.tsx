"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Movement={id:string;date:string;amount:string;method:string;description:string|null;category:{name:string}|null;bankAccount:{name:string}|null;cashRegister:{name:string}|null};
const money=(v:number)=>v.toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})+" Kč";
const method=(v:string)=>({BANK_TRANSFER:"Banka",CASH:"Hotově",CARD:"Kartou",OTHER:"Jiné"}[v]??v);

export function FinanceList({type}:{type:"INCOME"|"EXPENSE"}) {
  const [items,setItems]=useState<Movement[]>([]);
  const [error,setError]=useState("");
  const year=new Date().getFullYear();
  useEffect(()=>{fetch("/api/finance?year="+year+"&type="+type).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setItems(d.movements)}).catch(e=>setError(e.message))},[type]);
  const total=items.reduce((s,x)=>s+Number(x.amount),0);
  return <AppShell><div className="content">
    <header className="page-header"><div><p className="eyebrow">Finance</p><h1 className="page-title">{type==="INCOME"?"Příjmy":"Výdaje"}</h1><p className="page-subtitle">Skutečné finanční pohyby za rok {year}. Faktura sama o sobě ještě peníze do kapsy nevloží.</p></div></header>
    {error&&<div className="auth-error settings-message">{error}</div>}
    <section className="stats-grid"><div className="stat-card"><span>{type==="INCOME"?"Příjmy":"Výdaje"} {year}</span><strong>{money(total)}</strong><small>{items.length} pohybů</small></div></section>
    <section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>Datum</th><th>Popis</th><th>Kategorie</th><th>Způsob</th><th>Účet / pokladna</th><th className="amount">Částka</th></tr></thead><tbody>{items.length?items.map(x=><tr key={x.id}><td>{new Date(x.date).toLocaleDateString("cs-CZ")}</td><td>{x.description||"—"}</td><td>{x.category?.name||"—"}</td><td>{method(x.method)}</td><td>{x.bankAccount?.name||x.cashRegister?.name||"—"}</td><td className="amount">{money(Number(x.amount))}</td></tr>):<tr><td colSpan={6} className="empty-cell">Zatím nejsou evidované žádné pohyby.</td></tr>}</tbody></table></div></section>
  </div></AppShell>;
}
