import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readZip } from "@/lib/zip-reader";

const ENTITY_KEYS = ["company","members","customers","invoices","invoiceItems","payments","cashDocuments","advanceApplications","numberingSeries","auditLog"] as const;
type EntityKey = (typeof ENTITY_KEYS)[number];

function parseJson<T>(files: Record<string,string>, name: string): T[] {
  if (!files[name]) return [];
  const value = JSON.parse(files[name]);
  if (!Array.isArray(value)) throw new Error(name + " musí obsahovat pole.");
  return value as T[];
}
function asDate(value: unknown) { return value ? new Date(String(value)) : undefined; }
function asDecimal(value: unknown) { return String(value ?? "0"); }

async function getContext() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { response: NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 }) };
  const membership = await prisma.companyMember.findFirst({ where: { userId: session.user.id }, select: { companyId: true, role: true } });
  if (!membership) return { response: NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 }) };
  if (!["OWNER","ADMIN"].includes(membership.role)) return { response: NextResponse.json({ error: "Import dat je povolen pouze vlastníkovi nebo administrátorovi." }, { status: 403 }) };
  return { session, membership };
}

async function inspect(files: Record<string,string>) {
  if (!files["manifest.json"]) throw new Error("Chybí manifest.json.");
  const manifest = JSON.parse(files["manifest.json"]);
  if (manifest.format !== "fakturace-export") throw new Error("Neznámý formát exportu.");
  if (manifest.version !== "1.0") throw new Error("Nepodporovaná verze exportu: " + String(manifest.version ?? "neuvedena") + ".");

  const counts: Record<string,number> = {};
  for (const key of ENTITY_KEYS) {
    const filename = key + ".json";
    if (!files[filename]) continue;
    const rows = JSON.parse(files[filename]);
    if (!Array.isArray(rows)) throw new Error(filename + " musí obsahovat pole.");
    counts[key] = rows.length;
    const declared = Array.isArray(manifest.entities) ? manifest.entities.find((item: {key?:string}) => item.key === key)?.count : undefined;
    if (typeof declared === "number" && declared !== rows.length) throw new Error("Počet záznamů v " + filename + " neodpovídá manifestu.");
  }
  return { manifest, counts };
}

export async function POST(request: Request) {
  const context = await getContext();
  if ("response" in context) return context.response;

  const form = await request.formData();
  const file = form.get("file");
  const execute = form.get("execute") === "1";
  if (!(file instanceof File)) return NextResponse.json({ error: "Nebyl vybrán ZIP soubor." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".zip")) return NextResponse.json({ error: "Import očekává ZIP export z aplikace." }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "Export je příliš velký. Limit je 50 MB." }, { status: 400 });

  try {
    const files = readZip(Buffer.from(await file.arrayBuffer()));
    const { manifest, counts } = await inspect(files);

    const customers = parseJson<Record<string,unknown>>(files,"customers.json");
    const invoices = parseJson<Record<string,unknown>>(files,"invoices.json");
    const invoiceItems = parseJson<Record<string,unknown>>(files,"invoiceItems.json");
    const payments = parseJson<Record<string,unknown>>(files,"payments.json");
    const cashDocuments = parseJson<Record<string,unknown>>(files,"cashDocuments.json");
    const advanceApplications = parseJson<Record<string,unknown>>(files,"advanceApplications.json");
    const numberingSeries = parseJson<Record<string,unknown>>(files,"numberingSeries.json");
    const members = parseJson<Record<string,unknown>>(files,"members.json");

    const customerIds = new Set(customers.map(r => String(r.id)));
    const invoiceIds = new Set(invoices.map(r => String(r.id)));
    const paymentIds = new Set(payments.map(r => String(r.id)));
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const row of invoices) if (row.customerId && !customerIds.has(String(row.customerId))) warnings.push("Faktura " + String(row.number ?? row.id) + " odkazuje na zákazníka mimo export.");
    for (const row of invoiceItems) if (!invoiceIds.has(String(row.invoiceId))) errors.push("Položka " + String(row.id) + " odkazuje na neexistující fakturu.");
    for (const row of payments) if (!invoiceIds.has(String(row.invoiceId))) errors.push("Úhrada " + String(row.id) + " odkazuje na neexistující fakturu.");
    for (const row of cashDocuments) if (row.paymentId && !paymentIds.has(String(row.paymentId))) warnings.push("Pokladní doklad " + String(row.number ?? row.id) + " odkazuje na úhradu mimo export.");
    for (const row of advanceApplications) if (!invoiceIds.has(String(row.finalInvoiceId)) || !invoiceIds.has(String(row.advanceInvoiceId))) errors.push("Vypořádání zálohy " + String(row.id) + " odkazuje na neexistující fakturu.");

    const summary = { version: manifest.version, exportedAt: manifest.exportedAt, sourceCompanyId: manifest.companyId, counts, errors, warnings, canImport: errors.length === 0 };
    if (!execute) return NextResponse.json(summary);
    if (errors.length) return NextResponse.json({ ...summary, error: "Export obsahuje chyby a nebyl importován." }, { status: 400 });

    const companyId = context.membership.companyId;
    await prisma.$transaction(async tx => {
      const sourceCompany = parseJson<Record<string,unknown>>(files,"company.json")[0];
      if (sourceCompany) await tx.company.update({ where:{id:companyId}, data:{
        name:String(sourceCompany.name ?? ""), ico:sourceCompany.ico ? String(sourceCompany.ico):null, dic:sourceCompany.dic ? String(sourceCompany.dic):null,
        street:sourceCompany.street ? String(sourceCompany.street):null, city:sourceCompany.city ? String(sourceCompany.city):null, zip:sourceCompany.zip ? String(sourceCompany.zip):null,
        country:String(sourceCompany.country ?? "CZ"), phone:sourceCompany.phone ? String(sourceCompany.phone):null, email:sourceCompany.email ? String(sourceCompany.email):null,
        website:sourceCompany.website ? String(sourceCompany.website):null, logoUrl:sourceCompany.logoUrl ? String(sourceCompany.logoUrl):null,
        bankAccount:sourceCompany.bankAccount ? String(sourceCompany.bankAccount):null, bankCode:sourceCompany.bankCode ? String(sourceCompany.bankCode):null, iban:sourceCompany.iban ? String(sourceCompany.iban):null,
        exportStyle:String(sourceCompany.exportStyle ?? "CLASSIC"), vatStatus:String(sourceCompany.vatStatus ?? "NON_VAT_PAYER"), defaultDueDays:Number(sourceCompany.defaultDueDays ?? 14)
      }});

      for (const row of customers) await tx.customer.upsert({ where:{id:String(row.id)}, create:{
        id:String(row.id), companyId, type:row.type as never, name:String(row.name ?? ""), ico:row.ico ? String(row.ico):null, dic:row.dic ? String(row.dic):null,
        street:row.street ? String(row.street):null, city:row.city ? String(row.city):null, zip:row.zip ? String(row.zip):null, country:String(row.country ?? "CZ"),
        email:row.email ? String(row.email):null, phone:row.phone ? String(row.phone):null, note:row.note ? String(row.note):null, isActive:Boolean(row.isActive),
        createdAt:asDate(row.createdAt) ?? new Date(), updatedAt:asDate(row.updatedAt) ?? new Date()
      }, update:{
        companyId, type:row.type as never, name:String(row.name ?? ""), ico:row.ico ? String(row.ico):null, dic:row.dic ? String(row.dic):null,
        street:row.street ? String(row.street):null, city:row.city ? String(row.city):null, zip:row.zip ? String(row.zip):null, country:String(row.country ?? "CZ"),
        email:row.email ? String(row.email):null, phone:row.phone ? String(row.phone):null, note:row.note ? String(row.note):null, isActive:Boolean(row.isActive)
      }});

      for (const row of invoices) await tx.invoice.upsert({ where:{id:String(row.id)}, create:{
        id:String(row.id), companyId, customerId:row.customerId ? String(row.customerId):null, type:row.type as never, status:row.status as never,
        number:row.number ? String(row.number):null, issueDate:asDate(row.issueDate) ?? new Date(), dueDate:asDate(row.dueDate), taxableDate:asDate(row.taxableDate),
        currency:String(row.currency ?? "CZK"), paymentMethod:row.paymentMethod as never, variableSymbol:row.variableSymbol ? String(row.variableSymbol):null,
        constantSymbol:row.constantSymbol ? String(row.constantSymbol):null, specificSymbol:row.specificSymbol ? String(row.specificSymbol):null, note:row.note ? String(row.note):null,
        sellerName:row.sellerName ? String(row.sellerName):null, sellerIco:row.sellerIco ? String(row.sellerIco):null, sellerDic:row.sellerDic ? String(row.sellerDic):null,
        sellerStreet:row.sellerStreet ? String(row.sellerStreet):null, sellerCity:row.sellerCity ? String(row.sellerCity):null, sellerZip:row.sellerZip ? String(row.sellerZip):null,
        sellerCountry:row.sellerCountry ? String(row.sellerCountry):null, sellerEmail:row.sellerEmail ? String(row.sellerEmail):null, sellerPhone:row.sellerPhone ? String(row.sellerPhone):null,
        buyerName:row.buyerName ? String(row.buyerName):null, buyerIco:row.buyerIco ? String(row.buyerIco):null, buyerDic:row.buyerDic ? String(row.buyerDic):null,
        buyerStreet:row.buyerStreet ? String(row.buyerStreet):null, buyerCity:row.buyerCity ? String(row.buyerCity):null, buyerZip:row.buyerZip ? String(row.buyerZip):null,
        buyerCountry:row.buyerCountry ? String(row.buyerCountry):null, buyerEmail:row.buyerEmail ? String(row.buyerEmail):null, buyerPhone:row.buyerPhone ? String(row.buyerPhone):null,
        subtotal:asDecimal(row.subtotal), total:asDecimal(row.total), paidAmount:asDecimal(row.paidAmount), createdAt:asDate(row.createdAt) ?? new Date(), updatedAt:asDate(row.updatedAt) ?? new Date(),
        correctiveOfId:row.correctiveOfId ? String(row.correctiveOfId):null
      }, update:{
        companyId, customerId:row.customerId ? String(row.customerId):null, type:row.type as never, status:row.status as never, number:row.number ? String(row.number):null,
        issueDate:asDate(row.issueDate) ?? new Date(), dueDate:asDate(row.dueDate), taxableDate:asDate(row.taxableDate), currency:String(row.currency ?? "CZK"),
        paymentMethod:row.paymentMethod as never, variableSymbol:row.variableSymbol ? String(row.variableSymbol):null, constantSymbol:row.constantSymbol ? String(row.constantSymbol):null,
        specificSymbol:row.specificSymbol ? String(row.specificSymbol):null, note:row.note ? String(row.note):null,
        sellerName:row.sellerName ? String(row.sellerName):null, sellerIco:row.sellerIco ? String(row.sellerIco):null, sellerDic:row.sellerDic ? String(row.sellerDic):null,
        sellerStreet:row.sellerStreet ? String(row.sellerStreet):null, sellerCity:row.sellerCity ? String(row.sellerCity):null, sellerZip:row.sellerZip ? String(row.sellerZip):null,
        sellerCountry:row.sellerCountry ? String(row.sellerCountry):null, sellerEmail:row.sellerEmail ? String(row.sellerEmail):null, sellerPhone:row.sellerPhone ? String(row.sellerPhone):null,
        buyerName:row.buyerName ? String(row.buyerName):null, buyerIco:row.buyerIco ? String(row.buyerIco):null, buyerDic:row.buyerDic ? String(row.buyerDic):null,
        buyerStreet:row.buyerStreet ? String(row.buyerStreet):null, buyerCity:row.buyerCity ? String(row.buyerCity):null, buyerZip:row.buyerZip ? String(row.buyerZip):null,
        buyerCountry:row.buyerCountry ? String(row.buyerCountry):null, buyerEmail:row.buyerEmail ? String(row.buyerEmail):null, buyerPhone:row.buyerPhone ? String(row.buyerPhone):null,
        subtotal:asDecimal(row.subtotal), total:asDecimal(row.total), paidAmount:asDecimal(row.paidAmount), correctiveOfId:row.correctiveOfId ? String(row.correctiveOfId):null
      }});

      for (const row of invoiceItems) await tx.invoiceItem.upsert({ where:{id:String(row.id)}, create:{
        id:String(row.id), invoiceId:String(row.invoiceId), position:Number(row.position), description:String(row.description ?? ""), quantity:asDecimal(row.quantity),
        unit:String(row.unit ?? "ks"), unitPrice:asDecimal(row.unitPrice), discount:asDecimal(row.discount), vatRate:row.vatRate == null ? null:asDecimal(row.vatRate),
        lineTotal:asDecimal(row.lineTotal), createdAt:asDate(row.createdAt) ?? new Date()
      }, update:{ invoiceId:String(row.invoiceId), position:Number(row.position), description:String(row.description ?? ""), quantity:asDecimal(row.quantity), unit:String(row.unit ?? "ks"),
        unitPrice:asDecimal(row.unitPrice), discount:asDecimal(row.discount), vatRate:row.vatRate == null ? null:asDecimal(row.vatRate), lineTotal:asDecimal(row.lineTotal) }});

      for (const row of payments) await tx.payment.upsert({ where:{id:String(row.id)}, create:{
        id:String(row.id), companyId, invoiceId:String(row.invoiceId), amount:asDecimal(row.amount), paidAt:asDate(row.paidAt) ?? new Date(), method:row.method as never,
        note:row.note ? String(row.note):null, createdAt:asDate(row.createdAt) ?? new Date()
      }, update:{ companyId, invoiceId:String(row.invoiceId), amount:asDecimal(row.amount), paidAt:asDate(row.paidAt) ?? new Date(), method:row.method as never, note:row.note ? String(row.note):null }});

      for (const row of advanceApplications) await tx.invoiceAdvanceApplication.upsert({ where:{id:String(row.id)}, create:{
        id:String(row.id), finalInvoiceId:String(row.finalInvoiceId), advanceInvoiceId:String(row.advanceInvoiceId), amount:asDecimal(row.amount), createdAt:asDate(row.createdAt) ?? new Date()
      }, update:{ finalInvoiceId:String(row.finalInvoiceId), advanceInvoiceId:String(row.advanceInvoiceId), amount:asDecimal(row.amount) }});

      for (const row of numberingSeries) await tx.numberingSeries.upsert({ where:{id:String(row.id)}, create:{
        id:String(row.id), companyId, type:row.type as never, name:String(row.name ?? ""), prefix:String(row.prefix ?? ""), year:Number(row.year), nextNumber:Number(row.nextNumber ?? 1),
        padding:Number(row.padding ?? 3), isActive:Boolean(row.isActive), createdAt:asDate(row.createdAt) ?? new Date(), updatedAt:asDate(row.updatedAt) ?? new Date()
      }, update:{ companyId, type:row.type as never, name:String(row.name ?? ""), prefix:String(row.prefix ?? ""), year:Number(row.year), nextNumber:Number(row.nextNumber ?? 1), padding:Number(row.padding ?? 3), isActive:Boolean(row.isActive) }});

      for (const row of cashDocuments) await tx.cashDocument.upsert({ where:{id:String(row.id)}, create:{
        id:String(row.id), companyId, paymentId:row.paymentId ? String(row.paymentId):null, number:row.number ? String(row.number):null, date:asDate(row.date) ?? new Date(),
        amount:asDecimal(row.amount), method:row.method as never, note:row.note ? String(row.note):null
      }, update:{ companyId, paymentId:row.paymentId ? String(row.paymentId):null, number:row.number ? String(row.number):null, date:asDate(row.date) ?? new Date(), amount:asDecimal(row.amount), method:row.method as never, note:row.note ? String(row.note):null }});

      const emails = members.map(row => {
        const user = row.user as Record<string,unknown> | undefined;
        return String(user?.email ?? row.email ?? "").toLowerCase();
      }).filter(Boolean);
      const users = emails.length ? await tx.user.findMany({ where:{email:{in:emails}}, select:{id:true,email:true} }):[];
      const userByEmail = new Map(users.map(user => [user.email.toLowerCase(),user.id]));
      for (const row of members) {
        const user = row.user as Record<string,unknown> | undefined;
        const userId = userByEmail.get(String(user?.email ?? row.email ?? "").toLowerCase());
        if (!userId) continue;
        await tx.companyMember.upsert({ where:{id:String(row.id)}, create:{id:String(row.id),companyId,userId,role:row.role as never,createdAt:asDate(row.createdAt) ?? new Date(),updatedAt:asDate(row.updatedAt) ?? new Date()}, update:{companyId,userId,role:row.role as never} });
      }

      const auditRows = parseJson<Record<string,unknown>>(files,"auditLog.json");
      for (const row of auditRows) await tx.auditLog.upsert({ where:{id:String(row.id)}, create:{
        id:String(row.id), companyId, userId:row.userId ? String(row.userId):null, action:String(row.action ?? ""), entity:String(row.entity ?? ""),
        entityId:row.entityId ? String(row.entityId):null, details:row.details ? String(row.details):null, createdAt:asDate(row.createdAt) ?? new Date()
      }, update:{ companyId, userId:row.userId ? String(row.userId):null, action:String(row.action ?? ""), entity:String(row.entity ?? ""), entityId:row.entityId ? String(row.entityId):null, details:row.details ? String(row.details):null } }));

      await tx.auditLog.create({ data:{companyId,userId:context.session.user.id,action:"IMPORT",entity:"DATA_IMPORT",details:JSON.stringify({version:manifest.version,sourceCompanyId:manifest.companyId,counts})} });
    });

    return NextResponse.json({...summary, imported:true});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error ? error.message:"Import se nepodařilo zpracovat."},{status:400});
  }
}
