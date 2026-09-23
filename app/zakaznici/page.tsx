"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Customer={id:string;type:"BUSINESS"|"PERSON";name:string;ico:string|null;dic:string|null;street:string|null;city:string|null;zip:string|null;country:string;email:string|null;phone:string|null;note:string|null};
const empty={type:"BUSINESS" as const,name:"",ico:"",dic:"",street:"",city:"",zip:"",country:"CZ",email:"",phone:"",note:""};

export default function ZakazniciPage(){
 const [items,setItems]=useState<Customer[]>([]),[form,setForm]=useState(empty),[edit,setEdit]=useState<string|null>(null),[q,setQ]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[msg,setMsg]=useState<string|null>(null);
 async function load(){setLoading(true);try{const r=await fetch("/api/customers?q="+encodeURIComponent(q),{cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.customers)}catch(e){setMsg(e instanceof Error?e.message:"Načtení se nepodařilo.")}finally{setLoading(false)}}
 useEffect(()=>{const t=setTimeout(load,150);return()=>clearTimeout(t)},[q]);
 function reset(){setEdit(null);setForm(empty);setMsg(null)}
 function change(k:keyof typeof empty,v:string){setForm(f=>({...f,[k]:v}))}
 function start(c:Customer){setEdit(c.id);setForm({type:c.type,name:c.name,ico:c.ico??"",dic:c.dic??"",street:c.street??"",city:c.city??"",zip:c.zip??"",country:c.country??"CZ",email:c.email??"",phone:c.phone??"",note:c.note??""});setMsg(null);scrollTo({top:0,behavior:"smooth"})}
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setMsg(null);try{const r=await fetch(edit?"/api/customers/"+edit:"/api/customers",{method:edit?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)}),d=await r.json();if(!r.ok)throw Error(d.error);setMsg(edit?"Zákazník upraven.":"Zákazník přidán.");reset();await load()}catch(e){setMsg(e instanceof Error?e.message:"Uložení se nepodařilo.")}finally{setSaving(false)}}
 async function hide(id:string){if(!confirm("Skrýt zákazníka ze seznamu? Historická data zůstanou zachována."))return;const r=await fetch("/api/customers/"+id,{method:"DELETE"}),d=await r.json();if(!r.ok){setMsg(d.error);return}setMsg("Zákazník deaktivován.");load()}
 return <AppShell><div className="content">
  <div className="page-header"><div><p className="eyebrow">Adresář</p><h1 className="page-title">Zákazníci</h1><p className="page-subtitle">Odběratelé aktuální firmy.</p></div><button className="button button-primary" onClick={reset}>+ Nový zákazník</button></div>
  {msg&&<div className="settings-message auth-success">{msg}</div>}
  <section className="panel customer-editor"><div className="panel-header"><div><h2>{edit?"Upravit zákazníka":"Nový zákazník"}</h2><span>Údaje lze kdykoliv změnit.</span></div></div>
   <form className="settings-grid" onSubmit={save}>
    <div className="auth-field"><label>Typ</label><select value={form.type} onChange={e=>change("type",e.target.value)}><option value="BUSINESS">Firma</option><option value="PERSON">Fyzická osoba</option></select></div>
    <div className="auth-field"><label>Název / jméno *</label><input required value={form.name} onChange={e=>change("name",e.target.value)}/></div>
    <div className="auth-field"><label>IČO</label><input value={form.ico} onChange={e=>change("ico",e.target.value)}/></div>
    <div className="auth-field"><label>DIČ</label><input value={form.dic} onChange={e=>change("dic",e.target.value)}/></div>
    <div className="auth-field settings-wide"><label>Ulice a číslo</label><input value={form.street} onChange={e=>change("street",e.target.value)}/></div>
    <div className="auth-field"><label>Město</label><input value={form.city} onChange={e=>change("city",e.target.value)}/></div>
    <div className="auth-field"><label>PSČ</label><input value={form.zip} onChange={e=>change("zip",e.target.value)}/></div>
    <div className="auth-field"><label>Stát</label><input value={form.country} onChange={e=>change("country",e.target.value)}/></div>
    <div className="auth-field"><label>E-mail</label><input type="email" value={form.email} onChange={e=>change("email",e.target.value)}/></div>
    <div className="auth-field"><label>Telefon</label><input value={form.phone} onChange={e=>change("phone",e.target.value)}/></div>
    <div className="auth-field settings-wide"><label>Poznámka</label><textarea className="customer-note" rows={3} value={form.note} onChange={e=>change("note",e.target.value)}/></div>
    <div className="settings-wide customer-form-actions"><button className="button button-primary" disabled={saving}>{saving?"Ukládám…":edit?"Uložit změny":"Přidat zákazníka"}</button>{edit&&<button type="button" className="button button-secondary" onClick={reset}>Zrušit</button>}</div>
   </form>
  </section>
  <section className="panel"><div className="panel-header"><div><h2>Seznam zákazníků</h2><span>{items.length} aktivních</span></div><input className="customer-search" placeholder="Hledat název, IČO, město…" value={q} onChange={e=>setQ(e.target.value)}/></div>
   <div className="table-wrap"><table className="data-table"><thead><tr><th>Zákazník</th><th>IČO</th><th>Kontakt</th><th>Adresa</th><th></th></tr></thead><tbody>
   {loading?<tr><td colSpan={5}>Načítám…</td></tr>:items.length===0?<tr><td colSpan={5}>Zatím žádní zákazníci.</td></tr>:items.map(c=><tr key={c.id}><td><strong>{c.name}</strong><br/><span className="table-muted">{c.type==="PERSON"?"Fyzická osoba":"Firma"}</span></td><td>{c.ico??"—"}</td><td>{c.email??c.phone??"—"}</td><td>{[c.street,c.city,c.zip].filter(Boolean).join(", ")||"—"}</td><td className="customer-actions"><button className="button button-secondary button-small" onClick={()=>start(c)}>Upravit</button><button className="button button-danger button-small" onClick={()=>hide(c.id)}>Skrýt</button></td></tr>)}
   </tbody></table></div>
  </section>
 </div></AppShell>
}