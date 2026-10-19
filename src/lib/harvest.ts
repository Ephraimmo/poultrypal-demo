import type { Batch, HarvestRecord, MortalityRecord, SaleRecord, HarvestStatus } from '@/types/farm';

/** Total birds harvested from a batch (all harvest records combined). */
export function harvestedForBatch(batchId: string, harvests: HarvestRecord[]): number {
  return harvests.filter(h => h.batchId === batchId).reduce((s, h) => s + (h.quantity || 0), 0);
}

/** Total mortalities recorded for a batch. */
export function mortalityForBatch(batchId: string, mortality: MortalityRecord[]): number {
  return mortality.filter(m => m.batchId === batchId).reduce((s, m) => s + (m.count || 0), 0);
}

/** Total sold across all sales linked to this harvest. */
export function soldFromHarvest(harvestId: string, sales: SaleRecord[]): number {
  return sales.filter(s => s.harvestId === harvestId).reduce((s, r) => s + (r.quantity || 0), 0);
}

/** Remaining stock (unsold) on a specific harvest record. */
export function remainingHarvestStock(harvest: HarvestRecord, sales: SaleRecord[]): number {
  return Math.max(0, harvest.quantity - soldFromHarvest(harvest.id, sales));
}

/** Live birds still in a batch that have NOT been harvested or died. */
export function liveBirdsRemaining(
  batch: Batch,
  mortality: MortalityRecord[],
  harvests: HarvestRecord[],
): number {
  return Math.max(
    0,
    batch.initialCount - mortalityForBatch(batch.id, mortality) - harvestedForBatch(batch.id, harvests),
  );
}

/** Max chickens the user is still allowed to harvest from this batch. */
export function availableForHarvest(
  batch: Batch,
  mortality: MortalityRecord[],
  harvests: HarvestRecord[],
): number {
  return liveBirdsRemaining(batch, mortality, harvests);
}

/** Total unsold harvest stock across ALL harvest records for a batch. */
export function harvestStockRemainingForBatch(
  batchId: string,
  harvests: HarvestRecord[],
  sales: SaleRecord[],
): number {
  return harvests
    .filter(h => h.batchId === batchId)
    .reduce((s, h) => s + remainingHarvestStock(h, sales), 0);
}

/** Total sold across all sales for a batch (through any harvest). */
export function soldForBatch(batchId: string, sales: SaleRecord[]): number {
  return sales.filter(s => s.batchId === batchId).reduce((s, r) => s + (r.quantity || 0), 0);
}

export function harvestStatus(harvest: HarvestRecord, sales: SaleRecord[]): HarvestStatus {
  const sold = soldFromHarvest(harvest.id, sales);
  if (sold <= 0) return 'available';
  if (sold >= harvest.quantity) return 'sold_out';
  return 'partially_sold';
}

export function harvestStatusLabel(status: HarvestStatus): string {
  return status === 'available' ? 'Available' : status === 'partially_sold' ? 'Partially Sold' : 'Sold Out';
}

/** Format a short, stable harvest reference for humans (H-####). */
export function harvestRef(harvest: HarvestRecord): string {
  return `H-${harvest.id.slice(0, 6).toUpperCase()}`;
}