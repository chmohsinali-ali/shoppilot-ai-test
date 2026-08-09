/**
 * Money and business calculation utilities.
 * All money math uses integer cents internally to avoid floating-point errors,
 * matching the NUMERIC(14,2) precision in the database.
 */

export function toCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function addMoney(a: number, b: number): number {
  return fromCents(toCents(a) + toCents(b));
}

export function subMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

export function mulMoney(qty: number, price: number): number {
  return fromCents(Math.round(toCents(price) * qty));
}

export type SaleLineInput = {
  quantity: number;
  price: number;
  discount?: number;
};

export function lineTotal(line: SaleLineInput): number {
  const gross = mulMoney(line.quantity, line.price);
  return subMoney(gross, line.discount ?? 0);
}

export function saleTotals(lines: SaleLineInput[], discountTotal: number, taxTotal: number) {
  const subtotal = lines.reduce((s, l) => addMoney(s, lineTotal(l)), 0);
  const grandTotal = Math.max(0, subMoney(subtotal, discountTotal) + taxTotal);
  return { subtotal, grandTotal };
}

export type PurchaseLineInput = {
  ordered_quantity: number;
  free_units?: number;
  price_per_unit: number;
  regular_discount?: number;
  special_discount?: number;
  scheme_discount?: number;
  additional_discount?: number;
  tax_amount?: number;
};

export function purchaseLineTotals(line: PurchaseLineInput) {
  const gross = mulMoney(line.ordered_quantity, line.price_per_unit);
  const totalDiscount =
    (line.regular_discount ?? 0) +
    (line.special_discount ?? 0) +
    (line.scheme_discount ?? 0) +
    (line.additional_discount ?? 0);
  const netBeforeTax = subMoney(gross, totalDiscount);
  const netAmount = addMoney(netBeforeTax, line.tax_amount ?? 0);
  const totalReceived = (line.ordered_quantity ?? 0) + (line.free_units ?? 0);
  const effectiveCostPerUnit = totalReceived > 0 ? netAmount / totalReceived : 0;
  return {
    grossValue: gross,
    totalDiscount,
    netAmount,
    totalReceivedQuantity: totalReceived,
    effectiveCostPerUnit,
  };
}

export function purchaseTotals(lines: PurchaseLineInput[], discountTotal: number, taxTotal: number, deliveryCharges = 0, freight = 0, otherCharges = 0) {
  const subtotal = lines.reduce((s, l) => addMoney(s, mulMoney(l.ordered_quantity, l.price_per_unit)), 0);
  const grandTotal = subMoney(subtotal, discountTotal) + taxTotal + deliveryCharges + freight + otherCharges;
  return { subtotal, grandTotal: Math.max(0, grandTotal) };
}

export function ledgerBalance(entries: Array<{ debit_amount: number; credit_amount: number }>): number {
  return entries.reduce((s, e) => s + (Number(e.debit_amount) - Number(e.credit_amount)), 0);
}

export function supplierLedgerBalance(entries: Array<{ debit_amount: number; credit_amount: number }>): number {
  return entries.reduce((s, e) => s + (Number(e.credit_amount) - Number(e.debit_amount)), 0);
}

export function computeWarrantyExpiry(startDate: string, duration: number, unit: string): string {
  const d = new Date(startDate);
  if (unit === 'lifetime') return '2099-12-31';
  const n = duration || 0;
  if (unit === 'days') d.setDate(d.getDate() + n);
  else if (unit === 'months') {
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() !== day) d.setDate(0);
  }
  else if (unit === 'years') d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

export type UnitConversion = {
  from_unit: string;
  to_unit: string;
  factor: number;
};

export function convertQuantity(qty: number, fromUnit: string, toUnit: string, conversions: UnitConversion[]): number {
  if (fromUnit === toUnit) return qty;
  const direct = conversions.find((c) => c.from_unit === fromUnit && c.to_unit === toUnit);
  if (direct) return qty * direct.factor;
  const inverse = conversions.find((c) => c.from_unit === toUnit && c.to_unit === fromUnit);
  if (inverse) return qty / inverse.factor;
  return qty;
}
