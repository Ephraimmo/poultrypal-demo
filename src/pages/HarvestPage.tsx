import { useMemo, useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import { useAuth } from '@/contexts/AuthContext';
import type { HarvestRecord } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Wheat, AlertTriangle, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import ExportButtons from '@/components/ExportButtons';
import HarvestDetailDialog from '@/components/HarvestDetailDialog';
import { useUrlTableState } from '@/hooks/useUrlTableState';
import {
  availableForHarvest,
  harvestedForBatch,
  harvestRef,
  harvestStatus,
  harvestStatusLabel,
  liveBirdsRemaining,
  mortalityForBatch,
  remainingHarvestStock,
  soldForBatch,
  soldFromHarvest,
} from '@/lib/harvest';

const today = () => new Date().toISOString().split('T')[0];

interface FormState {
  batchId: string;
  date: string;
  quantity: string;
  averageWeightKg: string;
  totalWeightKg: string;
  notes: string;
}

const emptyForm: FormState = {
  batchId: '',
  date: today(),
  quantity: '',
  averageWeightKg: '',
  totalWeightKg: '',
  notes: '',
};

type SortKey = 'date' | 'batch' | 'quantity' | 'sold' | 'remaining' | 'status';
const PAGE_SIZE = 10;

export default function HarvestPage() {
  const { batches, harvests, setHarvests, sales, mortality } = useFarm();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<HarvestRecord | null>(null);
  const [table, setTable] = useUrlTableState('h', { q: '', status: 'all', sort: 'date', dir: 'desc', page: 1 });
  const search = table.q;
  const statusFilter = table.status as 'all' | 'available' | 'partially_sold' | 'sold_out';
  const sortKey = table.sort as SortKey;
  const sortDir = table.dir as 'asc' | 'desc';
  const page = table.page;

  // Only active batches are harvestable / shown in inventory — closed batches are hidden.
  const activeBatches = useMemo(() => batches.filter(b => b.status === 'active'), [batches]);

  const selectedBatch = batches.find(b => b.id === form.batchId);
  const editing = editId ? harvests.find(h => h.id === editId) : null;

  const availableForSelected = useMemo(() => {
    if (!selectedBatch) return 0;
    // When editing, allow the record's own quantity back in the pool
    const otherHarvests = editing ? harvests.filter(h => h.id !== editing.id) : harvests;
    return availableForHarvest(selectedBatch, mortality, otherHarvests);
  }, [selectedBatch, mortality, harvests, editing]);

  const resetForm = () => { setForm(emptyForm); setError(''); setEditId(null); };

  // Auto-calculate total weight when average weight changes
  const onAvgWeightChange = (v: string) => {
    setForm(f => {
      const qty = parseInt(f.quantity);
      const avg = parseFloat(v);
      const total = Number.isFinite(qty) && Number.isFinite(avg) ? (qty * avg).toFixed(2) : f.totalWeightKg;
      return { ...f, averageWeightKg: v, totalWeightKg: total };
    });
  };
  const onQuantityChange = (v: string) => {
    setForm(f => {
      const qty = parseInt(v);
      const avg = parseFloat(f.averageWeightKg);
      const total = Number.isFinite(qty) && Number.isFinite(avg) ? (qty * avg).toFixed(2) : f.totalWeightKg;
      return { ...f, quantity: v, totalWeightKg: total };
    });
  };

  const save = () => {
    setError('');
    if (!form.batchId) { setError('Please select a batch.'); return; }
    const qty = parseInt(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) { setError('Enter a valid harvest quantity.'); return; }
    if (qty > availableForSelected) {
      setError(`Only ${availableForSelected} live birds available for harvest in this batch.`);
      return;
    }

    const avg = form.averageWeightKg ? parseFloat(form.averageWeightKg) : undefined;
    const total = form.totalWeightKg ? parseFloat(form.totalWeightKg) : (avg ? qty * avg : undefined);

    if (editId) {
      setHarvests(prev => prev.map(h => h.id !== editId ? h : {
        ...h,
        batchId: form.batchId,
        date: form.date,
        quantity: qty,
        averageWeightKg: avg,
        totalWeightKg: total,
        notes: form.notes.trim() || undefined,
      }));
      toast.success('Harvest updated');
    } else {
      const record: HarvestRecord = {
        id: crypto.randomUUID(),
        batchId: form.batchId,
        date: form.date,
        quantity: qty,
        averageWeightKg: avg,
        totalWeightKg: total,
        notes: form.notes.trim() || undefined,
        createdBy: user?.email ?? undefined,
        createdAt: new Date().toISOString(),
      };
      setHarvests(prev => [...prev, record]);
      toast.success(`Harvested ${qty} chickens · ${harvestRef(record)}`);
    }
    setOpen(false);
    resetForm();
  };

  const startEdit = (h: HarvestRecord) => {
    const sold = soldFromHarvest(h.id, sales);
    if (sold > 0) {
      toast.error('Cannot edit — this harvest already has recorded sales. Delete the sales first.');
      return;
    }
    setEditId(h.id);
    setForm({
      batchId: h.batchId,
      date: h.date,
      quantity: String(h.quantity),
      averageWeightKg: h.averageWeightKg != null ? String(h.averageWeightKg) : '',
      totalWeightKg: h.totalWeightKg != null ? String(h.totalWeightKg) : '',
      notes: h.notes ?? '',
    });
    setError('');
    setOpen(true);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const sold = soldFromHarvest(deleteId, sales);
    if (sold > 0) {
      toast.error('Cannot delete — this harvest has linked sales. Delete the sales first.');
      setDeleteId(null);
      return;
    }
    setHarvests(prev => prev.filter(h => h.id !== deleteId));
    toast.success('Harvest deleted');
    setDeleteId(null);
  };

  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name ?? 'Unknown';

  // Batch inventory summary
  const batchSummaries = useMemo(() => activeBatches.map(b => {
    const mort = mortalityForBatch(b.id, mortality);
    const harv = harvestedForBatch(b.id, harvests);
    const sold = soldForBatch(b.id, sales);
    const live = liveBirdsRemaining(b, mortality, harvests);
    const stockRemain = harv - sold;
    return { batch: b, mort, harv, sold, live, stockRemain: Math.max(0, stockRemain) };
  }), [activeBatches, mortality, harvests, sales]);

  // Search → filter → sort
  const processedHarvests = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = harvests.map(h => ({
      h,
      batchName: getBatchName(h.batchId),
      sold: soldFromHarvest(h.id, sales),
      remaining: remainingHarvestStock(h, sales),
      status: harvestStatus(h, sales),
    }));
    if (q) {
      rows = rows.filter(r =>
        r.batchName.toLowerCase().includes(q) ||
        harvestRef(r.h).toLowerCase().includes(q) ||
        r.h.date.includes(q) ||
        new Date(r.h.date).toLocaleDateString().toLowerCase().includes(q) ||
        (r.h.notes ?? '').toLowerCase().includes(q) ||
        (r.h.createdBy ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'batch': return a.batchName.localeCompare(b.batchName) * dir;
        case 'quantity': return (a.h.quantity - b.h.quantity) * dir;
        case 'sold': return (a.sold - b.sold) * dir;
        case 'remaining': return (a.remaining - b.remaining) * dir;
        case 'status': return a.status.localeCompare(b.status) * dir;
        default: return (a.h.date + a.h.id).localeCompare(b.h.date + b.h.id) * dir;
      }
    });
    return rows;
  }, [harvests, sales, batches, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processedHarvests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = processedHarvests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setTable({ dir: sortDir === 'asc' ? 'desc' : 'asc', page: 1 });
    else setTable({ sort: key, dir: key === 'batch' || key === 'status' ? 'asc' : 'desc', page: 1 });
  };

  const SortHead = ({ k, label, align }: { k: SortKey; label: string; align?: boolean }) => (
    <TableHead className={align ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === k ? 'text-foreground font-semibold' : ''}`}
      >
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  const totalReady = harvests.reduce((s, h) => s + remainingHarvestStock(h, sales), 0);
  const totalHarvestedAllTime = harvests.reduce((s, h) => s + h.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-muted-foreground">Mark birds as ready for sale. Sales can only be recorded from a harvest.</p>
          <p className="text-sm text-primary font-semibold mt-1">
            {totalReady.toLocaleString()} birds ready for sale · {totalHarvestedAllTime.toLocaleString()} harvested all-time
          </p>
        </div>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button disabled={activeBatches.length === 0}>
              <Plus className="h-4 w-4 mr-2" />New Harvest
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? 'Edit Harvest' : 'New Harvest'}</DialogTitle>
              <DialogDescription>
                Only live (non-mortality, non-harvested) birds are available. Once created, sales can be recorded against this harvest.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Batch</Label>
                <Select value={form.batchId} onValueChange={v => setForm(f => ({ ...f, batchId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                  <SelectContent>
                    {activeBatches.map(b => {
                      const avail = availableForHarvest(b, mortality, editing ? harvests.filter(h => h.id !== editing.id) : harvests);
                      return (
                        <SelectItem key={b.id} value={b.id} disabled={avail <= 0}>
                          {b.name} · {avail} live available
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedBatch && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Max harvest: <span className="font-semibold text-foreground">{availableForSelected}</span> birds
                  </p>
                )}
              </div>
              <div><Label>Harvest Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Chickens Ready</Label><Input type="number" min="1" value={form.quantity} onChange={e => onQuantityChange(e.target.value)} placeholder="0" /></div>
                <div>
                  <Label>Avg Weight (kg)</Label>
                  <Input type="number" step="0.01" min="0" value={form.averageWeightKg} onChange={e => onAvgWeightChange(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div>
                <Label>Total Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.totalWeightKg}
                  onChange={e => setForm(f => ({ ...f, totalWeightKg: e.target.value }))}
                  placeholder="Auto-calculates from qty × avg weight"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes about this harvest" rows={2} />
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}
              <Button className="w-full" onClick={save}>{editId ? 'Save Changes' : 'Save Harvest'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {activeBatches.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Create a batch first before harvesting.</p>
        </div>
      )}

      {batchSummaries.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Batch Inventory</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Initial</TableHead>
                  <TableHead className="text-right">Mortality</TableHead>
                  <TableHead className="text-right">Harvested</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Live Remaining</TableHead>
                  <TableHead className="text-right">Harvest Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchSummaries.map(s => (
                  <TableRow key={s.batch.id}>
                    <TableCell className="font-medium">{s.batch.name}</TableCell>
                    <TableCell className="text-right">{s.batch.initialCount}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{s.mort}</TableCell>
                    <TableCell className="text-right">{s.harv}</TableCell>
                    <TableCell className="text-right">{s.sold}</TableCell>
                    <TableCell className="text-right font-semibold">{s.live}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{s.stockRemain}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {harvests.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Wheat className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No harvests recorded yet.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search batch, harvest ID, date, notes…"
                value={search}
                onChange={e => setTable({ q: e.target.value, page: 1 })}
              />
            </div>
            <Select value={statusFilter} onValueChange={v => setTable({ status: v, page: 1 })}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="partially_sold">Partially Sold</SelectItem>
                <SelectItem value="sold_out">Sold Out</SelectItem>
              </SelectContent>
            </Select>
            <ExportButtons
              filename="harvests"
              title="Harvest Report"
              rows={processedHarvests}
              columns={[
                { header: 'Harvest ID', value: r => harvestRef(r.h) },
                { header: 'Date', value: r => r.h.date },
                { header: 'Batch', value: r => r.batchName },
                { header: 'Qty', value: r => r.h.quantity },
                { header: 'Sold', value: r => r.sold },
                { header: 'Remaining', value: r => r.remaining },
                { header: 'Avg Wt (kg)', value: r => r.h.averageWeightKg ?? '' },
                { header: 'Total Wt (kg)', value: r => r.h.totalWeightKg ?? '' },
                { header: 'Status', value: r => harvestStatusLabel(r.status) },
                { header: 'Created By', value: r => r.h.createdBy ?? '' },
                { header: 'Notes', value: r => r.h.notes ?? '' },
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Harvest ID</TableHead>
                  <SortHead k="date" label="Date" />
                  <SortHead k="batch" label="Batch" />
                  <SortHead k="quantity" label="Qty" align />
                  <SortHead k="sold" label="Sold" align />
                  <SortHead k="remaining" label="Remaining" align />
                  <TableHead>Avg Wt (kg)</TableHead>
                  <SortHead k="status" label="Status" />
                  <TableHead>Created By</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">No harvests match your search.</TableCell>
                  </TableRow>
                )}
                {pageRows.map(({ h, sold, remaining, status, batchName }) => {
                  const badgeClass =
                    status === 'available'
                      ? 'bg-green-500/15 text-green-700 border-green-500/40'
                      : status === 'partially_sold'
                        ? 'bg-amber-500/15 text-amber-700 border-amber-500/40'
                        : 'bg-red-500/15 text-red-700 border-red-500/40';
                  return (
                    <TableRow key={h.id} className="cursor-pointer" onClick={() => setDetail(h)}>
                      <TableCell className="font-mono text-xs">{harvestRef(h)}</TableCell>
                      <TableCell>{new Date(h.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{batchName}</TableCell>
                      <TableCell className="text-right">{h.quantity}</TableCell>
                      <TableCell className="text-right">{sold}</TableCell>
                      <TableCell className="text-right font-semibold">{remaining}</TableCell>
                      <TableCell>{h.averageWeightKg ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badgeClass}>{harvestStatusLabel(status)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.createdBy ?? '—'}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => startEdit(h)} disabled={sold > 0} title={sold > 0 ? 'Has linked sales' : 'Edit'}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(h.id)} disabled={sold > 0} title={sold > 0 ? 'Has linked sales' : 'Delete'}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm">
            <span className="text-muted-foreground">
              Showing {pageRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{(currentPage - 1) * PAGE_SIZE + pageRows.length} of {processedHarvests.length}
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

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this harvest?</AlertDialogTitle>
            <AlertDialogDescription>
              The harvested birds will be returned to the batch's live count. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HarvestDetailDialog harvest={detail} onOpenChange={o => { if (!o) setDetail(null); }} />
    </div>
  );
}