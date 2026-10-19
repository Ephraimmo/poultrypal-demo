import { useFarm } from '@/contexts/FarmContext';
import type { HarvestRecord } from '@/types/farm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  harvestRef,
  harvestStatus,
  harvestStatusLabel,
  harvestedForBatch,
  liveBirdsRemaining,
  mortalityForBatch,
  remainingHarvestStock,
  soldForBatch,
} from '@/lib/harvest';
import { saleTotal } from '@/lib/revenue';

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${accent ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}

export default function HarvestDetailDialog({
  harvest,
  onOpenChange,
}: {
  harvest: HarvestRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { batches, sales, mortality, harvests } = useFarm();
  if (!harvest) return null;

  const batch = batches.find(b => b.id === harvest.batchId);
  const linkedSales = sales.filter(s => s.harvestId === harvest.id);
  const sold = linkedSales.reduce((s, r) => s + (r.quantity || 0), 0);
  const remaining = remainingHarvestStock(harvest, sales);
  const status = harvestStatus(harvest, sales);
  const revenue = linkedSales.reduce((s, r) => s + saleTotal(r), 0);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {harvestRef(harvest)}
            <Badge variant="outline">{harvestStatusLabel(status)}</Badge>
          </DialogTitle>
          <DialogDescription>
            {batch?.name ?? 'Unknown batch'} · harvested {new Date(harvest.date).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Harvested" value={harvest.quantity} />
          <Stat label="Sold" value={sold} />
          <Stat label="Remaining" value={remaining} accent />
          <Stat label="Revenue" value={`R${revenue.toLocaleString()}`} />
        </div>

        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Remaining = harvested {harvest.quantity} − sold {sold} = <span className="font-semibold text-foreground">{remaining}</span></p>
          {harvest.averageWeightKg != null && <p>Avg weight {harvest.averageWeightKg} kg · Total {harvest.totalWeightKg ?? '—'} kg</p>}
          {harvest.createdBy && <p>Created by {harvest.createdBy}</p>}
          {harvest.notes && <p>Notes: {harvest.notes}</p>}
        </div>

        {batch && (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-sm font-semibold">Batch inventory · {batch.name}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
              <Stat label="Initial" value={batch.initialCount} />
              <Stat label="Mortality" value={mortalityForBatch(batch.id, mortality)} />
              <Stat label="Harvested (batch)" value={harvestedForBatch(batch.id, harvests)} />
              <Stat label="Sold (batch)" value={soldForBatch(batch.id, sales)} />
              <Stat label="Live remaining" value={liveBirdsRemaining(batch, mortality, harvests)} accent />
              <Stat label="Status" value={batch.status} />
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-sm font-semibold">Linked sales ({linkedSales.length})</div>
          {linkedSales.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No sales recorded against this harvest yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedSales.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{new Date(s.date).toLocaleDateString()}</TableCell>
                    <TableCell>{s.buyer}</TableCell>
                    <TableCell className="text-right">{s.quantity}</TableCell>
                    <TableCell className="text-right">R{s.pricePerUnit.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">R{saleTotal(s).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}