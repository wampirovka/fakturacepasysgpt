"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Report = { year:number; totalInvoiced:number; totalPaid:number; outstanding:number; overdue:number; cash:number; settledAdvances:number; invoiceCount:number; month:{month:number;invoiced:number;paid:number}[] };
const months=["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];

export default function PrehledyPage() {
  const [year,setYear]=useState(new Date().getFullYear());
  const [report,setReport]=useState<Report|null>(null);
  const [message,setMessage]=useState("");
  useEffect(()=>{fetch("/api/reports?year="+year).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setReport(d)}).catch(e=>setMessage(e.message??"Přehled se nepodařilo načíst."));},[year]);

  return <AppShell><div className="content">
    <header className="page-header"><div><p className="eyebrow">Přehledy</p><h1 className="page-title">Přehled firmy</h1><p className="page-subtitle">Základní obraz fakturace, úhrad a pohledávek. Žádné účetní kouzelnictví.</p></div>
      <select className="table-input" style={{width:120}} value={year} onChange={e=>setYear(Number(e.target.value))}>{[year-1,year,year+1].map(y=><option key={y}>{y}</option>)}</select>
    </header>
    {message&&<div className="auth-error settings-message">{message}</div>}
    {report&&<><section className="stats-grid">
      <div className="stat-card"><span>Fakturace</span><strong>{report.totalInvoiced.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>{report.invoiceCount} faktur</small></div>
      <div className="stat-card"><span>Přijato</span><strong>{report.totalPaid.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>skutečně evidované úhrady</small></div>
      <div className="stat-card"><span>K pohledávce</span><strong>{report.outstanding.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>aktuálně neuhrazeno</small></div>
      <div className="stat-card"><span>Po splatnosti</span><strong>{report.overdue.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong><small>neuhrazené po termínu</small></div>
    </section>
    <section className="panel"><div className="panel-header"><div><h2>Měsíční přehled</h2><span>Vystavené doklady a přijaté úhrady podle data.</span></div></div>
      <div className="report-chart">{report.month.map((m,i)=>{const max=Math.max(...report.month.flatMap(x=>[x.invoiced,x.paid]),1);return <div className="report-chart-month" key={m.month}><div className="report-chart-bars"><span className="report-bar report-bar-invoiced" style={{height:(Math.max(4,m.invoiced/max*100))+"%"}}/><span className="report-bar report-bar-paid" style={{height:(Math.max(4,m.paid/max*100))+"%"}}/></div><small>{months[i].slice(0,3)}</small></div>})}</div>
      <div className="chart-legend"><span><i className="legend-dot legend-invoiced"/>Vystaveno</span><span><i className="legend-dot legend-paid"/>Uhrazeno</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Měsíc</th><th className="amount">Vystaveno</th><th className="amount">Uhrazeno</th></tr></thead><tbody>{report.month.map((m,i)=><tr key={m.month}><td>{months[i]}</td><td className="amount">{m.invoiced.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td><td className="amount">{m.paid.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</td></tr>)}</tbody></table></div>
    </section>
    <section className="panel"><div className="panel-header"><div><h2>Vypořádané zálohy</h2><span>Částky odečtené z konečných faktur. Nejde o nový příjem peněz.</span></div></div><div className="detail-total"><span>Vypořádané zálohy</span><strong>{report.settledAdvances.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div></section>
    <section className="panel"><div className="panel-header"><div><h2>Hotovost</h2><span>Součet evidovaných hotovostních příjmů za rok.</span></div></div><div className="detail-total grand"><span>Hotovostní příjmy</span><strong>{report.cash.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč</strong></div></section>
    </>}
  </div></AppShell>;
}
