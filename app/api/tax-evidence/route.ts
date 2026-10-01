import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function membership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.companyMember.findFirst({ where: { userId: session.user.id } });
}

export async function GET(request: Request) {
  const member = await membership();
  if (!member) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  const year = Number(new URL(request.url).searchParams.get("year") ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({ error: "Neplatný rok." }, { status: 400 });

  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);
  const movements = await prisma.financialMovement.findMany({
    where: { companyId: member.companyId, date: { gte: from, lt: to } },
    include: { category: { select: { id: true, name: true, isTaxDeductible: true } } },
    orderBy: { date: "asc" },
  });

  const income = movements.filter(x => x.type === "INCOME");
  const expense = movements.filter(x => x.type === "EXPENSE");
  const sum = (xs: typeof movements) => xs.reduce((n, x) => n + Number(x.amount), 0);
  const incomeTotal = sum(income);
  const expenseTotal = sum(expense);
  const deductibleExpenseTotal = expense.filter(x => x.category?.isTaxDeductible !== false).reduce((n, x) => n + Number(x.amount), 0);

  const categories = new Map<string, { name:string; income:number; expense:number; deductibleExpense:number }>();
  for (const m of movements) {
    const key=m.category?.id ?? "uncategorized";
    const row=categories.get(key) ?? { name:m.category?.name ?? "Bez kategorie", income:0, expense:0, deductibleExpense:0 };
    if(m.type==="INCOME") row.income += Number(m.amount);
    else { row.expense += Number(m.amount); if(m.category?.isTaxDeductible !== false) row.deductibleExpense += Number(m.amount); }
    categories.set(key,row);
  }

  const [receivables, payables] = await Promise.all([
    prisma.invoice.aggregate({ where:{companyId:member.companyId,status:{notIn:["DRAFT","CANCELLED"]}}, _sum:{total:true,paidAmount:true} }),
    prisma.receivedDocument.aggregate({ where:{companyId:member.companyId}, _sum:{amount:true,paidAmount:true} }),
  ]);

  const accounts=await prisma.bankAccount.findMany({where:{companyId:member.companyId},include:{movements:{select:{type:true,amount:true}}}});
  const cash=await prisma.cashRegister.findMany({where:{companyId:member.companyId},include:{movements:{select:{type:true,amount:true}}}});
  const balance=(opening:number,movs:{type:string;amount:any}[])=>opening+movs.reduce((n,m)=>n+(m.type==="INCOME"?Number(m.amount):-Number(m.amount)),0);

  return NextResponse.json({
    year,
    totals:{income:incomeTotal,expense:expenseTotal,difference:incomeTotal-expenseTotal,deductibleExpense:deductibleExpenseTotal},
    categories:Array.from(categories.values()).sort((a,b)=>(b.income+b.expense)-(a.income+a.expense)),
    receivables:{total:Number(receivables._sum.total??0),paid:Number(receivables._sum.paidAmount??0),remaining:Number(receivables._sum.total??0)-Number(receivables._sum.paidAmount??0)},
    payables:{total:Number(payables._sum.amount??0),paid:Number(payables._sum.paidAmount??0),remaining:Number(payables._sum.amount??0)-Number(payables._sum.paidAmount??0)},
    bankAccounts:accounts.map(a=>({id:a.id,name:a.name,balance:balance(Number(a.openingBalance),a.movements)})),
    cashRegisters:cash.map(a=>({id:a.id,name:a.name,balance:balance(Number(a.openingBalance),a.movements)})),
  });
}
