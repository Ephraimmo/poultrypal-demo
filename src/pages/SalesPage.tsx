import { useMemo, useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { SaleRecord, Buyer } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, ShoppingCart, Pencil, Trash2, MessageCircle, Clock, CheckCircle2, Wallet, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';
import { Badge } from '@/components/ui/badge';
import { receivedRevenue, isPendingSale, generateInvoiceNumber, collectedForSale, outstandingForSale, saleTotal } from '@/lib/revenue';
import { toNum } from '@/lib/num';
import { harvestRef, remainingHarvestStock, soldFromHarvest } from '@/lib/harvest';
import ExportButtons from '@/components/ExportButtons';
import SaleDetailDialog from '@/components/SaleDetailDialog';
import { useUrlTableState } from '@/hooks/useUrlTableState';
import { useFlockScope } from '@/hooks/useFlockScope';
import { useCan } from '@/contexts/PermissionsContext';
import { Can } from '@/components/Can';
import { toast } from 'sonner';
import { z } from 'zod';

const saleSchema = z.object({
  harvestId: z.string().trim().min(1, 'Please select a harvest record.'),
  date: z.string().trim().min(1, 'Date is required.'),
  quantity: z.coerce.number().int('Quantity must be a whole number.').positive('Enter a valid quantity.'),
  pricePerUnit: z.coerce.number().positive('Enter a valid price per bird.'),
  buyer: z.string().trim().min(1, 'Buyer is required.').max(100, 'Buyer name is too long.'),
  buyerPhone: z.string().trim().max(30, 'Phone number is too long.').optional(),
});

const WALK_IN = 'walk-in';
const NEW_BUYER = 'new-buyer';

function generateWhatsAppLink(sale: SaleRecord, batchName: string, buyerPhone: string) {
  const total = sale.quantity * sale.pricePerUnit;
  const message = `Hello ${sale.buyer},\n\nThank you for buying chickens from our farm.\n\nOrder Details:\nBatch: ${batchName}\nQuantity: ${sale.quantity} Chickens\nPrice per Chicken: R${sale.pricePerUnit.toLocaleString()}\n\nTotal: R${total.toLocaleString()}\n\nThank you for your support.`;
  const phone = buyerPhone.replace(/[^0-9]/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

type PayStatus = 'paid' | 'pending' | 'advance';
type SaleSortKey = 'date' | 'batch' | 'quantity' | 'total' | 'buyer' | 'status';
const PAGE_SIZE = 10;

export default function SalesPage() {
  const {
    batches: allBatches, setBatches,
    sales: allSales, setSales,
    collections: allCollections,
    buyers, setBuyers,
    advances, setAdvances,
    harvests: allHarvests,
  } = useFarm();

  // ---- Flock-based scoping: non-admins only see their assigned flocks ----
  const { scope } = useFlockScope();
  const batches = useMemo(() => scope(allBatches, b => b.id), [allBatches, scope]);
  const sales = useMemo(() => scope(allSales, s => s.batchId), [allSales, scope]);
  const harvests = useMemo(() => scope(allHarvests, h => h.batchId), [allHarvests, scope]);
  const collections = useMemo(() => {
    const ids = new Set(sales.map(s => s.id));
    return allCollections.filter(c => ids.has(c.saleId));
  }, [allCollections, sales]);

  // ---- Permission gating ----
  const canCreate = useCan('sales', 'create');
  const canEdit = useCan('sales', 'edit');
  const canDelete = useCan('sales', 'delete');
  const canExport = useCan('sales', 'export');

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useFilterState('sales');
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleRecord | null>(null);
  const [table, setTable] = useUrlTableState('s', { sort: 'date', dir: 'desc', page: 1 });
  const [newBuyerOpen, setNewBuyerOpen] = useState(false);
  const [newBuyer, setNewBuyer] = useState({ name: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    harvestId: '',
    batchId: '',
    quantity: '',
    pricePerUnit: '',
    buyerId: WALK_IN, // WALK_IN | buyer.id
    buyer: 'Walk-in',
    buyerPhone: '',
    date: new Date().toISOString().split('T')[0],
    paymentStatus: 'paid' as PayStatus,
  });

  const resetForm = () => { setForm({ harvestId: '', batchId: '', quantity: '', pricePerUnit: '', buyerId: WALK_IN, buyer: 'Walk-in', buyerPhone: '', date: new Date().toISOString().split('T')[0], paymentStatus: 'paid' }); setFormError(''); };

  // Harvest records with remaining stock. When editing, include the edited sale's own harvest so it stays selectable.
  const editingSale = editId ? sales.find(s => s.id === editId) : null;
  const sellableHarvests = useMemo(() => {
    return harvests.filter(h => {
      const remaining = remainingHarvestStock(h, sales);
      if (editingSale && editingSale.harvestId === h.id) return true;
      return remaining > 0;
    });
  }, [harvests, sales, editingSale]);

  const selectedHarvest = form.harvestId ? harvests.find(h => h.id === form.harvestId) ?? null : null;
  const remainingForSelected = useMemo(() => {
    if (!selectedHarvest) return 0;
    const otherSales = editingSale ? sales.filter(s => s.id !== editingSale.id) : sales;
    return Math.max(0, selectedHarvest.quantity - soldFromHarvest(selectedHarvest.id, otherSales));
  }, [selectedHarvest, sales, editingSale]);

  const noHarvestsAvailable = sellableHarvests.length === 0 && !editingSale;

  const pickHarvest = (harvestId: string) => {
    const h = harvests.find(x => x.id === harvestId);
    if (!h) return;
    const batch = batches.find(b => b.id === h.batchId);
    setForm(f => ({
      ...f,
      harvestId,
      batchId: h.batchId,
      // Default price from batch selling price if user hasn't entered one yet
      pricePerUnit: f.pricePerUnit || (batch?.sellingPricePerUnit ? String(batch.sellingPricePerUnit) : ''),
    }));
  };

  // Advance balances per buyer
  const advanceBalance = useMemo(() => {
    const map = new Map<string, number>();
    advances.forEach(a => map.set(a.buyerId, (map.get(a.buyerId) ?? 0) + toNum(a.amount) - toNum(a.applied)));
    return map;
  }, [advances]);

  const selectedBuyerBalance = form.buyerId && form.buyerId !== WALK_IN ? (advanceBalance.get(form.buyerId) ?? 0) : 0;

  const pickBuyer = (id: string) => {
    if (id === NEW_BUYER) { setNewBuyerOpen(true); return; }
    if (id === WALK_IN) { setForm(f => ({ ...f, buyerId: WALK_IN, buyer: 'Walk-in', buyerPhone: '' })); return; }
    const b = buyers.find(x => x.id === id);
    if (!b) return;
    setForm(f => ({ ...f, buyerId: b.id, buyer: b.name, buyerPhone: b.phone || '', paymentStatus: f.paymentStatus }));
  };

  const saveNewBuyer = () => {
    const name = newBuyer.name.trim();
    if (!name) return;
    const b: Buyer = { id: crypto.randomUUID(), name, phone: newBuyer.phone.trim() || undefined, createdAt: new Date().toISOString() };
    setBuyers(prev => [...prev, b]);
    setForm(f => ({ ...f, buyerId: b.id, buyer: b.name, buyerPhone: b.phone || '' }));
    setNewBuyer({ name: '', phone: '' });
    setNewBuyerOpen(false);
  };

  const addSale = () => {
    setFormError('');
    if (!canCreate) { toast.error('You do not have permission to record sales.'); return; }
    const parsed = saleSchema.safeParse(form);
    if (!parsed.success) {
      const msg = parsed.error.issues[0].message;
      setFormError(msg); toast.error(msg); return;
    }
    const qty = parsed.data.quantity;
    const price = parsed.data.pricePerUnit;
    if (qty > remainingForSelected) { const m = 'Sale quantity exceeds the available harvested chickens.'; setFormError(m); toast.error(m); return; }
    const total = qty * price;

    if (form.paymentStatus === 'advance') {
      if (form.buyerId === WALK_IN) { const m = 'Advance payments require a saved buyer.'; setFormError(m); toast.error(m); return; }
      const bal = advanceBalance.get(form.buyerId) ?? 0;
      if (bal + 0.001 < total) { const m = `Advance balance R${bal.toFixed(2)} is less than sale total R${total.toFixed(2)}.`; setFormError(m); toast.error(m); return; }
    }


    const record: SaleRecord = {
      id: crypto.randomUUID(), batchId: form.batchId, harvestId: form.harvestId, date: form.date, quantity: qty,
      pricePerUnit: price, buyer: form.buyer.trim() || 'Walk-in',
      buyerId: form.buyerId === WALK_IN ? undefined : form.buyerId,
      buyerPhone: form.buyerPhone.trim() || undefined,
      paymentStatus: form.paymentStatus,
      amountCollected: form.paymentStatus === 'pending' ? 0 : total,
      invoiceNumber: form.paymentStatus === 'pending' ? generateInvoiceNumber(sales) : undefined,
    };

    if (form.paymentStatus === 'advance') {
      // Allocate against advances FIFO
      let remaining = total;
      const usedIds: string[] = [];
      const allocations: { advanceId: string; amount: number }[] = [];
      const nextAdvances = advances.map(a => {
        if (a.buyerId !== form.buyerId || remaining <= 0) return a;
        const avail = toNum(a.amount) - toNum(a.applied);
        if (avail <= 0) return a;
        const take = Math.min(avail, remaining);
        remaining -= take;
        usedIds.push(a.id);
        allocations.push({ advanceId: a.id, amount: take });
        return { ...a, applied: toNum(a.applied) + take };
      });
      setAdvances(nextAdvances);
      record.advanceIds = usedIds;
      record.advanceAllocations = allocations;
    }

    setSales(prev => [...prev, record]);
    setBatches(prev => prev.map(b => b.id === form.batchId ? { ...b, currentCount: Math.max(0, b.currentCount - qty) } : b));
    toast.success(`Sale recorded: ${qty} birds`);
    resetForm(); setOpen(false);
  };

  const startEdit = (r: SaleRecord) => {
    if (!canEdit) { toast.error('You do not have permission to edit sales.'); return; }
    setEditId(r.id);
    setForm({
      harvestId: r.harvestId ?? '',
      batchId: r.batchId,
      quantity: String(r.quantity),
      pricePerUnit: String(r.pricePerUnit),
      buyerId: r.buyerId || WALK_IN,
      buyer: r.buyer,
      buyerPhone: r.buyerPhone || '',
      date: r.date,
      paymentStatus: (r.paymentStatus ?? 'paid') as PayStatus,
    });
    setEditOpen(true);
  };

  const saveEdit = () => {
    setFormError('');
    if (!canEdit) { toast.error('You do not have permission to edit sales.'); return; }
    if (!editId) return;
    const oldRecord = sales.find(r => r.id === editId);
    if (!oldRecord) return;
    const parsed = saleSchema.safeParse(form);
    if (!parsed.success) {
      const msg = parsed.error.issues[0].message;
      setFormError(msg); toast.error(msg); return;
    }
    const newQty = parsed.data.quantity;
    // Enforce remaining-stock rule against the same harvest
    if (form.harvestId && newQty > remainingForSelected) {
      const m = 'Sale quantity exceeds the available harvested chickens.';
      setFormError(m); toast.error(m); return;
    }
    const qtyDiff = newQty - oldRecord.quantity;
    setSales(prev => prev.map(r => r.id !== editId ? r : {
      ...r,
      quantity: newQty,
      pricePerUnit: parsed.data.pricePerUnit,
      buyer: parsed.data.buyer || 'Walk-in',
      buyerId: form.buyerId === WALK_IN ? undefined : form.buyerId,
      buyerPhone: form.buyerPhone.trim() || undefined,
      date: parsed.data.date,
    }));
    if (qtyDiff !== 0) setBatches(prev => prev.map(b => b.id === oldRecord.batchId ? { ...b, currentCount: Math.max(0, b.currentCount - qtyDiff) } : b));
    toast.success('Sale updated');
    resetForm(); setEditId(null); setEditOpen(false);
  };


  const confirmDelete = () => {
    if (!canDelete) { toast.error('You do not have permission to delete sales.'); setDeleteId(null); return; }
    if (!deleteId) return;
    const record = sales.find(r => r.id === deleteId);
    if (record) {
      setBatches(prev => prev.map(b => b.id === record.batchId ? { ...b, currentCount: b.currentCount + record.quantity } : b));
      // If it was an advance-funded sale, refund allocation
      if (record.paymentStatus === 'advance' && record.advanceIds?.length) {
        let refund = saleTotal(record);
        setAdvances(prev => prev.map(a => {
          if (!record.advanceIds!.includes(a.id) || refund <= 0) return a;
          const applied = toNum(a.applied);
          const take = Math.min(applied, refund);
          refund -= take;
          return { ...a, applied: applied - take };
        }));
      }
    }
    setSales(prev => prev.filter(r => r.id !== deleteId));
    setDeleteId(null);
    toast.success('Sale deleted');
  };

  // Quick sell
  const [quickHarvestId, setQuickHarvestId] = useState('');
  const quickHarvest = quickHarvestId ? harvests.find(h => h.id === quickHarvestId) ?? null : null;
  const quickRemaining = quickHarvest ? remainingHarvestStock(quickHarvest, sales) : 0;
  const quickSell = (qty: number) => {
    if (!canCreate) { toast.error('You do not have permission to record sales.'); return; }
    if (!quickHarvestId || !quickHarvest) return;
    if (qty > quickRemaining) {
      toast.error('Sale quantity exceeds the available harvested chickens.');
      return;
    }
    const batch = batches.find(b => b.id === quickHarvest.batchId);
    if (!batch) return;
    const record: SaleRecord = {
      id: crypto.randomUUID(), batchId: quickHarvest.batchId, harvestId: quickHarvestId, date: new Date().toISOString().split('T')[0],
      quantity: qty, pricePerUnit: batch.sellingPricePerUnit, buyer: 'Quick Sale',
    };
    setSales(prev => [...prev, record]);
    setBatches(prev => prev.map(b => b.id === quickHarvest.batchId ? { ...b, currentCount: Math.max(0, b.currentCount - qty) } : b));
    toast.success(`Quick sale: ${qty} birds`);
  };

  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name || 'Unknown';
  const totalRevenue = receivedRevenue(sales, collections);
  const pendingTotal = sales.filter(isPendingSale).reduce((s, r) => s + outstandingForSale(r, collections), 0);

  const sortKey = table.sort as SaleSortKey;
  const sortDir = table.dir as 'asc' | 'desc';

  const filteredSales = useMemo(() => applyDataFilter(sales, filter, {
    dateField: r => r.date,
    searchFields: r => [r.buyer, r.buyerPhone || '', r.invoiceNumber || ''],
    selectFields: { batch: r => r.batchId },
  }), [sales, filter]);

  const saleStatusLabel = (r: SaleRecord) =>
    r.paymentStatus === 'advance' ? 'Advance' : isPendingSale(r) && outstandingForSale(r, collections) > 0 ? 'Pending' : 'Paid';

  const sortedSales = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredSales].sort((a, b) => {
      switch (sortKey) {
        case 'batch': return getBatchName(a.batchId).localeCompare(getBatchName(b.batchId)) * dir;
        case 'quantity': return (a.quantity - b.quantity) * dir;
        case 'total': return (saleTotal(a) - saleTotal(b)) * dir;
        case 'buyer': return a.buyer.localeCompare(b.buyer) * dir;
        case 'status': return saleStatusLabel(a).localeCompare(saleStatusLabel(b)) * dir;
        default: return (a.date + a.id).localeCompare(b.date + b.id) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSales, sortKey, sortDir, batches, collections]);

  const totalPages = Math.max(1, Math.ceil(sortedSales.length / PAGE_SIZE));
  const currentPage = Math.min(table.page, totalPages);
  const pageSales = sortedSales.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSort = (key: SaleSortKey) => {
    if (sortKey === key) setTable({ dir: sortDir === 'asc' ? 'desc' : 'asc', page: 1 });
    else setTable({ sort: key, dir: key === 'batch' || key === 'buyer' || key === 'status' ? 'asc' : 'desc', page: 1 });
  };

  const SortHead = ({ k, label }: { k: SaleSortKey; label: string }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === k ? 'text-foreground font-semibold' : ''}`}
      >
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  const formFields = (
    <div className="space-y-4 pt-2">
      <div>
        <Label>Harvest Record</Label>
        <Select value={form.harvestId} onValueChange={pickHarvest}>
          <SelectTrigger><SelectValue placeholder="Select harvest" /></SelectTrigger>
          <SelectContent>
            {sellableHarvests.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No harvest records with remaining stock.</div>
            )}
            {sellableHarvests.map(h => {
              const remaining = remainingHarvestStock(h, sales);
              const batchName = batches.find(b => b.id === h.batchId)?.name ?? 'Unknown';
              return (
                <SelectItem key={h.id} value={h.id}>
                  {harvestRef(h)} · {batchName} · {new Date(h.date).toLocaleDateString()} · {remaining} left
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {selectedHarvest && (
          <div className="mt-2 rounded-md bg-muted/50 border border-border p-2 text-xs space-y-0.5">
            <div><span className="text-muted-foreground">Batch:</span> <span className="font-medium">{batches.find(b => b.id === selectedHarvest.batchId)?.name ?? 'Unknown'}</span></div>
            <div><span className="text-muted-foreground">Harvest Date:</span> {new Date(selectedHarvest.date).toLocaleDateString()}</div>
            <div><span className="text-muted-foreground">Harvested:</span> {selectedHarvest.quantity} · <span className="text-muted-foreground">Remaining:</span> <span className="font-semibold text-primary">{remainingForSelected}</span></div>
            {selectedHarvest.averageWeightKg != null && (
              <div><span className="text-muted-foreground">Avg Weight:</span> {selectedHarvest.averageWeightKg} kg</div>
            )}
          </div>
        )}
      </div>
      <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Quantity</Label>
          <Input type="number" placeholder="50" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          {selectedHarvest && <p className="text-[10px] text-muted-foreground mt-1">Max {remainingForSelected}</p>}
        </div>
        <div><Label>Price / Bird (R)</Label><Input type="number" placeholder="5000" value={form.pricePerUnit} onChange={e => setForm(f => ({ ...f, pricePerUnit: e.target.value }))} /></div>
      </div>
      <div>
        <Label>Buyer</Label>
        <Select value={form.buyerId} onValueChange={pickBuyer}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={WALK_IN}>Walk-in (default)</SelectItem>
            {buyers.map(b => {
              const bal = advanceBalance.get(b.id) ?? 0;
              return (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}{b.phone ? ` · ${b.phone}` : ''}{bal > 0 ? ` · Advance R${bal.toLocaleString()}` : ''}
                </SelectItem>
              );
            })}
            <SelectItem value={NEW_BUYER}>+ Add new buyer…</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.buyerId === WALK_IN && (
        <div><Label>Buyer Phone (optional)</Label><Input placeholder="+27..." value={form.buyerPhone} onChange={e => setForm(f => ({ ...f, buyerPhone: e.target.value }))} /></div>
      )}
      <div>
        <Label>Payment Status</Label>
        <Select value={form.paymentStatus} onValueChange={v => setForm(f => ({ ...f, paymentStatus: v as PayStatus }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="paid">Paid (received now)</SelectItem>
            <SelectItem value="pending">Pending Collection (invoice)</SelectItem>
            <SelectItem value="advance">Advance (use pre-paid credit)</SelectItem>
          </SelectContent>
        </Select>
        {form.paymentStatus === 'pending' && (
          <p className="text-xs text-muted-foreground mt-1">Revenue is only recognised as payments are collected.</p>
        )}
        {form.paymentStatus === 'advance' && (
          <p className="text-xs text-muted-foreground mt-1">
            {form.buyerId === WALK_IN ? 'Select a saved buyer to use advance credit.' : `Available advance credit: R${selectedBuyerBalance.toLocaleString()}`}
          </p>
        )}
      </div>
      {formError && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{formError}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">Track sales and revenue</p>
          <p className="text-sm text-primary font-semibold mt-1">Received Revenue: R{totalRevenue.toLocaleString()}</p>
          {pendingTotal > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">R{pendingTotal.toLocaleString()} outstanding across pending invoices</p>
          )}
        </div>
        <Can module="sales" action="create">
          <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button disabled={noHarvestsAvailable} title={noHarvestsAvailable ? 'No harvested chickens available. Please create a harvest record first.' : undefined}>
                <Plus className="h-4 w-4 mr-2" />Record Sale
              </Button>
            </DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={addSale}>Record Sale</Button></DialogContent>
          </Dialog>
        </Can>
      </div>

      {noHarvestsAvailable && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>No harvested chickens available. Please create a harvest record first.</span>
        </div>
      )}

      {canCreate && sellableHarvests.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-primary" /> Quick Sell</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={quickHarvestId} onValueChange={setQuickHarvestId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select harvest" /></SelectTrigger>
              <SelectContent>
                {sellableHarvests.map(h => {
                  const remaining = remainingHarvestStock(h, sales);
                  const bn = batches.find(b => b.id === h.batchId)?.name ?? 'Unknown';
                  return <SelectItem key={h.id} value={h.id}>{harvestRef(h)} · {bn} · {remaining} left</SelectItem>;
                })}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => quickSell(5)} disabled={!quickHarvestId || quickRemaining < 5}>Sell 5</Button>
            <Button size="sm" variant="outline" onClick={() => quickSell(10)} disabled={!quickHarvestId || quickRemaining < 10}>Sell 10</Button>
            <Button size="sm" variant="outline" onClick={() => quickSell(20)} disabled={!quickHarvestId || quickRemaining < 20}>Sell 20</Button>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
        <DialogContent><DialogHeader><DialogTitle>Edit Sale</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={saveEdit}>Save Changes</Button></DialogContent>
      </Dialog>

      <Dialog open={newBuyerOpen} onOpenChange={setNewBuyerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Buyer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={newBuyer.name} onChange={e => setNewBuyer(v => ({ ...v, name: e.target.value }))} placeholder="Customer name" /></div>
            <div><Label>Phone</Label><Input value={newBuyer.phone} onChange={e => setNewBuyer(v => ({ ...v, phone: e.target.value }))} placeholder="+27..." /></div>
            <Button className="w-full" onClick={saveNewBuyer} disabled={!newBuyer.name.trim()}>Save Buyer</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure you want to delete this record?</AlertDialogTitle><AlertDialogDescription>The sold birds will be added back to the batch count and any advance credit will be refunded.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DataFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search buyer…"
        selects={[{ key: 'batch', label: 'Batch', options: batches.map(b => ({ value: b.id, label: b.name })) }]}
        totalCount={sales.length}
        resultCount={filteredSales.length}
      />

      {canExport && sales.length > 0 && (
        <div className="flex justify-end">
          <ExportButtons
            filename="sales"
            title="Sales Report"
            rows={sortedSales}
            columns={[
              { header: 'Date', value: r => r.date },
              { header: 'Invoice', value: r => r.invoiceNumber || '—' },
              { header: 'Batch', value: r => getBatchName(r.batchId) },
              { header: 'Qty', value: r => r.quantity },
              { header: 'Price/Bird', value: r => r.pricePerUnit },
              { header: 'Total', value: r => saleTotal(r) },
              { header: 'Buyer', value: r => r.buyer },
              { header: 'Phone', value: r => r.buyerPhone || '—' },
              { header: 'Status', value: r => saleStatusLabel(r) },
              { header: 'Collected', value: r => (isPendingSale(r) ? collectedForSale(r.id, collections) : saleTotal(r)) },
            ]}
          />
        </div>
      )}

      {sales.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center"><ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" /><p className="text-muted-foreground">No sales recorded yet.</p></div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow><SortHead k="date" label="Date" /><SortHead k="batch" label="Batch" /><SortHead k="quantity" label="Qty" /><TableHead>Price/Bird</TableHead><SortHead k="total" label="Total" /><SortHead k="buyer" label="Buyer" /><SortHead k="status" label="Status" /><TableHead className="w-28"></TableHead></TableRow></TableHeader>
            <TableBody>
              {pageSales.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No sales match your filters.</TableCell></TableRow>
              )}
              {pageSales.map(r => {
                const pending = isPendingSale(r);
                const collected = pending ? collectedForSale(r.id, collections) : saleTotal(r);
                const outstanding = pending ? outstandingForSale(r, collections) : 0;
                const fullyPaid = !pending || outstanding === 0;
                const isAdvance = r.paymentStatus === 'advance';
                return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                  <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{getBatchName(r.batchId)}</TableCell>
                  <TableCell>{r.quantity}</TableCell>
                  <TableCell>R{r.pricePerUnit.toLocaleString()}</TableCell>
                  <TableCell className="font-semibold text-primary">R{(r.quantity * r.pricePerUnit).toLocaleString()}</TableCell>
                  <TableCell>{r.buyer}{r.invoiceNumber ? <div className="text-[10px] text-muted-foreground">{r.invoiceNumber}</div> : null}</TableCell>
                  <TableCell>
                    {isAdvance ? (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30 text-xs"><Wallet className="h-3 w-3 mr-1" />Advance</Badge>
                    ) : fullyPaid ? (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        R{collected.toLocaleString()} / R{saleTotal(r).toLocaleString()}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {r.buyerPhone && (
                        <a href={generateWhatsAppLink(r, getBatchName(r.batchId), r.buyerPhone)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/50 hover:text-green-600 transition-colors" title="Send WhatsApp Receipt">
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                      {canEdit && (
                        <button onClick={() => startEdit(r)} title="Edit sale" className="text-muted-foreground/50 hover:text-primary transition-colors"><Pencil className="h-4 w-4" /></button>
                      )}
                      {canDelete && (
                        <button onClick={() => setDeleteId(r.id)} title="Delete sale" className="text-muted-foreground/50 hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm">
            <span className="text-muted-foreground">
              Showing {pageSales.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{(currentPage - 1) * PAGE_SIZE + pageSales.length} of {sortedSales.length}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setTable({ page: Math.max(1, currentPage - 1) })}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-muted-foreground">Page {currentPage} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setTable({ page: Math.min(totalPages, currentPage + 1) })}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <SaleDetailDialog sale={detail} onOpenChange={o => { if (!o) setDetail(null); }} />
    </div>
  );
}
