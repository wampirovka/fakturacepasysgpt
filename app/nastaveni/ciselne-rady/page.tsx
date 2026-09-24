"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const labels: Record<string, string> = { INVOICE: "Faktury", ADVANCE: "Zálohové faktury", CASH_DOCUMENT: "Pokladní doklady" };

export default function CiselneRadyPage() {
  const [series, setSeries] = useState<any[]>([]); const [year, setYear] = useState(new Date().getFullYear()); const [message, setMessage] = useState("");
  async function load() { const r=await fetch("/api/numbering"); const d=await r.json().catch(()=>({})); if(!r.ok){setMessage(d.error??"Řady se nepodařilo načíst.");return;} setSeries(d.series??[]);setYear(d.year); }
  useEffect(()=>{load().catch(()=>setMessage("Řady se nepodařilo načíst."));},[]);
  async function save(item:any){const r=await fetch("/api/numbering",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...item,nextNumber:Number(item.nextNumber),padding:Number(item.padding)})});const d=await r.json().catch(()=>({}));if(!r.ok){setMessage(d.error??"Řadu se nepodařilo uložit.");return;}setSeries(s=>s.map(x=>x.id===item.id?d.series:x));setMessage("Číselná řada byla uložena.");}
  return <AppShell><div className="content"><header className="page-header"><div><p className="eyebrow">Nastavení</p><h1 className="page-title">Číselné řady</h1><p className="page-subtitle">Formát a další číslo. Již přidělená čísla se nikdy neposouvají zpět.</p></div><Link className="button button-secondary" href="/nastaveni">← Nastavení firmy</Link></header>
  {message&&<div className={message.includes("uložena")?"auth-success settings-message":"auth-error settings-message"}>{message}</div>}
  <section className="panel"><div className="panel-header"><div><h2>Řady pro rok {year}</h2><span>Například 2026001, 92026001 a 82026001.</span></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Doklad</th><th>Prefix</th><th>Další číslo</th><th>Číslic</th><th>Náhled</th><th></th></tr></thead><tbody>{series.map(item=><SeriesRow key={item.id} item={item} onSave={save}/>)}</tbody></table></div></section></div></AppShell>;
}
function SeriesRow({item,onSave}:{item:any;onSave:(item:any)=>void}){const[draft,setDraft]=useState(item);useEffect(()=>setDraft(item),[item]);const preview=draft.prefix+String(draft.year)+String(draft.nextNumber).padStart(Number(draft.padding)||1,"0");return <tr><td><strong>{labels[draft.type]??draft.type}</strong></td><td><input className="table-input" value={draft.prefix} onChange={e=>setDraft({...draft,prefix:e.target.value})}/></td><td><input className="table-input table-number" type="number" min="1" value={draft.nextNumber} onChange={e=>setDraft({...draft,nextNumber:e.target.value})}/></td><td><input className="table-input table-number" type="number" min="1" max="8" value={draft.padding} onChange={e=>setDraft({...draft,padding:e.target.value})}/></td><td><strong>{preview}</strong></td><td><button className="button button-secondary button-small" onClick={()=>onSave(draft)}>Uložit</button></td></tr>}
