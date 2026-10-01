import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

const money=(v:number)=>v.toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})+" Kč";
const date=(v:Date)=>new Intl.DateTimeFormat("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"}).format(v);

export default async function DashboardPage(){
 const session=await auth.api.getSession({headers:await headers()});
 if(!session) redirect("/prihlaseni");
 const membership=await prisma.companyMember.findFirst({where:{userId:session.user.id},include:{company:true}});
 if(!membership) redirect("/firma");
 const companyId=membership.companyId, now=new Date(), year=now.getFullYear();
 const yearStart=new Date(year,0,1), yearEnd=new Date(year+1,0,1), monthStart=new Date(year,now.getMonth(),1), monthEnd=new Date(year,now.getMonth()+1,1);

 const [movements,invoices,receivedDocs,banks,cashes]=await Promise.all([
  prisma.financialMovement.findMany({where:{companyId,date:{gte:yearStart,lt:yearEnd}},include:{category:true,bankAccount:true,cashRegister:true,invoice:{select:{number:true}},receivedDocument:{select:{documentNumber:true}}},orderBy:{date:"desc"},take:1000}),
  prisma.invoice.findMany({where:{companyId,status:{notIn:["DRAFT","CANCELLED"]}},select:{total:true,paidAmount:true,dueDate:true}}),
  prisma.receivedDocument.findMany({where:{companyId},select:{amount:true,paidAmount:true,dueDate:true}}),
  prisma.bankAccount.findMany({where:{companyId,isActive:true},select:{id:true,name:true,openingBalance:true}}),
  prisma.cashRegister.findMany({where:{companyId,isActive:true},select:{id:true,name:true,openingBalance:true}})
 ]);

 const income=movements.filter(m=>m.type==="INCOME").reduce((s,m)=>s+Number(m.amount),0);
 const expense=movements.filter(m=>m.type==="EXPENSE").reduce((s,m)=>s+Number(m.amount),0);
 const result=income-expense;
 const monthIncome=movements.filter(m=>m.type==="INCOME"&&m.date>=monthStart&&m.date<monthEnd).reduce((s,m)=>s+Number(m.amount),0);
 const monthExpense=movements.filter(m=>m.type==="EXPENSE"&&m.date>=monthStart&&m.date<monthEnd).reduce((s,m)=>s+Number(m.amount),0);
 const receivable=invoices.reduce((s,i)=>s+Math.max(0,Number(i.total)-Number(i.paidAmount)),0);
 const payable=receivedDocs.reduce((s,d)=>s+Math.max(0,Number(d.amount)-Number(d.paidAmount)),0);
 const overdueReceivable=invoices.reduce((s,i)=>s+(Number(i.total)>Number(i.paidAmount)&&i.dueDate&&i.dueDate<now?Math.max(0,Number(i.total)-Number(i.paidAmount)):0),0);
 const overduePayable=receivedDocs.reduce((s,d)=>s+(Number(d.amount)>Number(d.paidAmount)&&d.dueDate&&d.dueDate<now?Math.max(0,Number(d.amount)-Number(d.paidAmount)):0),0);

 const bank=banks.map(a=>({name:a.name,balance:Number(a.openingBalance)+movements.filter(m=>m.bankAccount?.id===a.id).reduce((s,m)=>s+(m.type==="INCOME"?Number(m.amount):-Number(m.amount)),0)}));
 const cash=cashes.map(a=>({name:a.name,balance:Number(a.openingBalance)+movements.filter(m=>m.cashRegister?.id===a.id).reduce((s,m)=>s+(m.type==="INCOME"?Number(m.amount):-Number(m.amount)),0)}));
 const totalBank=bank.reduce((s,a)=>s+a.balance,0), totalCash=cash.reduce((s,a)=>s+a.balance,0);

 return <AppShell><div className="content">
  <header className="page-header dashboard-hero"><div><p className="eyebrow">Přehled firmy</p><h1 className="page-title">Dobrý den, {session.user.name}</h1><p className="page-subtitle">{membership.company.name} · skutečný stav peněz, ne jen vystavené faktury.</p></div><div className="dashboard-actions"><Link className="button button-secondary" href="/uhrady">+ Zadat úhradu</Link><Link className="button button-primary" href="/faktury">+ Nová faktura</Link></div></header>

  <section className="dashboard-grid">
   <article className="stat-card dashboard-stat"><div className="stat-label">Skutečné příjmy</div><div className="stat-value">{money(income)}</div><div className="stat-note">rok {year}</div></article>
   <article className="stat-card dashboard-stat"><div className="stat-label">Skutečné výdaje</div><div className="stat-value">{money(expense)}</div><div className="stat-note">rok {year}</div></article>
   <article className="stat-card dashboard-stat dashboard-stat-success"><div className="stat-label">Aktuální výsledek</div><div className="stat-value">{money(result)}</div><div className="stat-note">příjmy − výdaje</div></article>
   <article className="stat-card dashboard-stat"><div className="stat-label">Pohledávky</div><div className="stat-value">{money(receivable)}</div><div className="stat-note">{money(overdueReceivable)} po splatnosti</div></article>
  </section>

  <section className="dashboard-columns">
   <div className="panel"><div className="panel-header"><div><h2>Finance tento měsíc</h2><span>{now.toLocaleDateString("cs-CZ",{month:"long",year:"numeric"})}</span></div></div><div className="dashboard-finance"><div><span>Příjmy</span><strong>{money(monthIncome)}</strong></div><div><span>Výdaje</span><strong>{money(monthExpense)}</strong></div><div><span>Rozdíl</span><strong>{money(monthIncome-monthExpense)}</strong></div></div></div>
   <div className="panel"><div className="panel-header"><div><h2>Závazky</h2><span>Co ještě čeká na zaplacení</span></div><Link className="text-link" href="/zavazky">Detail →</Link></div><div className="dashboard-finance"><div><span>K úhradě</span><strong>{money(payable)}</strong></div><div><span>Po splatnosti</span><strong>{money(overduePayable)}</strong></div></div></div>
  </section>

  <section className="dashboard-columns">
   <div className="panel"><div className="panel-header"><div><h2>Bankovní účty</h2><span>Aktuální zůstatky</span></div></div>{bank.length?<div className="quick-actions">{bank.map(a=><div className="quick-action" key={a.name}><strong>{a.name}</strong><span>zůstatek</span><b>{money(a.balance)}</b></div>)}</div>:<div className="empty-cell">Zatím nejsou nastavené bankovní účty.</div>}<div className="panel-header"><strong>Celkem {money(totalBank)}</strong></div></div>
   <div className="panel"><div className="panel-header"><div><h2>Pokladna</h2><span>Aktuální hotovost</span></div></div>{cash.length?<div className="quick-actions">{cash.map(a=><div className="quick-action" key={a.name}><strong>{a.name}</strong><span>zůstatek</span><b>{money(a.balance)}</b></div>)}</div>:<div className="empty-cell">Zatím nejsou nastavené pokladny.</div>}<div className="panel-header"><strong>Celkem {money(totalCash)}</strong></div></div>
  </section>

  <section className="panel"><div className="panel-header"><div><h2>Poslední finanční pohyby</h2><span>Skutečné příjmy a výdaje za rok {year}</span></div><Link className="text-link" href="/prijmy">Příjmy →</Link></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Datum</th><th>Typ</th><th>Doklad</th><th>Kategorie</th><th className="amount">Částka</th></tr></thead><tbody>{movements.slice(0,8).map(m=><tr key={m.id}><td>{date(m.date)}</td><td>{m.type==="INCOME"?"Příjem":"Výdaj"}</td><td>{m.description??m.invoice?.number??m.receivedDocument?.documentNumber??"Finanční pohyb"}</td><td>{m.category?.name??"-"}</td><td className="amount">{money(Number(m.amount))}</td></tr>)}{!movements.length&&<tr><td colSpan={5} className="empty-cell">Zatím nejsou žádné finanční pohyby.</td></tr>}</tbody></table></div></section>
 </div></AppShell>;
}