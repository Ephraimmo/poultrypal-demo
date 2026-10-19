import type { SaleRecord, PaymentCollection } from '@/types/farm';
import { toNum } from '@/lib/num';

/** A sale is "paid" if paymentStatus is missing (legacy), 'paid', or 'advance'. */
export const isPaidSale = (s: SaleRecord) =>
  !s.paymentStatus || s.paymentStatus === 'paid' || s.paymentStatus === 'advance';

export const isPendingSale = (s: SaleRecord) => s.paymentStatus === 'pending';

export const saleTotal = (s: SaleRecord) => toNum(s.quantity) * toNum(s.pricePerUnit);

export const collectedForSale = (
  saleId: string,
  collections: PaymentCollection[],
) => collections.filter(c => c.saleId === saleId).reduce((s, c) => s + toNum(c.amount), 0);

export const outstandingForSale = (
  s: SaleRecord,
  collections: PaymentCollection[],
) => Math.max(0, saleTotal(s) - collectedForSale(s.id, collections));

/**
 * Real received revenue = fully-paid sales (revenue at time of sale)
 * plus any collections received against pending invoices.
 * Pending invoices without payments contribute nothing.
 * Unallocated advance payments are NOT counted (they're a liability).
 */
export function receivedRevenue(
  sales: SaleRecord[],
  collections: PaymentCollection[],
) {
  const paidRevenue = sales.filter(isPaidSale).reduce((s, r) => s + saleTotal(r), 0);
  const pendingIds = new Set(sales.filter(isPendingSale).map(s => s.id));
  const pendingCollected = collections
    .filter(c => pendingIds.has(c.saleId))
    .reduce((s, c) => s + toNum(c.amount), 0);
  return paidRevenue + pendingCollected;
}

/** Received revenue scoped to a specific batch. */
export function receivedRevenueForBatch(
  batchId: string,
  sales: SaleRecord[],
  collections: PaymentCollection[],
) {
  const paid = sales
    .filter(s => s.batchId === batchId && isPaidSale(s))
    .reduce((s, r) => s + saleTotal(r), 0);
  const pendingIds = new Set(sales.filter(s => s.batchId === batchId && isPendingSale(s)).map(s => s.id));
  const collected = collections
    .filter(c => c.batchId === batchId && pendingIds.has(c.saleId))
    .reduce((s, c) => s + toNum(c.amount), 0);
  return paid + collected;
}

export function generateInvoiceNumber(existing: SaleRecord[]): string {
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const todaysCount = existing.filter(s => (s.invoiceNumber || '').includes(`INV-${stamp}`)).length + 1;
  return `INV-${stamp}-${String(todaysCount).padStart(4, '0')}`;
}
