import { NumberingSeriesType, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const defaults: Record<NumberingSeriesType, { name: string; prefix: string }> = {
  INVOICE: { name: "Faktury", prefix: "" },
  ADVANCE: { name: "Zálohové faktury", prefix: "9" },
  CASH_DOCUMENT: { name: "Pokladní doklady", prefix: "8" },
};

export async function getOrCreateSeries(tx: Prisma.TransactionClient, companyId: string, type: NumberingSeriesType, year: number) {
  const existing = await tx.numberingSeries.findUnique({ where: { companyId_type_year: { companyId, type, year } } });
  if (existing) return existing;
  const d = defaults[type];
  return tx.numberingSeries.create({ data: { companyId, type, year, name: d.name, prefix: d.prefix, nextNumber: 1, padding: 3 } });
}

export async function reserveNumber(tx: Prisma.TransactionClient, companyId: string, type: NumberingSeriesType, year: number) {
  const series = await getOrCreateSeries(tx, companyId, type, year);
  const value = String(series.nextNumber).padStart(series.padding, "0");
  const number = `${series.prefix}${year}${value}`;
  await tx.numberingSeries.update({ where: { id: series.id }, data: { nextNumber: { increment: 1 } } });
  return number;
}
