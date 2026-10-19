import { useFarm } from '@/contexts/FarmContext';
import type { SaleRecord } from '@/types/farm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  harvestRef,
  harvestedForBatch,
  liveBirdsRemaining,
  mortalityForBatch,
  remainingHarvestStock,
  soldForBatch,
  soldFromHarvest,
} from '@/lib/harvest';
import { collectedForSale, isPendingSale, outstandingForSale, saleTotal } from '@/lib/revenue';

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${accent ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}

export default function SaleDetailDialog({
  sale,
  onOpenChange,
}: {
  sale: SaleRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { batches, sales, harvests, mortality, collections } = useFarm();
  if (!sale) return null;

  const batch = batches.find(b => b.id === sale.batchId);
  const harvest = sale.harvestId ? harvests.find(h => h.id === sale.harvestId) ?? null : null;
  const pending = isPendingSale(sale);
  const collected = pending ? collectedForSale(sale.id, collections) : saleTotal(sale);
  const outstanding = pending ? outstandingForSale(sale, collections) : 0;
  const saleCollections = collections.filter(c => c.saleId === sale.id);
  const statusLabel = sale.paymentStatus === 'advance' ? 'Advance' : pending && outstanding > 0 ? 'Pending' : 'Paid';

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Sale · {sale.buyer}
            <Badge variant="outline">{statusLabel}</Badge>
          </DialogTitle>
          <DialogDescription>
            {new Date(sale.date).toLocaleDateString()} · {batch?.name ?? 'Unknown batch'}
            {sale.invoiceNumber ? ` · ${sale.invoiceNumber}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Quantity" value={sale.quantity} />
          <Stat label="Price / bird" value={`R${sale.pricePerUnit.toLocaleString()}`} />
          <Stat label="Total" value={`R${saleTotal(sale).toLocaleString()}`} accent />
          <Stat label="Outstanding" value={`R${outstanding.toLocaleString()}`} />
        </div>

        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Collected R{collected.toLocaleString()} of R{saleTotal(sale).toLocaleString()}</p>
          {sale.buyerPhone && <p>Phone: {sale.buyerPhone}</p>}
        </div>

        {harvest ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-sm font-semibold">
              Source harvest · {harvestRef(harvest)} ({new Date(harvest.date).toLocaleDateString()})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
              <Stat label="Harvested" value={harvest.quantity} />
              <Stat label="Sold from harvest" value={soldFromHarvest(harvest.id, sales)} />
              <Stat label="Remaining stock" value={remainingHarvestStock(harvest, sales)} accent />
            </div>
            <p className="px-3 pb-3 text-xs text-muted-foreground">
              Remaining = {harvest.quantity} harvested − {soldFromHarvest(harvest.id, sales)} sold ={' '}
              <span className="font-semibold text-foreground">{remainingHarvestStock(harvest, sales)}</span>
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Legacy sale — not linked to a harvest record.</p>
        )}

        {batch && (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-sm font-semibold">Batch inventory · {batch.name}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
              <Stat label="Initial" value={batch.initialCount} />
              <Stat label="Mortality" value={mortalityForBatch(batch.id, mortality)} />
              <Stat label="Harvested" value={harvestedForBatch(batch.id, harvests)} />
              <Stat label="Sold" value={soldForBatch(batch.id, sales)} />
              <Stat label="Live remaining" value={liveBirdsRemaining(batch, mortality, harvests)} accent />
              <Stat label="Status" value={batch.status} />
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-sm font-semibold">Collections ({saleCollections.length})</div>
          {saleCollections.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No collections recorded against this sale.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleCollections.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{new Date(c.date).toLocaleDateString()}</TableCell>
                    <TableCell className="capitalize">{c.method}</TableCell>
                    <TableCell className="text-right font-semibold">R{c.amount.toLocaleString()}</TableCell>
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