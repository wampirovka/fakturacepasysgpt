"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

const money=(v:number)=>v.toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})+" Kč";
const date=(v:string|null)=>v?new Date(v).toLocaleDateString("cs-CZ"):"-";

type Row={id:string;number:string;customer:string;issueDate:string;dueDate:string|null;total:number;paid:number;remaining:number;overdueDays:number};
type Data={summary:{total:number;paid:number;remaining:number;overdue:number};rows:Row[]};

export default function PohledavkyPage(){
 const [data,setData]=useState<Data|null>(null); const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/receivables").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d)}).catch(e=>setError(e.message));},[]);
 return <AppShell><div className="content">
  <header className="page-header"><div><p className="eyebrow">Daňová evidence</p><h1 className="page-title">Pohledávky</h1><p className="page-subtitle">Co mají zákazníci skutečně ještě uhradit.</p></div></header>
  {error&&<div className="auth-error settings-message">{error}</div>}
  {data&&<><section className="stats-grid">
   <div className="stat-card"><span>Celkem fakturováno</span><strong>{money(data.summary.total)}</strong></div>
   <div className="stat-card"><span>Uhrazeno</span><strong>{money(data.summary.paid)}</strong></div>
   <div className="stat-card"><span>K úhradě</span><strong>{money(data.summary.remaining)}</strong></div>
   <div className="stat-card"><span>Po splatnosti</span><strong>{money(data.summary.overdue)}</strong></div>
  </section>
  <section className="panel"><div className="panel-header"><div><h2>Odběratelé a jejich dluhy</h2><span>Vydané faktury bez konceptů a stornovaných dokladů</span></div></div>
   <div className="table-wrap"><table className="data-table"><thead><tr><th>Faktura</th><th>Odběratel</th><th>Vystaveno</th><th>Splatnost</th><th className="amount">Celkem</th><th className="amount">Uhrazeno</th><th className="amount">Zbývá</th><th>Stav</th></tr></thead>
   <tbody>{data.rows.map(x=><tr key={x.id}><td>{x.number}</td><td>{x.customer}</td><td>{date(x.issueDate)}</td><td>{date(x.dueDate)}</td><td className="amount">{money(x.total)}</td><td className="amount">{money(x.paid)}</td><td className="amount"><strong>{money(x.remaining)}</strong></td><td>{x.remaining===0?"Uhrazeno":x.overdueDays>0?"Po splatnosti · "+x.overdueDays+" d":"Neuhrazeno"}</td></tr>)}</tbody>
   </table></div>
  </section></>}
 </div></AppShell>;
}