"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

const money=(v:number)=>v.toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})+" Kč";
type Data={year:number;totals:{income:number;expense:number;difference:number;deductibleExpense:number};categories:{name:string;income:number;expense:number;deductibleExpense:number}[];receivables:{remaining:number};payables:{remaining:number};bankAccounts:{id:string;name:string;balance:number}[];cashRegisters:{id:string;name:string;balance:number}[]};

export default function TaxEvidencePage(){
 const [year,setYear]=useState(new Date().getFullYear());
 const [data,setData]=useState<Data|null>(null); const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/tax-evidence?year="+year).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d)}).catch(e=>setError(e.message));},[year]);
 return <AppShell><div className="content">
  <header className="page-header"><div><p className="eyebrow">Daňová evidence</p><h1 className="page-title">Přehled</h1><p className="page-subtitle">Skutečné příjmy a výdaje, pohledávky, závazky a zůstatky.</p></div><select value={year} onChange={e=>setYear(Number(e.target.value))}>{[year-2,year-1,year,year+1].map(y=><option key={y}>{y}</option>)}</select></header>
  {error&&<div className="auth-error settings-message">{error}</div>}
  {data&&<><section className="stats-grid"><div className="stat-card"><span>Příjmy</span><strong>{money(data.totals.income)}</strong><small>skutečně přijaté</small></div><div className="stat-card"><span>Výdaje</span><strong>{money(data.totals.expense)}</strong><small>skutečně uhrazené</small></div><div className="stat-card"><span>Rozdíl</span><strong>{money(data.totals.difference)}</strong><small>příjmy − výdaje</small></div><div className="stat-card"><span>Daňově uznatelné výdaje</span><strong>{money(data.totals.deductibleExpense)}</strong><small>podle kategorií</small></div></section>
  <section className="stats-grid"><div className="stat-card"><span>Pohledávky</span><strong>{money(data.receivables.remaining)}</strong><small>zbývá od zákazníků</small></div><div className="stat-card"><span>Závazky</span><strong>{money(data.payables.remaining)}</strong><small>zbývá dodavatelům</small></div><div className="stat-card"><span>Banka</span><strong>{money(data.bankAccounts.reduce((s,x)=>s+x.balance,0))}</strong><small>aktuální zůstatek</small></div><div className="stat-card"><span>Pokladna</span><strong>{money(data.cashRegisters.reduce((s,x)=>s+x.balance,0))}</strong><small>aktuální zůstatek</small></div></section>
  <section className="panel"><div className="panel-header"><div><h2>Podle kategorií</h2><span>Rozpad skutečných finančních pohybů</span></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Kategorie</th><th className="amount">Příjmy</th><th className="amount">Výdaje</th><th className="amount">Uznatelné výdaje</th></tr></thead><tbody>{data.categories.map((x,i)=><tr key={i}><td>{x.name}</td><td className="amount">{money(x.income)}</td><td className="amount">{money(x.expense)}</td><td className="amount">{money(x.deductibleExpense)}</td></tr>)}</tbody></table></div></section>
  <section className="panel"><div className="panel-header"><div><h2>Účty a pokladny</h2><span>Zůstatek = počáteční stav + finanční pohyby</span></div></div><div className="table-wrap"><table className="data-table"><tbody>{data.bankAccounts.map(x=><tr key={"b"+x.id}><td>Banka · {x.name}</td><td className="amount">{money(x.balance)}</td></tr>)}{data.cashRegisters.map(x=><tr key={"c"+x.id}><td>Pokladna · {x.name}</td><td className="amount">{money(x.balance)}</td></tr>)}</tbody></table></div></section>
  </>}
 </div></AppShell>;
}
