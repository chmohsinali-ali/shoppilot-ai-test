import { describe, it, expect } from 'vitest';
import {
  toCents, fromCents, addMoney, subMoney, mulMoney,
  lineTotal, saleTotals, purchaseLineTotals, purchaseTotals,
  ledgerBalance, supplierLedgerBalance,
  computeWarrantyExpiry, convertQuantity,
} from '@/lib/calc';

describe('Money arithmetic', () => {
  it('converts to cents without floating-point drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(1999)).toBe(19.99);
  });

  it('adds money precisely', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(addMoney(19.99, 5.01)).toBe(25);
    expect(addMoney(100, 0.01)).toBe(100.01);
  });

  it('subtracts money precisely', () => {
    expect(subMoney(100, 30.55)).toBe(69.45);
    expect(subMoney(0.3, 0.1)).toBe(0.2);
  });

  it('multiplies quantity by price', () => {
    expect(mulMoney(5, 270)).toBe(1350);
    expect(mulMoney(2.5, 100)).toBe(250);
    expect(mulMoney(0.5, 270)).toBe(135);
  });
});

describe('Sale calculations', () => {
  it('computes line total with discount', () => {
    expect(lineTotal({ quantity: 5, price: 270, discount: 100 })).toBe(1250);
    expect(lineTotal({ quantity: 2, price: 40 })).toBe(80);
    expect(lineTotal({ quantity: 1, price: 100, discount: 0 })).toBe(100);
  });

  it('computes sale totals across multiple lines', () => {
    const lines = [
      { quantity: 5, price: 270 },
      { quantity: 2, price: 40 },
    ];
    const { subtotal, grandTotal } = saleTotals(lines, 50, 0);
    expect(subtotal).toBe(1430);
    expect(grandTotal).toBe(1380);
  });

  it('handles zero discount and tax', () => {
    const { subtotal, grandTotal } = saleTotals([{ quantity: 1, price: 100 }], 0, 0);
    expect(subtotal).toBe(100);
    expect(grandTotal).toBe(100);
  });
});

describe('Purchase calculations', () => {
  it('computes purchase line totals with free units and effective cost', () => {
    const result = purchaseLineTotals({
      ordered_quantity: 20,
      free_units: 2,
      price_per_unit: 500,
    });
    expect(result.grossValue).toBe(10000);
    expect(result.totalReceivedQuantity).toBe(22);
    expect(result.netAmount).toBe(10000);
    expect(result.effectiveCostPerUnit).toBeCloseTo(454.55, 2);
  });

  it('handles discounts in purchase line', () => {
    const result = purchaseLineTotals({
      ordered_quantity: 10,
      price_per_unit: 100,
      regular_discount: 50,
      special_discount: 50,
      scheme_discount: 100,
    });
    expect(result.grossValue).toBe(1000);
    expect(result.totalDiscount).toBe(200);
    expect(result.netAmount).toBe(800);
  });

  it('computes purchase totals with charges', () => {
    const lines = [{ ordered_quantity: 10, price_per_unit: 100 }];
    const { subtotal, grandTotal } = purchaseTotals(lines, 0, 0, 50, 0, 0);
    expect(subtotal).toBe(1000);
    expect(grandTotal).toBe(1050);
  });

  it('free units do not increase payable', () => {
    const lines = [
      { ordered_quantity: 20, free_units: 2, price_per_unit: 500 },
    ];
    const { subtotal, grandTotal } = purchaseTotals(lines, 0, 0);
    // Payable is based on ordered quantity only (20 * 500 = 10000)
    expect(subtotal).toBe(10000);
    expect(grandTotal).toBe(10000);
    // But received quantity is 22 — verified in purchaseLineTotals
    const lineResult = purchaseLineTotals(lines[0]);
    expect(lineResult.totalReceivedQuantity).toBe(22);
  });
});

describe('Ledger balances', () => {
  it('computes customer balance (debit - credit)', () => {
    const entries = [
      { debit_amount: 1000, credit_amount: 0 },
      { debit_amount: 0, credit_amount: 500 },
      { debit_amount: 200, credit_amount: 0 },
    ];
    expect(ledgerBalance(entries)).toBe(700);
  });

  it('computes supplier balance (credit - debit)', () => {
    const entries = [
      { debit_amount: 0, credit_amount: 5000 },
      { debit_amount: 2000, credit_amount: 0 },
    ];
    expect(supplierLedgerBalance(entries)).toBe(3000);
  });

  it('handles empty ledger', () => {
    expect(ledgerBalance([])).toBe(0);
    expect(supplierLedgerBalance([])).toBe(0);
  });
});

describe('Warranty expiry', () => {
  it('computes expiry in months', () => {
    expect(computeWarrantyExpiry('2026-07-20', 5, 'years')).toBe('2031-07-20');
  });

  it('computes expiry in days', () => {
    expect(computeWarrantyExpiry('2026-07-20', 30, 'days')).toBe('2026-08-19');
  });

  it('computes expiry in months', () => {
    expect(computeWarrantyExpiry('2026-01-31', 1, 'months')).toBe('2026-02-28');
  });

  it('handles lifetime warranty', () => {
    expect(computeWarrantyExpiry('2026-07-20', 0, 'lifetime')).toBe('2099-12-31');
  });
});

describe('Unit conversion', () => {
  const conversions = [
    { from_unit: 'carton', to_unit: 'box', factor: 12 },
    { from_unit: 'box', to_unit: 'piece', factor: 24 },
    { from_unit: 'kilogram', to_unit: 'gram', factor: 1000 },
  ];

  it('converts using direct conversion', () => {
    expect(convertQuantity(2, 'carton', 'box', conversions)).toBe(24);
    expect(convertQuantity(5, 'kilogram', 'gram', conversions)).toBe(5000);
  });

  it('converts using inverse conversion', () => {
    expect(convertQuantity(24000, 'gram', 'kilogram', conversions)).toBe(24);
  });

  it('returns same quantity for same unit', () => {
    expect(convertQuantity(5, 'piece', 'piece', conversions)).toBe(5);
  });

  it('returns original quantity when no conversion found', () => {
    expect(convertQuantity(5, 'liter', 'meter', conversions)).toBe(5);
  });
});
