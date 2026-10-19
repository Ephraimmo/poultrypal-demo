import { describe, it, expect } from 'vitest';
import type { SaleRecord, PaymentCollection } from '@/types/farm';
import {
  receivedRevenue,
  outstandingForSale,
  collectedForSale,
  isPaidSale,
  isPendingSale,
  saleTotal,
} from '@/lib/revenue';

/**
 * End-to-end simulation of the Pending Collection workflow:
 * create pending sale → record partial payments → verify Collections
 * page state, invoice status flip, and dashboard revenue update.
 */
function makePendingSale(overrides: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: 'sale-1',
    batchId: 'batch-1',
    date: '2026-07-02',
    quantity: 10,
    pricePerUnit: 100,
    buyer: 'Acme',
    paymentStatus: 'pending',
    amountCollected: 0,
    invoiceNumber: 'INV-20260702-0001',
    ...overrides,
  } as SaleRecord;
}

function recordPayment(
  sale: SaleRecord,
  sales: SaleRecord[],
  collections: PaymentCollection[],
  amount: number,
): { sales: SaleRecord[]; collections: PaymentCollection[] } {
  const outstanding = outstandingForSale(sale, collections);
  // mirrors zod schema in MoneyCollectionsPage
  if (!(amount > 0)) throw new Error('Amount must be greater than 0.');
  if (amount > outstanding + 0.001)
    throw new Error(`Amount cannot exceed outstanding R${outstanding.toFixed(2)}.`);

  const entry: PaymentCollection = {
    id: `c-${collections.length + 1}`,
    saleId: sale.id,
    batchId: sale.batchId,
    date: '2026-07-02',
    amount,
    method: 'cash',
  };
  const nextCollections = [...collections, entry];
  const newCollected = (sale.amountCollected ?? 0) + amount;
  const nowPaid = newCollected >= saleTotal(sale) - 0.001;
  const nextSales = sales.map(s =>
    s.id !== sale.id ? s : { ...s, amountCollected: newCollected, paymentStatus: nowPaid ? 'paid' as const : 'pending' as const },
  );
  return { sales: nextSales, collections: nextCollections };
}

describe('Pending Collection workflow (e2e simulation)', () => {
  it('creates a pending sale that appears on Collections page and adds nothing to received revenue', () => {
    const sale = makePendingSale();
    const sales = [sale];
    const collections: PaymentCollection[] = [];

    expect(isPendingSale(sale)).toBe(true);
    expect(outstandingForSale(sale, collections)).toBe(1000);
    expect(receivedRevenue(sales, collections)).toBe(0);
  });

  it('records partial payments, keeps status pending, and updates revenue incrementally', () => {
    let sales: SaleRecord[] = [makePendingSale()];
    let collections: PaymentCollection[] = [];

    ({ sales, collections } = recordPayment(sales[0], sales, collections, 400));
    let sale = sales[0];
    expect(sale.paymentStatus).toBe('pending');
    expect(sale.amountCollected).toBe(400);
    expect(collectedForSale(sale.id, collections)).toBe(400);
    expect(outstandingForSale(sale, collections)).toBe(600);
    expect(receivedRevenue(sales, collections)).toBe(400);

    ({ sales, collections } = recordPayment(sales[0], sales, collections, 600));
    sale = sales[0];
    expect(sale.paymentStatus).toBe('paid');
    expect(isPaidSale(sale)).toBe(true);
    expect(outstandingForSale(sale, collections)).toBe(0);
    // Once fully paid, revenue equals the sale total (collections against a paid
    // sale are folded into the sale's revenue, not double-counted).
    expect(receivedRevenue(sales, collections)).toBe(saleTotal(sale));
  });

  it('rejects zero, negative, and over-outstanding amounts', () => {
    const sale = makePendingSale();
    const sales = [sale];
    const collections: PaymentCollection[] = [];
    expect(() => recordPayment(sale, sales, collections, 0)).toThrow(/greater than 0/);
    expect(() => recordPayment(sale, sales, collections, -50)).toThrow(/greater than 0/);
    expect(() => recordPayment(sale, sales, collections, 1500)).toThrow(/cannot exceed/);
  });

  it('R400 on R1000 invoice: progress 40/60, no double count on state changes', () => {
    let sales: SaleRecord[] = [makePendingSale()];
    let collections: PaymentCollection[] = [];
    ({ sales, collections } = recordPayment(sales[0], sales, collections, 400));
    const s = sales[0];
    const total = saleTotal(s);
    const collected = collectedForSale(s.id, collections);
    const outstanding = outstandingForSale(s, collections);
    expect(collected).toBe(400);
    expect(outstanding).toBe(600);
    expect(Math.round((collected / total) * 100)).toBe(40);
    expect(Math.round((outstanding / total) * 100)).toBe(60);
    expect(s.paymentStatus).toBe('pending');
    expect(receivedRevenue(sales, collections)).toBe(400);

    // Flip to paid — must not double count (still 1000, not 1400)
    ({ sales, collections } = recordPayment(sales[0], sales, collections, 600));
    expect(sales[0].paymentStatus).toBe('paid');
    expect(receivedRevenue(sales, collections)).toBe(1000);
  });
});

describe('Advance payment workflow', () => {
  const mkAdvance = (over: Partial<import('@/types/farm').AdvancePayment> = {}): import('@/types/farm').AdvancePayment => ({
    id: 'adv-1',
    buyerId: 'buyer-1',
    buyerName: 'Acme',
    date: '2026-07-01',
    amount: 1500,
    applied: 0,
    method: 'cash',
    ...over,
  });
  const mkPendingSale = (over: Partial<SaleRecord> = {}): SaleRecord => ({
    id: 'sale-adv-1',
    batchId: 'batch-1',
    date: '2026-07-02',
    quantity: 10,
    pricePerUnit: 100,
    buyer: 'Acme',
    buyerId: 'buyer-1',
    paymentStatus: 'pending',
    amountCollected: 0,
    invoiceNumber: 'INV-1',
    ...over,
  });

  it('deleting an unallocated advance simply restores the balance to zero', async () => {
    const { deleteAdvance, buyerAdvanceBalance } = await import('@/lib/advances');
    const advances = [mkAdvance({ amount: 500 })];
    expect(buyerAdvanceBalance('buyer-1', advances)).toBe(500);
    const res = deleteAdvance('adv-1', advances, [], []);
    expect(res.advances).toHaveLength(0);
    expect(buyerAdvanceBalance('buyer-1', res.advances)).toBe(0);
  });

  it('deleting an applied advance reverts the invoice collected/outstanding split', async () => {
    const { applyAdvanceToPendingSale, deleteAdvance, buyerAdvanceBalance } = await import('@/lib/advances');
    let advances = [mkAdvance({ amount: 400 })];
    let sales = [mkPendingSale()]; // total 1000
    let collections: PaymentCollection[] = [];

    // Apply 400 credit to the 1000 invoice: collected=400, outstanding=600, still pending
    ({ advances, sales, collections } = applyAdvanceToPendingSale(
      sales[0], advances, sales, collections, '2026-07-03', (() => { let i = 0; return () => `c-${++i}`; })(),
    ));
    expect(collectedForSale('sale-adv-1', collections)).toBe(400);
    expect(outstandingForSale(sales[0], collections)).toBe(600);
    expect(sales[0].paymentStatus).toBe('pending');
    expect(buyerAdvanceBalance('buyer-1', advances)).toBe(0);
    // Advance is NOT counted as revenue — only the applied collection is
    expect(receivedRevenue(sales, collections)).toBe(400);

    // Delete the advance → collection reversed, sale back to fully outstanding, balance restored to 0 (advance gone)
    const res = deleteAdvance('adv-1', advances, sales, collections);
    expect(res.advances).toHaveLength(0);
    expect(res.collections).toHaveLength(0);
    expect(res.sales[0].amountCollected).toBe(0);
    expect(res.sales[0].paymentStatus).toBe('pending');
    expect(outstandingForSale(res.sales[0], res.collections)).toBe(1000);
    expect(receivedRevenue(res.sales, res.collections)).toBe(0);
  });

  it('e2e: record advance → apply to pending sale → totals update, advance never counted as revenue', async () => {
    const { applyAdvanceToPendingSale, buyerAdvanceBalance } = await import('@/lib/advances');
    let advances = [mkAdvance({ amount: 1500 })]; // buyer prepays R1500
    let sales = [mkPendingSale()]; // R1000 pending invoice
    let collections: PaymentCollection[] = [];

    // Before applying: advance is a liability, revenue = 0
    expect(buyerAdvanceBalance('buyer-1', advances)).toBe(1500);
    expect(receivedRevenue(sales, collections)).toBe(0);

    ({ advances, sales, collections } = applyAdvanceToPendingSale(
      sales[0], advances, sales, collections, '2026-07-03',
    ));

    // Invoice fully covered → flips to paid, collected=1000, outstanding=0
    expect(sales[0].paymentStatus).toBe('paid');
    expect(collectedForSale('sale-adv-1', collections)).toBe(1000);
    expect(outstandingForSale(sales[0], collections)).toBe(0);
    // Advance remaining = 1500 - 1000 = 500 (still a liability)
    expect(buyerAdvanceBalance('buyer-1', advances)).toBe(500);
    // Revenue counts the sale exactly once (via the paid sale total), not the advance itself
    expect(receivedRevenue(sales, collections)).toBe(1000);
  });
});


