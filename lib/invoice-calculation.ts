export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  vatRate: number | null;
};

export type CalculatedInvoiceItem = InvoiceItemInput & {
  lineTotal: number;
  vatAmount: number;
  grossTotal: number;
};

export function calculateInvoiceItems(items: InvoiceItemInput[], vatPayer: boolean) {
  if (!items.length) throw new Error("Faktura musí obsahovat alespoň jednu položku.");

  const calculated: CalculatedInvoiceItem[] = items.map((item) => {
    const description = item.description.trim();
    const quantity = Number(item.quantity);
    const unit = item.unit.trim() || "ks";
    const unitPrice = Number(item.unitPrice);
    const discount = Number(item.discount ?? 0);
    const vatRate = vatPayer ? (item.vatRate === null ? 21 : Number(item.vatRate)) : null;

    if (!description) throw new Error("Popis položky je povinný.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Množství musí být větší než 0.");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Cena musí být 0 nebo vyšší.");
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error("Sleva musí být od 0 do 100 %.");
    if (vatPayer && (!Number.isFinite(vatRate) || vatRate! < 0 || vatRate! > 100)) throw new Error("Sazba DPH musí být od 0 do 100 %.");

    const lineTotal = Math.round(quantity * unitPrice * (1 - discount / 100) * 100) / 100;
    const vatAmount = vatRate === null ? 0 : Math.round(lineTotal * vatRate / 100 * 100) / 100;
    const grossTotal = Math.round((lineTotal + vatAmount) * 100) / 100;

    return { description, quantity, unit, unitPrice, discount, vatRate, lineTotal, vatAmount, grossTotal };
  });

  const subtotal = Math.round(calculated.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
  const vatTotal = Math.round(calculated.reduce((sum, item) => sum + item.vatAmount, 0) * 100) / 100;
  const total = Math.round(calculated.reduce((sum, item) => sum + item.grossTotal, 0) * 100) / 100;

  return { items: calculated, subtotal, vatTotal, total };
}

export function parseInvoiceItems(raw: unknown): InvoiceItemInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      description: typeof item.description === "string" ? item.description : "",
      quantity: Number(item.quantity ?? 1),
      unit: typeof item.unit === "string" ? item.unit : "ks",
      unitPrice: Number(item.unitPrice ?? 0),
      discount: Number(item.discount ?? 0),
      vatRate: item.vatRate === null || item.vatRate === undefined || item.vatRate === "" ? null : Number(item.vatRate),
    };
  });
}
