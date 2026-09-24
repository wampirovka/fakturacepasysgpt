import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(){const session=await auth.api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:"Nepřihlášený uživatel."},{status:401});const m=await prisma.companyMember.findFirst({where:{userId:session.user.id}});if(!m)return NextResponse.json({error:"Chybějící firma."},{status:401});if(!["OWNER","ADMIN"].includes(m.role))return NextResponse.json({error:"Nemáte oprávnění zobrazit auditní log."},{status:403});const logs=await prisma.auditLog.findMany({where:{companyId:m.companyId},orderBy:{createdAt:"desc"},take:200});return NextResponse.json({logs});}
