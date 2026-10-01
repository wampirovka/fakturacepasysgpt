"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Doc={id:string;documentNumber:string;supplierName:string;issueDate:string;dueDate:string|null;amount:string;paidAmount:string;category:{name:string}|null};
type Account={id:string;name:string};
const money=(v:number)=>v.toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})+" Kč";

export default function ReceivedPage(){
 const [items,setItems]=useState<Doc[]>([]);
 const [bankAccounts,setBankAccounts]=useState<Account[]>([]);
 const [cashRegisters,setCashRegisters]=useState<Account[]>([]);
 const [error,setError]=useState("");
 const [openId,setOpenId]=useState<string|null>(null);
 const [saving,setSaving]=useState(false);
 const [form,setForm]=useState({amount:"",paidAt:new Date().toISOString().slice(0,10),method:"BANK_TRANSFER",bankAccountId:"",cashRegisterId:"",note:""});

 async function load(){
   const [dr,ar]=await Promise.all([fetch("/api/received-documents"),fetch("/api/finance/accounts")]);
   const d=await dr.json().catch(()=>({})); const a=await ar.json().catch(()=>({}));
   if(!dr.ok) throw new Error(d.error??"Nepodařilo se načíst přijaté doklady.");
   setItems(d.documents??[]);
   if(ar.ok){setBankAccounts(a.bankAccounts??[]);setCashRegisters(a.cashRegisters??[]);}
 }
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 const outstanding=items.reduce((s,x)=>s+Math.max(0,Number(x.amount)-Number(x.paidAmount)),0);

 function openPayment(x:Doc){
   const remaining=Math.max(0,Number(x.amount)-Number(x.paidAmount));
   setOpenId(x.id);
   setForm({amount:remaining.toFixed(2),paidAt:new Date().toISOString().slice(0,10),method:"BANK_TRANSFER",bankAccountId:"",cashRegisterId:"",note:""});
   setError("");
 }
 async function createPayment(e:React.FormEvent){
   e.preventDefault(); if(!openId)return; setSaving(true);setError("");
   try{
     const r=await fetch("/api/received-documents/"+openId+"/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
     const d=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(d.error??"Úhradu se nepodařilo uložit.");
     setOpenId(null); await load();
   }catch(e){setError(e instanceof Error?e.message:"Úhradu se nepodařilo uložit.");}
   finally{setSaving(false);}
 }

 return <AppShell><div className="content">
  <header className="page-header"><div><p className="eyebrow">Přijaté</p><h1 className="page-title">Přijaté faktury</h1><p className="page-subtitle">Evidence dodavatelských dokladů a závazků. Úhrada se zapisuje jako skutečný výdaj.</p></div></header>
  {error&&<div className="auth-error settings-message">{error}</div>}
  <section className="stats-grid"><div className="stat-card"><span>Počet dokladů</span><strong>{items.length}</strong><small>evidovaných dodavatelských dokladů</small></div><div className="stat-card"><span>Závazky</span><strong>{money(outstanding)}</strong><small>neuhrazená část</small></div></section>
  {openId&&<form className="panel invoice-editor" onSubmit={createPayment}>
   <div className="panel-header"><div><h2>Úhrada přijatého dokladu</h2><span>{items.find(x=>x.id===openId)?.supplierName} · {items.find(x=>x.id===openId)?.documentNumber}</span></div></div>
   <div className="settings-grid">
    <Field label="Částka" type="number" value={form.amount} onChange={v=>setForm({...form,amount:v})} required/>
    <Field label="Datum úhrady" type="date" value={form.paidAt} onChange={v=>setForm({...form,paidAt:v})}/>
    <div className="auth-field"><label>Způsob úhrady</label><select value={form.method} onChange={e=>setForm({...form,method:e.target.value,bankAccountId:"",cashRegisterId:""})}><option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option><option value="CARD">Kartou</option><option value="OTHER">Jiné</option></select></div>
    {form.method==="BANK_TRANSFER"&&<div className="auth-field"><label>Bankovní účet</label><select value={form.bankAccountId} onChange={e=>setForm({...form,bankAccountId:e.target.value})} required><option value="">Vyberte účet</option>{bankAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
    {form.method==="CASH"&&<div className="auth-field"><label>Pokladna</label><select value={form.cashRegisterId} onChange={e=>setForm({...form,cashRegisterId:e.target.value})} required><option value="">Vyberte pokladnu</option>{cashRegisters.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
    <Field label="Poznámka" value={form.note} onChange={v=>setForm({...form,note:v})}/>
   </div>
   <div className="invoice-form-actions"><button className="button button-secondary" type="button" onClick={()=>setOpenId(null)}>Zrušit</button><button className="button button-primary" disabled={saving}>{saving?"Ukládám…":"Zadat úhradu"}</button></div>
  </form>}
  <section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>Číslo</th><th>Dodavatel</th><th>Datum</th><th>Splatnost</th><th>Kategorie</th><th className="amount">Částka</th><th className="amount">Zbývá</th><th></th></tr></thead><tbody>{items.length?items.map(x=>{const remaining=Math.max(0,Number(x.amount)-Number(x.paidAmount));return <tr key={x.id}><td>{x.documentNumber}</td><td>{x.supplierName}</td><td>{new Date(x.issueDate).toLocaleDateString("cs-CZ")}</td><td>{x.dueDate?new Date(x.dueDate).toLocaleDateString("cs-CZ"):"—"}</td><td>{x.category?.name||"—"}</td><td className="amount">{money(Number(x.amount))}</td><td className="amount">{money(remaining)}</td><td>{remaining>0&&<button className="button button-secondary button-small" onClick={()=>openPayment(x)}>Zadat úhradu</button>}</td></tr>}) : <tr><td colSpan={8} className="empty-cell">Zatím nejsou žádné přijaté doklady.</td></tr>}</tbody></table></div></section>
 </div></AppShell>
}
function Field({label,value,onChange,type="text",required=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}){
 const id=label.toLowerCase().replace(/[^a-z0-9]+/g,"-");
 return <div className="auth-field"><label htmlFor={id}>{label}{required?" *":""}</label><input id={id} type={type} value={value} required={required} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined} onChange={e=>onChange(e.target.value)}/></div>;
}
