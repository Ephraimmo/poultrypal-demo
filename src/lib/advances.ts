import type { AdvancePayment, PaymentCollection, SaleRecord } from '@/types/farm';
import { toNum } from '@/lib/num';
import { saleTotal } from '@/lib/revenue';

export interface AdvanceAllocation {
  advanceId: string;
  amount: number;
}

export function advanceRemaining(a: AdvancePayment): number {
  return Math.max(0, toNum(a.amount) - toNum(a.applied));
}

export function buyerAdvanceBalance(buyerId: string, advances: AdvancePayment[]): number {
  return advances.filter(a => a.buyerId === buyerId).reduce((s, a) => s + advanceRemaining(a), 0);
}

/**
 * FIFO-allocate `amount` against the buyer's advances (ordered by date, then id).
 * Returns the allocations produced and the updated advances array.
 * If insufficient credit, allocations sum to the available balance (caller must guard).
 */
export function allocateFIFO(
  buyerId: string,
  amount: number,
  advances: AdvancePayment[],
): { allocations: AdvanceAllocation[]; advances: AdvancePayment[] } {
  let remaining = Math.max(0, toNum(amount));
  const allocations: AdvanceAllocation[] = [];
  const ordered = [...advances]
    .filter(a => a.buyerId === buyerId)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))
    .map(a => a.id);
  const orderIndex = new Map(ordered.map((id, i) => [id, i]));
  const next = advances.map(a => ({ ...a }));
  next
    .filter(a => a.buyerId === buyerId)
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
    .forEach(a => {
      if (remaining <= 0) return;
      const avail = advanceRemaining(a);
      if (avail <= 0) return;
      const take = Math.min(avail, remaining);
      a.applied = toNum(a.applied) + take;
      remaining -= take;
      allocations.push({ advanceId: a.id, amount: take });
    });
  return { allocations, advances: next };
}

/**
 * Apply buyer advance credit to a specific pending sale as a payment collection.
 * Creates one PaymentCollection per advance consumed (sourceAdvanceId set) so
 * deletion of the advance can cleanly reverse the split.
 */
export function applyAdvanceToPendingSale(
  sale: SaleRecord,
  advances: AdvancePayment[],
  sales: SaleRecord[],
  collections: PaymentCollection[],
  date: string,
  makeId: () => string = () => crypto.randomUUID(),
): { advances: AdvancePayment[]; sales: SaleRecord[]; collections: PaymentCollection[] } {
  if (!sale.buyerId) return { advances, sales, collections };
  const balance = buyerAdvanceBalance(sale.buyerId, advances);
  const alreadyCollected = collections.filter(c => c.saleId === sale.id).reduce((s, c) => s + toNum(c.amount), 0);
  const outstanding = Math.max(0, saleTotal(sale) - alreadyCollected);
  const toApply = Math.min(balance, outstanding);
  if (toApply <= 0) return { advances, sales, collections };

  const { allocations, advances: nextAdvances } = allocateFIFO(sale.buyerId, toApply, advances);
  const newCollections = allocations.map<PaymentCollection>(al => ({
    id: makeId(),
    saleId: sale.id,
    batchId: sale.batchId,
    date,
    amount: al.amount,
    method: 'other',
    sourceAdvanceId: al.advanceId,
    notes: 'Applied from advance credit',
  }));
  const totalApplied = allocations.reduce((s, a) => s + a.amount, 0);
  const newCollected = alreadyCollected + totalApplied;
  const nowPaid = newCollected >= saleTotal(sale) - 0.001;
  const nextSales = sales.map(s => s.id !== sale.id ? s : {
    ...s,
    amountCollected: newCollected,
    paymentStatus: (nowPaid ? 'paid' : 'pending') as 'paid' | 'pending',
  });
  return {
    advances: nextAdvances,
    sales: nextSales,
    collections: [...collections, ...newCollections],
  };
}

/**
 * Delete an advance and cascade-revert everything it funded:
 *  - Remove any collections sourced from this advance and reduce those sales'
 *    amountCollected accordingly; recompute paid/pending status.
 *  - For advance-typed sales whose `advanceAllocations` include this advance,
 *    subtract that allocation's amount from amountCollected, drop the allocation,
 *    and flip to 'pending' with an invoice number if not fully covered anymore.
 */
export function deleteAdvance(
  advanceId: string,
  advances: AdvancePayment[],
  sales: SaleRecord[],
  collections: PaymentCollection[],
): { advances: AdvancePayment[]; sales: SaleRecord[]; collections: PaymentCollection[] } {
  // 1. Reverse collections sourced from this advance
  const affectedByCollection = new Map<string, number>();
  const nextCollections = collections.filter(c => {
    if (c.sourceAdvanceId === advanceId) {
      affectedByCollection.set(c.saleId, (affectedByCollection.get(c.saleId) ?? 0) + toNum(c.amount));
      return false;
    }
    return true;
  });

  let nextSales = sales.map(s => {
    const revert = affectedByCollection.get(s.id) ?? 0;
    if (revert <= 0) return s;
    const newCollected = Math.max(0, toNum(s.amountCollected) - revert);
    return {
      ...s,
      amountCollected: newCollected,
      paymentStatus: (newCollected >= saleTotal(s) - 0.001 ? 'paid' : 'pending') as 'paid' | 'pending',
    };
  });

  // 2. Reverse advance-typed sale allocations
  nextSales = nextSales.map(s => {
    const allocs = s.advanceAllocations;
    if (!allocs || !allocs.some(a => a.advanceId === advanceId)) return s;
    const removed = allocs.filter(a => a.advanceId === advanceId).reduce((sum, a) => sum + toNum(a.amount), 0);
    const remainingAllocs = allocs.filter(a => a.advanceId !== advanceId);
    const newCollected = Math.max(0, toNum(s.amountCollected) - removed);
    const total = saleTotal(s);
    const fullyPaid = newCollected >= total - 0.001;
    return {
      ...s,
      amountCollected: newCollected,
      advanceAllocations: remainingAllocs.length ? remainingAllocs : undefined,
      advanceIds: (s.advanceIds || []).filter(id => id !== advanceId),
      paymentStatus: (fullyPaid ? 'paid' : 'pending') as 'paid' | 'pending',
    };
  });

  return {
    advances: advances.filter(a => a.id !== advanceId),
    sales: nextSales,
    collections: nextCollections,
  };
}
