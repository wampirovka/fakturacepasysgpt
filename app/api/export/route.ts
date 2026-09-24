import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createZip } from "@/lib/zip";

const ENTITY_KEYS = [
  "company",
  "members",
  "customers",
  "invoices",
  "invoiceItems",
  "payments",
  "cashDocuments",
  "advanceApplications",
  "numberingSeries",
  "auditLog",
] as const;

type EntityKey = (typeof ENTITY_KEYS)[number];

const entityLabels: Record<EntityKey, string> = {
  company: "Firma",
  members: "Členové firmy",
  customers: "Zákazníci",
  invoices: "Faktury",
  invoiceItems: "Položky faktur",
  payments: "Úhrady",
  cashDocuments: "Pokladní doklady",
  advanceApplications: "Vypořádání záloh",
  numberingSeries: "Číselné řady",
  auditLog: "Auditní log",
};

function jsonData(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    return item;
  }, 2);
}

function normalizeEntities(input: unknown): EntityKey[] {
  if (!Array.isArray(input)) return [...ENTITY_KEYS];
  const selected = input.filter((value): value is EntityKey =>
    typeof value === "string" && (ENTITY_KEYS as readonly string[]).includes(value),
  );
  return selected.length ? [...new Set(selected)] : [...ENTITY_KEYS];
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId: session.user.id },
    select: { companyId: true, role: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "Uživatel nemá přiřazenou firmu." }, { status: 404 });
  }

  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "Nemáte oprávnění exportovat firemní data." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const selected = normalizeEntities(searchParams.get("entities")?.split(",").filter(Boolean));
  const includeAll = searchParams.get("all") === "1";
  const requested = includeAll ? [...ENTITY_KEYS] : selected;
  const dependencyMap: Partial<Record<EntityKey, EntityKey[]>> = {
    invoices: ["company", "customers", "invoiceItems"],
    invoiceItems: ["company", "invoices", "customers"],
    payments: ["company", "invoices"],
    cashDocuments: ["company", "payments", "invoices"],
    advanceApplications: ["company", "invoices"],
    numberingSeries: ["company"],
    members: ["company"],
    customers: ["company"],
    auditLog: ["company"],
  };
  const entitySet = new Set<EntityKey>(requested);
  for (const entity of requested) {
    for (const dependency of dependencyMap[entity] ?? []) entitySet.add(dependency);
  }
  const entities = [...entitySet];
  const companyId = membership.companyId;

  const [company, members, customers, invoices, numberingSeries] = await Promise.all([
    entities.includes("company")
      ? prisma.company.findUnique({ where: { id: companyId } })
      : null,
    entities.includes("members")
      ? prisma.companyMember.findMany({ where: { companyId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } })
      : [],
    entities.includes("customers")
      ? prisma.customer.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } })
      : [],
    entities.includes("invoices") || entities.includes("invoiceItems")
      ? prisma.invoice.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } })
      : [],
    entities.includes("numberingSeries")
      ? prisma.numberingSeries.findMany({ where: { companyId }, orderBy: [{ year: "asc" }, { type: "asc" }] })
      : [],
  ]);

  const invoiceIds = invoices.map((invoice) => invoice.id);

  const [invoiceItems, payments, cashDocuments, advanceApplications, auditLog] = await Promise.all([
    entities.includes("invoiceItems") && invoiceIds.length
      ? prisma.invoiceItem.findMany({ where: { invoiceId: { in: invoiceIds } }, orderBy: [{ invoiceId: "asc" }, { position: "asc" }] })
      : [],
    entities.includes("payments") && invoiceIds.length
      ? prisma.payment.findMany({ where: { companyId, invoiceId: { in: invoiceIds } }, orderBy: { paidAt: "asc" } })
      : [],
    entities.includes("cashDocuments")
      ? prisma.cashDocument.findMany({ where: { companyId }, orderBy: { date: "asc" } })
      : [],
    entities.includes("advanceApplications") && invoiceIds.length
      ? prisma.invoiceAdvanceApplication.findMany({
          where: { finalInvoiceId: { in: invoiceIds } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    entities.includes("auditLog")
      ? prisma.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } })
      : [],
  ]);

  const manifest = {
    format: "fakturace-export",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    application: "fakturacepasysgpt",
    companyId,
    relationshipPolicy: "original-ids-preserved",
    entities: entities.map((key) => ({
      key,
      file: key + ".json",
      label: entityLabels[key],
      count:
        key === "company" ? (company ? 1 : 0) :
        key === "members" ? members.length :
        key === "customers" ? customers.length :
        key === "invoices" ? invoices.length :
        key === "invoiceItems" ? invoiceItems.length :
        key === "payments" ? payments.length :
        key === "cashDocuments" ? cashDocuments.length :
        key === "advanceApplications" ? advanceApplications.length :
        key === "numberingSeries" ? numberingSeries.length :
        auditLog.length,
    })),
    excludedFromExport: ["User", "Session", "Account", "Verification"],
  };

  const files: Record<string, string> = {
    "manifest.json": jsonData(manifest),
  };

  if (entities.includes("company") && company) files["company.json"] = jsonData([company]);
  if (entities.includes("members")) files["members.json"] = jsonData(members);
  if (entities.includes("customers")) files["customers.json"] = jsonData(customers);
  if (entities.includes("invoices")) files["invoices.json"] = jsonData(invoices);
  if (entities.includes("invoiceItems")) files["invoiceItems.json"] = jsonData(invoiceItems);
  if (entities.includes("payments")) files["payments.json"] = jsonData(payments);
  if (entities.includes("cashDocuments")) files["cashDocuments.json"] = jsonData(cashDocuments);
  if (entities.includes("advanceApplications")) files["advanceApplications.json"] = jsonData(advanceApplications);
  if (entities.includes("numberingSeries")) files["numberingSeries.json"] = jsonData(numberingSeries);
  if (entities.includes("auditLog")) files["auditLog.json"] = jsonData(auditLog);

  await prisma.auditLog.create({
    data: {
      companyId,
      userId: session.user.id,
      action: "EXPORT",
      entity: "DATA_EXPORT",
      details: JSON.stringify({ version: "1.0", entities, complete: includeAll }),
    },
  });

  const zip = createZip(files);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(zip as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="fakturace-export-' + stamp + '.zip"',
      "Cache-Control": "no-store",
    },
  });
}
