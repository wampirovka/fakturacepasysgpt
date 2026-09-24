import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const session=await auth.api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:"Nepřihlášený uživatel."},{status:401});const m=await prisma.companyMember.findFirst({where:{userId:session.user.id}});if(!m)return NextResponse.json({error:"Chybějící firma."},{status:401});const id=(await context.params).id;const d=await prisma.cashDocument.findFirst({where:{id,companyId:m.companyId},include:{company:true,payment:{include:{invoice:{select:{id:true,number:true,customer:{select:{name:true}}}}}}});if(!d)return NextResponse.json({error:"Pokladní doklad nebyl nalezen."},{status:404});return NextResponse.json({document:d});}
