"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Movement={id:string;date:string;amount:string;method:string;description:string|null;category:{name:string}|null;bankAccount:{name:string}|null;cashRegister:{name:string}|null};
type Account={id:string;name:string};
type Category={id:string;name:string;type:"INCOME"|"EXPENSE"|"BOTH";isActive:boolean};
const money=(v:number)=>v.toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})+" Kč";
const method=(v:string)=>({BANK_TRANSFER:"Banka",CASH:"Hotově",CARD:"Kartou",OTHER:"Jiné"}[v]??v);

export function FinanceList({type}:{type:"INCOME"|"EXPENSE"}) {
  const [items,setItems]=useState<Movement[]>([]), [accounts,setAccounts]=useState<Account[]>([]), [cash,setCash]=useState<Account[]>([]), [categories,setCategories]=useState<Category[]>([]);
  const [error,setError]=useState(""), [open,setOpen]=useState(false), [saving,setSaving]=useState(false);
  const [form,setForm]=useState({amount:"",date:new Date().toISOString().slice(0,10),method:"BANK_TRANSFER",bankAccountId:"",cashRegisterId:"",categoryId:"",description:"",note:""});
  const year=new Date().getFullYear();

  async function load(){
    const [mr,ar,cr]=await Promise.all([fetch("/api/finance?year="+year+"&type="+type),fetch("/api/finance/accounts"),fetch("/api/settings/categories")]);
    const [m,a,c]=await Promise.all([mr.json(),ar.json(),cr.json()]);
    if(!mr.ok) throw new Error(m.error??"Pohyby se nepodařilo načíst.");
    setItems(m.movements??[]); setAccounts(a.bankAccounts??[]); setCash(a.cashRegisters??[]); setCategories((c.categories??[]).filter((x:Category)=>x.isActive&&(x.type===type||x.type==="BOTH")));
  }
  useEffect(()=>{load().catch(e=>setError(e.message));},[type]);

  async function createMovement(e:React.FormEvent){
    e.preventDefault(); setSaving(true); setError("");
    const body={...form,type};
    const r=await fetch("/api/finance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){setError(d.error??"Pohyb se nepodařilo uložit.");setSaving(false);return;}
    setForm({...form,amount:"",description:"",note:""}); setOpen(false); await load(); setSaving(false);
  }

  const total=items.reduce((s,x)=>s+Number(x.amount),0);
  return <AppShell><div className="content">
    <header className="page-header"><div><p className="eyebrow">Finance</p><h1 className="page-title">{type==="INCOME"?"Příjmy":"Výdaje"}</h1><p className="page-subtitle">Skutečné finanční pohyby za rok {year}. Faktura sama o sobě ještě peníze do kapsy nevloží.</p></div><button className="button button-primary" onClick={()=>setOpen(!open)}>+ Nový {type==="INCOME"?"příjem":"výdaj"}</button></header>
    {error&&<div className="auth-error settings-message">{error}</div>}
    {open&&<form className="panel invoice-editor" onSubmit={createMovement}><div className="panel-header"><div><h2>Nový {type==="INCOME"?"příjem":"výdaj"}</h2><span>Zadává se skutečný pohyb peněz, ne vystavený doklad.</span></div></div>
      <div className="settings-grid">
        <Field label="Částka" type="number" value={form.amount} onChange={v=>setForm({...form,amount:v})} required/>
        <Field label="Datum" type="date" value={form.date} onChange={v=>setForm({...form,date:v})}/>
        <div className="auth-field"><label>Způsob</label><select value={form.method} onChange={e=>setForm({...form,method:e.target.value,bankAccountId:"",cashRegisterId:""})}><option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option><option value="CARD">Kartou</option><option value="OTHER">Jiné</option></select></div>
        {form.method==="BANK_TRANSFER"&&<div className="auth-field"><label>Bankovní účet *</label><select value={form.bankAccountId} onChange={e=>setForm({...form,bankAccountId:e.target.value})} required><option value="">Vyberte účet</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
        {form.method==="CASH"&&<div className="auth-field"><label>Pokladna *</label><select value={form.cashRegisterId} onChange={e=>setForm({...form,cashRegisterId:e.target.value})} required><option value="">Vyberte pokladnu</option>{cash.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
        <div className="auth-field"><label>Kategorie</label><select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}><option value="">Bez kategorie</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <Field label="Popis" value={form.description} onChange={v=>setForm({...form,description:v})}/><Field label="Poznámka" value={form.note} onChange={v=>setForm({...form,note:v})}/>
      </div>
      <div className="invoice-form-actions"><button className="button button-secondary" type="button" onClick={()=>setOpen(false)}>Zrušit</button><button className="button button-primary" disabled={saving}>{saving?"Ukládám…":"Uložit pohyb"}</button></div>
    </form>}
    <section className="stats-grid"><div className="stat-card"><span>{type==="INCOME"?"Příjmy":"Výdaje"} {year}</span><strong>{money(total)}</strong><small>{items.length} pohybů</small></div></section>
    <section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>Datum</th><th>Popis</th><th>Kategorie</th><th>Způsob</th><th>Účet / pokladna</th><th className="amount">Částka</th></tr></thead><tbody>{items.length?items.map(x=><tr key={x.id}><td>{new Date(x.date).toLocaleDateString("cs-CZ")}</td><td>{x.description||"—"}</td><td>{x.category?.name||"—"}</td><td>{method(x.method)}</td><td>{x.bankAccount?.name||x.cashRegister?.name||"—"}</td><td className="amount">{money(Number(x.amount))}</td></tr>):<tr><td colSpan={6} className="empty-cell">Zatím nejsou evidované žádné pohyby.</td></tr>}</tbody></table></div></section>
  </div></AppShell>;
}

function Field({label,value,onChange,type="text",required=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}){return <div className="auth-field"><label>{label}{required?" *":""}</label><input type={type} value={value} required={required} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined} onChange={e=>onChange(e.target.value)}/></div>}
