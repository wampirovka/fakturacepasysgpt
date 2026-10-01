import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function companyId(){const s=await auth.api.getSession({headers:await headers()});if(!s)return null;const m=await prisma.companyMember.findFirst({where:{userId:s.user.id}});return m?.companyId??null}
export async function GET(){const companyIdValue=await companyId();if(!companyIdValue)return NextResponse.json({error:"Nepřihlášený uživatel."},{status:401});const [bankAccounts,cashRegisters]=await Promise.all([prisma.bankAccount.findMany({where:{companyId:companyIdValue,isActive:true},orderBy:{name:"asc"}}),prisma.cashRegister.findMany({where:{companyId:companyIdValue,isActive:true},orderBy:{name:"asc"}})]);return NextResponse.json({bankAccounts,cashRegisters})}