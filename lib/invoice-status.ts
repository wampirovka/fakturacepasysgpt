import { InvoiceStatus } from "@/app/generated/prisma/client";

export function effectiveInvoiceStatus(invoice: {
  status: InvoiceStatus | string;
  total: unknown;
  paidAmount: unknown;
  dueDate?: Date | string | null;
}) {
  const status = String(invoice.status);
  if (status === "DRAFT" || status === "CANCELLED") return status;
  const total = Number(invoice.total);
  const paid = Number(invoice.paidAmount);
  if (paid >= total - 0.005) return "PAID";
  if (paid > 0.005) {
    if (invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now()) return "OVERDUE";
    return "PARTIALLY_PAID";
  }
  if (invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now()) return "OVERDUE";
  return "ISSUED";
}
