"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

type Bank = { id:string; name:string; accountNumber:string|null; bankCode:string|null; iban:string|null; openingBalance:string|number; isActive:boolean };
type Cash = { id:string; name:string; openingBalance:string|number; isActive:boolean };
type Category = { id:string; name:string; type:"INCOME"|"EXPENSE"|"BOTH"; isTaxDeductible:boolean; isActive:boolean };

const money = (v:string|number) => Number(v).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})+" Kč";
const emptyBank = { name:"", accountNumber:"", bankCode:"", iban:"", openingBalance:"0" };
const emptyCash = { name:"", openingBalance:"0" };
const emptyCategory = { name:"", type:"BOTH" as Category["type"], isTaxDeductible:true };

export default function FinanceSettingsPage() {
  const [banks,setBanks]=useState<Bank[]>([]), [cash,setCash]=useState<Cash[]>([]), [categories,setCategories]=useState<Category[]>([]);
  const [bank,setBank]=useState(emptyBank), [cashForm,setCashForm]=useState(emptyCash), [category,setCategory]=useState(emptyCategory);
  const [message,setMessage]=useState(""), [loading,setLoading]=useState(true);
  async function load(){
    setLoading(true);
    const [b,c,k]=await Promise.all([fetch("/api/settings/bank-accounts"),fetch("/api/settings/cash-registers"),fetch("/api/settings/categories")]);
    const [bd,cd,kd]=await Promise.all([b.json(),c.json(),k.json()]);
    if(!b.ok||!c.ok||!k.ok) throw new Error(bd.error||cd.error||kd.error||"Nastavení financí se nepodařilo načíst.");
    setBanks(bd.bankAccounts??[]); setCash(cd.cashRegisters??[]); setCategories(kd.categories??[]); setLoading(false);
  }
  useEffect(()=>{load().catch(e=>{setMessage(e.message);setLoading(false);});},[]);
  async function create(path:string, body:object, done:()=>void){
    const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}), d=await r.json().catch(()=>({}));
    if(!r.ok){setMessage(d.error??"Uložení se nepodařilo.");return;} done(); setMessage("Uloženo."); await load();
  }
  async function patch(path:string, body:object){
    const r=await fetch(path,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}), d=await r.json().catch(()=>({}));
    if(!r.ok){setMessage(d.error??"Uložení se nepodařilo.");return;} setMessage("Změny uloženy."); await load();
  }
  if(loading) return <AppShell><div className="content"><p className="page-subtitle">Načítám finanční nastavení…</p></div></AppShell>;
  return <AppShell><div className="content">
    <header className="page-header"><div><p className="eyebrow">Nastavení</p><h1 className="page-title">Finance</h1><p className="page-subtitle">Bankovní účty, pokladny a kategorie pro skutečné příjmy a výdaje.</p></div><Link className="button button-secondary" href="/nastaveni">← Nastavení firmy</Link></header>
    {message&&<div className={message.includes("ulo")||message==="Uloženo."?"auth-success settings-message":"auth-error settings-message"}>{message}</div>}
    <section className="panel"><div className="panel-header"><div><h2>Bankovní účty</h2><span>Počáteční zůstatek je základ pro výpočet aktuálního zůstatku.</span></div></div>
      <div className="settings-grid"><Field label="Název účtu" value={bank.name} onChange={v=>setBank({...bank,name:v})}/><Field label="Číslo účtu" value={bank.accountNumber} onChange={v=>setBank({...bank,accountNumber:v})}/><Field label="Kód banky" value={bank.bankCode} onChange={v=>setBank({...bank,bankCode:v})}/><Field label="IBAN" value={bank.iban} onChange={v=>setBank({...bank,iban:v.toUpperCase().replace(/\s/g,"")})}/><Field label="Počáteční zůstatek" type="number" value={bank.openingBalance} onChange={v=>setBank({...bank,openingBalance:v})}/><div className="auth-field"><label>&nbsp;</label><button className="button button-primary" onClick={()=>create("/api/settings/bank-accounts",bank,()=>setBank(emptyBank))}>Přidat účet</button></div></div>
      <Table><thead><tr><th>Název</th><th>Účet</th><th>IBAN</th><th>Počáteční stav</th><th>Stav</th><th></th></tr></thead><tbody>{banks.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.accountNumber?(x.accountNumber+(x.bankCode?" / "+x.bankCode:"")):"-"}</td><td>{x.iban??"-"}</td><td className="amount">{money(x.openingBalance)}</td><td><span className={x.isActive?"status status-paid":"status status-muted"}>{x.isActive?"Aktivní":"Neaktivní"}</span></td><td><button className="button button-secondary button-small" onClick={()=>patch("/api/settings/bank-accounts",{id:x.id,name:x.name,accountNumber:x.accountNumber,bankCode:x.bankCode,iban:x.iban,openingBalance:x.openingBalance,isActive:!x.isActive})}>{x.isActive?"Deaktivovat":"Aktivovat"}</button></td></tr>)}</tbody></Table>
    </section>
    <section className="panel"><div className="panel-header"><div><h2>Pokladny</h2><span>Samostatná pokladna pro hotovostní pohyby.</span></div></div>
      <div className="settings-grid"><Field label="Název pokladny" value={cashForm.name} onChange={v=>setCashForm({...cashForm,name:v})}/><Field label="Počáteční zůstatek" type="number" value={cashForm.openingBalance} onChange={v=>setCashForm({...cashForm,openingBalance:v})}/><div className="auth-field"><label>&nbsp;</label><button className="button button-primary" onClick={()=>create("/api/settings/cash-registers",cashForm,()=>setCashForm(emptyCash))}>Přidat pokladnu</button></div></div>
      <Table><thead><tr><th>Název</th><th>Počáteční stav</th><th>Stav</th><th></th></tr></thead><tbody>{cash.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td className="amount">{money(x.openingBalance)}</td><td><span className={x.isActive?"status status-paid":"status status-muted"}>{x.isActive?"Aktivní":"Neaktivní"}</span></td><td><button className="button button-secondary button-small" onClick={()=>patch("/api/settings/cash-registers",{id:x.id,name:x.name,openingBalance:x.openingBalance,isActive:!x.isActive})}>{x.isActive?"Deaktivovat":"Aktivovat"}</button></td></tr>)}</tbody></Table>
    </section>
    <section className="panel"><div className="panel-header"><div><h2>Kategorie</h2><span>Typ pohybu a daňová uznatelnost výdajů.</span></div></div>
      <div className="settings-grid"><Field label="Název kategorie" value={category.name} onChange={v=>setCategory({...category,name:v})}/><div className="auth-field"><label>Typ</label><select value={category.type} onChange={e=>setCategory({...category,type:e.target.value as Category["type"]})}><option value="BOTH">Příjem i výdaj</option><option value="INCOME">Příjem</option><option value="EXPENSE">Výdaj</option></select></div><label className="check-field"><input type="checkbox" checked={category.isTaxDeductible} onChange={e=>setCategory({...category,isTaxDeductible:e.target.checked})}/> Daňově uznatelná</label><div className="auth-field"><label>&nbsp;</label><button className="button button-primary" onClick={()=>create("/api/settings/categories",category,()=>setCategory(emptyCategory))}>Přidat kategorii</button></div></div>
      <Table><thead><tr><th>Název</th><th>Typ</th><th>Daňový výdaj</th><th>Stav</th><th></th></tr></thead><tbody>{categories.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.type==="BOTH"?"Příjem i výdaj":x.type==="INCOME"?"Příjem":"Výdaj"}</td><td>{x.isTaxDeductible?"Ano":"Ne"}</td><td><span className={x.isActive?"status status-paid":"status status-muted"}>{x.isActive?"Aktivní":"Neaktivní"}</span></td><td><button className="button button-secondary button-small" onClick={()=>patch("/api/settings/categories",{id:x.id,name:x.name,type:x.type,isTaxDeductible:x.isTaxDeductible,isActive:!x.isActive})}>{x.isActive?"Deaktivovat":"Aktivovat"}</button></td></tr>)}</tbody></Table>
    </section>
  </div></AppShell>;
}
function Field({label,value,onChange,type="text"}:{label:string;value:string|number|null;onChange:(v:string)=>void;type?:string}){return <div className="auth-field"><label>{label}</label><input type={type} value={value??""} onChange={e=>onChange(e.target.value)}/></div>}
function Table({children}:{children:React.ReactNode}){return <div className="table-wrap"><table className="data-table">{children}</table></div>}
