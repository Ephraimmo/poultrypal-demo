import { useState, useMemo, useEffect, useRef } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { MortalityRecord } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Skull, Pencil, Trash2, Calculator, AlertTriangle, Package, Wheat, Heart, DollarSign, RotateCcw } from 'lucide-react';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';
import MortalityResellDialog from '@/components/MortalityResellDialog';
import { useCan } from '@/contexts/PermissionsContext';
import { Can } from '@/components/Can';
import { useFlockScope } from '@/hooks/useFlockScope';

const DEFAULT_CAUSES = ['Disease', 'Heat Stress', 'Predator', 'Injury', 'Unknown'];

type Breakdown = {
  purchase: number;
  feed: number;
  healthcare: number;
  other: number;
  total: number;
  livingCount: number;
  costPerBird: number;
  error?: string;
};

export default function MortalityPage() {
  const {
    batches: allBatches,
    setBatches,
    mortality: allMortality,
    setMortality,
    mortalityResells: allResells,
    feed: allFeed,
    expenses: allExpenses,
  } = useFarm();
  const { scope } = useFlockScope();
  const canCreate = useCan('mortality', 'create');
  const canEdit = useCan('mortality', 'edit');
  const canDelete = useCan('mortality', 'delete');

  // Flock-based scoping: non-admins only see records for their assigned flocks,
  // across the batch selector, summary cards, cost breakdowns and the table.
  const batches = useMemo(() => scope(allBatches, b => b.id), [allBatches, scope]);
  const mortality = useMemo(() => scope(allMortality, m => m.batchId), [allMortality, scope]);
  const mortalityResells = useMemo(() => scope(allResells, r => r.batchId), [allResells, scope]);
  const feed = useMemo(() => scope(allFeed, f => f.batchId), [allFeed, scope]);
  const expenses = useMemo(() => scope(allExpenses, e => e.batchId), [allExpenses, scope]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useFilterState('mortality');
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [selectedBreakdownRecord, setSelectedBreakdownRecord] = useState<MortalityRecord | null>(null);
  const [resellRecord, setResellRecord] = useState<MortalityRecord | null>(null);
  const [customCauses, setCustomCauses] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mortality-custom-causes') || '[]'); } catch { return []; }
  });
  const [addingCustomCause, setAddingCustomCause] = useState(false);
  const [newCause, setNewCause] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ batchId: '', count: '', cause: '', date: new Date().toISOString().split('T')[0], lockCost: true });
  const backfilledRef = useRef(false);

  const allCauses = useMemo(() => [...DEFAULT_CAUSES, ...customCauses], [customCauses]);

  const resetForm = () => { setForm({ batchId: '', count: '', cause: '', date: new Date().toISOString().split('T')[0], lockCost: true }); setFormError(''); setAddingCustomCause(false); setNewCause(''); };

  // Compute cost per bird as of a specific event date (locked to that point in time)
  const computeBreakdown = (batchId: string, asOfDate?: string): Breakdown => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return { purchase: 0, feed: 0, healthcare: 0, other: 0, total: 0, livingCount: 0, costPerBird: 0, error: 'Batch not found' };
    const cutoff = asOfDate ? new Date(asOfDate + 'T23:59:59') : null;
    const inRange = (d: string) => !cutoff || new Date(d) <= cutoff;

    const purchase = batch.initialCount * (batch.purchaseCostPerChick || 0);
    const feedCost = feed.filter(f => f.batchId === batchId && inRange(f.date)).reduce((s, f) => s + f.bags * f.costPerBag, 0);
    const batchExp = expenses.filter(e => e.batchId === batchId && inRange(e.date));
    const healthcare = batchExp.filter(e => e.category === 'healthcare').reduce((s, e) => s + e.amount, 0);
    const other = batchExp.filter(e => e.category !== 'healthcare').reduce((s, e) => s + e.amount, 0);
    const total = purchase + feedCost + healthcare + other;

    // Living count as-of date = initialCount minus mortality recorded before/on date
    const priorDeaths = mortality
      .filter(m => m.batchId === batchId && (!cutoff || new Date(m.date) < cutoff))
      .reduce((s, m) => s + m.count, 0);
    const livingCount = Math.max(0, batch.initialCount - priorDeaths);

    if (livingCount <= 0) {
      return { purchase, feed: feedCost, healthcare, other, total, livingCount, costPerBird: 0, error: 'No living birds remain — cost per bird cannot be calculated.' };
    }
    if (total <= 0) {
      return { purchase, feed: feedCost, healthcare, other, total, livingCount, costPerBird: 0, error: 'No costs recorded yet — cost per bird is zero.' };
    }
    return { purchase, feed: feedCost, healthcare, other, total, livingCount, costPerBird: total / livingCount };
  };

  const previewBreakdown = useMemo(() => form.batchId ? computeBreakdown(form.batchId, form.lockCost ? form.date : undefined) : null, [form.batchId, form.date, form.lockCost, batches, feed, expenses, mortality]);
  const previewCount = parseInt(form.count) || 0;
  const previewTotal = (previewBreakdown?.costPerBird || 0) * previewCount;

  // Backfill older records lacking costPerBird/totalCost — run once after data load
  useEffect(() => {
    if (backfilledRef.current) return;
    if (batches.length === 0 && mortality.length === 0) return;
    const needsBackfill = mortality.some(r => r.costPerBird == null || r.totalCost == null);
    if (!needsBackfill) { backfilledRef.current = true; return; }
    backfilledRef.current = true;
    setMortality(prev => prev.map(r => {
      if (r.costPerBird != null && r.totalCost != null) return r;
      const bd = computeBreakdown(r.batchId, r.date);
      const cpb = r.costPerBird ?? bd.costPerBird;
      const tc = r.totalCost ?? cpb * r.count;
      return { ...r, costPerBird: cpb, totalCost: tc };
    }));
  }, [batches.length, mortality.length]);

  const persistCustomCauses = (next: string[]) => {
    setCustomCauses(next);
    try { localStorage.setItem('mortality-custom-causes', JSON.stringify(next)); } catch { /* ignore */ }
  };

  const handleAddCustomCause = () => {
    const trimmed = newCause.trim();
    if (!trimmed) return;
    if (!allCauses.includes(trimmed)) persistCustomCauses([...customCauses, trimmed]);
    setForm(f => ({ ...f, cause: trimmed }));
    setNewCause(''); setAddingCustomCause(false);
  };

  const validate = (): string => {
    if (!form.batchId) return 'Please select a batch.';
    const count = parseInt(form.count);
    if (!form.count || isNaN(count)) return 'Please enter the number of deaths.';
    if (count < 1) return 'Death count must be at least 1 (cannot be negative or zero).';
    if (!form.cause.trim()) return 'Cause is required.';
    if (!form.date) return 'Date is required.';
    return '';
  };

  const addMortality = () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    const count = parseInt(form.count);
    const bd = computeBreakdown(form.batchId, form.lockCost ? form.date : undefined);
    if (bd.error && bd.livingCount <= 0) { setFormError(bd.error); return; }
    const costPerBird = bd.costPerBird;
    const totalCost = costPerBird * count;
    const record: MortalityRecord = {
      id: crypto.randomUUID(),
      batchId: form.batchId,
      batchName: batches.find(b => b.id === form.batchId)?.name,
      date: form.date,
      count,
      cause: form.cause.trim(),
      costPerBird,
      totalCost,
    };
    setMortality(prev => [...prev, record]);
    setBatches(prev => prev.map(b => b.id === form.batchId ? { ...b, currentCount: Math.max(0, b.currentCount - count) } : b));
    resetForm(); setOpen(false);
  };

  const startEdit = (r: MortalityRecord) => { setEditId(r.id); setForm({ batchId: r.batchId, count: String(r.count), cause: r.cause, date: r.date, lockCost: true }); setEditOpen(true); setFormError(''); };

  const saveEdit = () => {
    if (!editId) return;
    const err = validate();
    if (err) { setFormError(err); return; }
    const oldRecord = mortality.find(r => r.id === editId);
    if (!oldRecord) return;
    const newCount = parseInt(form.count);
    const countDiff = newCount - oldRecord.count;
    // Preserve original locked cost per bird; recompute total based on new count
    const costPerBird = oldRecord.costPerBird ?? computeBreakdown(oldRecord.batchId, oldRecord.date).costPerBird;
    const totalCost = costPerBird * newCount;
    setMortality(prev => prev.map(r => r.id !== editId ? r : { ...r, count: newCount, cause: form.cause.trim(), date: form.date, costPerBird, totalCost }));
    if (countDiff !== 0) setBatches(prev => prev.map(b => b.id === oldRecord.batchId ? { ...b, currentCount: Math.max(0, b.currentCount - countDiff) } : b));
    resetForm(); setEditId(null); setEditOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const record = mortality.find(r => r.id === deleteId);
    if (record) {
      setBatches(prev => prev.map(b => b.id === record.batchId ? { ...b, currentCount: b.currentCount + record.count } : b));
    }
    setMortality(prev => prev.filter(r => r.id !== deleteId));
    setDeleteId(null);
  };

  const activeBatches = batches.filter(b => b.status === 'active');
  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name || 'Unknown';

  const formFields = (
    <div className="space-y-3 pt-1">
      <div>
        <Label>Batch <span className="text-destructive">*</span></Label>
        <Select value={form.batchId} onValueChange={v => setForm(f => ({ ...f, batchId: v }))}>
          <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
          <SelectContent>{activeBatches.map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({b.currentCount} birds)</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Date <span className="text-destructive">*</span></Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
        <div><Label>Deaths <span className="text-destructive">*</span></Label><Input type="number" min={1} placeholder="0" value={form.count} onChange={e => setForm(f => ({ ...f, count: e.target.value.replace('-', '') }))} /></div>
      </div>
      <div>
        <Label>Cause <span className="text-destructive">*</span></Label>
        {addingCustomCause ? (
          <div className="flex gap-2">
            <Input autoFocus placeholder="e.g. Cold stress" value={newCause} onChange={e => setNewCause(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomCause(); } }} />
            <Button type="button" size="sm" onClick={handleAddCustomCause}>Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setAddingCustomCause(false); setNewCause(''); }}>Cancel</Button>
          </div>
        ) : (
          <Select value={form.cause} onValueChange={v => { if (v === '__add__') setAddingCustomCause(true); else setForm(f => ({ ...f, cause: v })); }}>
            <SelectTrigger><SelectValue placeholder="Select cause" /></SelectTrigger>
            <SelectContent>
              {allCauses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              <SelectItem value="__add__"><span className="flex items-center gap-1 text-primary"><Plus className="h-3.5 w-3.5" /> Add custom cause…</span></SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" checked={form.lockCost} onChange={e => setForm(f => ({ ...f, lockCost: e.target.checked }))} className="h-4 w-4 rounded border-border" />
        <span>Lock cost per bird to event date (recommended)</span>
      </label>

      {form.batchId && previewBreakdown && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
          {previewBreakdown.error ? (
            <div className="flex items-start gap-2 text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{previewBreakdown.error}</span></div>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Cost per bird {form.lockCost ? '(locked)' : '(live)'}</span><span className="font-semibold tabular-nums">R{previewBreakdown.costPerBird.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estimated loss ({previewCount} × R{previewBreakdown.costPerBird.toFixed(2)})</span><span className="font-bold text-destructive tabular-nums">R{previewTotal.toFixed(2)}</span></div>
              <Button type="button" variant="ghost" size="sm" className="w-full mt-1 h-7 text-xs" onClick={() => { setSelectedBreakdownRecord(null); setBreakdownOpen(true); }}><Calculator className="h-3.5 w-3.5 mr-1" />View cost breakdown</Button>
            </>
          )}
        </div>
      )}

      {formError && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{formError}</span>
        </div>
      )}
    </div>
  );

  // Batch scope selector for summary + table isolation
  const [scopeBatchId, setScopeBatchId] = useState<string>('__all__');
  const isScoped = scopeBatchId !== '__all__';
  const inScope = <T extends { batchId: string }>(r: T) => !isScoped || r.batchId === scopeBatchId;

  // Resell aggregates (scoped)
  const resoldByMortality = useMemo(() => {
    const m = new Map<string, { qty: number; amount: number }>();
    for (const r of mortalityResells) {
      const cur = m.get(r.mortalityId) ?? { qty: 0, amount: 0 };
      m.set(r.mortalityId, { qty: cur.qty + r.quantity, amount: cur.amount + r.totalAmount });
    }
    return m;
  }, [mortalityResells]);

  const scopedMortality = mortality.filter(inScope);
  const scopedResells = mortalityResells.filter(inScope);
  const totalDead = scopedMortality.reduce((s, m) => s + m.count, 0);
  const totalResold = scopedResells.reduce((s, r) => s + r.quantity, 0);
  const totalRecovered = scopedResells.reduce((s, r) => s + r.totalAmount, 0);
  const totalMortalityCost = scopedMortality.reduce((s, m) => s + (m.totalCost ?? 0), 0);
  const remainingLoss = Math.max(0, totalDead - totalResold);
  const netLoss = totalMortalityCost - totalRecovered;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-muted-foreground">Record and track daily mortality</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Batch:</span>
            <Select value={scopeBatchId} onValueChange={setScopeBatchId}>
              <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All batches</SelectItem>
                {batches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Can module="mortality" action="create">
            <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Record Mortality</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>Record Mortality</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={addMortality}>Record</Button></DialogContent>
            </Dialog>
          </Can>
        </div>
      </div>

      {isScoped && (
        <div className="text-xs bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-primary">
          Showing data <strong>only</strong> for <strong>{batches.find(b => b.id === scopeBatchId)?.name}</strong>. All costs, expenses and mortality below are isolated to this batch.
        </div>
      )}

      {/* Mortality + Resell summary (scoped) */}
      {scopedMortality.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-card rounded-xl border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Total Mortality</p>
            <p className="text-lg font-bold tabular-nums">{totalDead}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Resold</p>
            <p className="text-lg font-bold text-primary tabular-nums">{totalResold}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Remaining Loss</p>
            <p className="text-lg font-bold text-destructive tabular-nums">{remainingLoss}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Recovered</p>
            <p className="text-lg font-bold text-success tabular-nums">R{totalRecovered.toFixed(0)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 col-span-2 sm:col-span-1">
            <p className="text-[11px] text-muted-foreground">Net Loss</p>
            <p className={`text-lg font-bold tabular-nums ${netLoss <= 0 ? 'text-success' : 'text-destructive'}`}>R{netLoss.toFixed(0)}</p>
          </div>
        </div>
      )}


      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
        <DialogContent><DialogHeader><DialogTitle>Edit Mortality Record</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={saveEdit}>Save Changes</Button></DialogContent>
      </Dialog>

      {/* Cost breakdown dialog */}
      <Dialog open={breakdownOpen} onOpenChange={o => { setBreakdownOpen(o); if (!o) setSelectedBreakdownRecord(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cost Breakdown</DialogTitle></DialogHeader>
          {(() => {
            const r = selectedBreakdownRecord;
            const bd = r ? computeBreakdown(r.batchId, r.date) : previewBreakdown;
            const batchName = r ? getBatchName(r.batchId) : getBatchName(form.batchId);
            const asOf = r ? new Date(r.date).toLocaleDateString() : (form.lockCost ? new Date(form.date).toLocaleDateString() : 'today');
            if (!bd) return null;
            return (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">As of {asOf} for {batchName}.</p>
                <div className="border border-border rounded-lg divide-y divide-border text-sm overflow-hidden">
                  <div className="px-3 py-2 flex justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Package className="h-3.5 w-3.5" />Purchase</span><span className="font-medium tabular-nums">R{bd.purchase.toFixed(2)}</span></div>
                  <div className="px-3 py-2 flex justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Wheat className="h-3.5 w-3.5" />Feed</span><span className="font-medium tabular-nums">R{bd.feed.toFixed(2)}</span></div>
                  <div className="px-3 py-2 flex justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Heart className="h-3.5 w-3.5" />Healthcare</span><span className="font-medium tabular-nums">R{bd.healthcare.toFixed(2)}</span></div>
                  <div className="px-3 py-2 flex justify-between"><span className="flex items-center gap-2 text-muted-foreground"><DollarSign className="h-3.5 w-3.5" />Other</span><span className="font-medium tabular-nums">R{bd.other.toFixed(2)}</span></div>
                  <div className="px-3 py-2 flex justify-between bg-muted/40 font-bold"><span>Total Cost</span><span className="tabular-nums">R{bd.total.toFixed(2)}</span></div>
                  <div className="px-3 py-2 flex justify-between"><span className="text-muted-foreground">Living birds</span><span className="tabular-nums">{bd.livingCount}</span></div>
                  <div className="px-3 py-2 flex justify-between bg-primary/5"><span className="font-semibold">Cost per bird</span><span className="font-bold text-primary tabular-nums">R{bd.costPerBird.toFixed(2)}</span></div>
                </div>
                {r && (
                  <div className="px-3 py-2 flex justify-between text-sm bg-destructive/5 rounded-md">
                    <span className="font-medium text-destructive">Loss for {r.count} bird{r.count > 1 ? 's' : ''}</span>
                    <span className="font-bold text-destructive tabular-nums">R{r.totalCost?.toFixed(2) ?? '—'}</span>
                  </div>
                )}
                {bd.error && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{bd.error}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure you want to delete this record?</AlertDialogTitle><AlertDialogDescription>The bird count will be restored to the batch.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DataFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search cause…"
        selects={[
          { key: 'batch', label: 'Batch', options: batches.map(b => ({ value: b.id, label: b.name })) },
          { key: 'cause', label: 'Cause', options: allCauses.map(c => ({ value: c, label: c })) },
        ]}
        totalCount={scopedMortality.length}
        resultCount={applyDataFilter(scopedMortality, filter, {
          dateField: r => r.date,
          searchFields: r => [r.cause],
          selectFields: { batch: r => r.batchId, cause: r => r.cause },
        }).length}
      />

      {scopedMortality.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center"><Skull className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" /><p className="text-muted-foreground">No mortality records yet{isScoped ? ' for this batch' : ''}.</p></div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Batch</TableHead><TableHead className="text-right">Deaths</TableHead><TableHead className="text-right">Resold</TableHead><TableHead className="text-right">Recovered</TableHead><TableHead className="text-right">Net Loss</TableHead><TableHead>Cause</TableHead><TableHead className="w-40"></TableHead></TableRow></TableHeader>
            <TableBody>
              {[...applyDataFilter(scopedMortality, filter, {
                dateField: r => r.date,
                searchFields: r => [r.cause],
                selectFields: { batch: r => r.batchId, cause: r => r.cause },
              })].reverse().map(r => {
                const rs = resoldByMortality.get(r.id) ?? { qty: 0, amount: 0 };
                const remaining = Math.max(0, r.count - rs.qty);
                const grossLoss = r.totalCost ?? 0;
                const net = grossLoss - rs.amount;
                return (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{getBatchName(r.batchId)}</TableCell>
                    <TableCell className="text-right text-destructive font-semibold tabular-nums">{r.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="text-primary font-medium">{rs.qty}</span>
                      <span className="text-muted-foreground text-xs"> / {remaining} left</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success font-medium">{rs.amount > 0 ? `R${rs.amount.toFixed(2)}` : '—'}</TableCell>
                    <TableCell className={`text-right font-bold tabular-nums ${net <= 0 ? 'text-success' : 'text-destructive'}`}>{grossLoss > 0 ? `R${net.toFixed(2)}` : '—'}</TableCell>
                    <TableCell>{r.cause}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 items-center justify-end">
                        {canCreate && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={remaining === 0} onClick={() => setResellRecord(r)} title={remaining === 0 ? 'Fully resold' : 'Resell dead chickens'}>
                            <RotateCcw className="h-3 w-3 mr-1" />Resell
                          </Button>
                        )}
                        <button title="View cost breakdown" onClick={() => { setSelectedBreakdownRecord(r); setBreakdownOpen(true); }} className="text-muted-foreground/50 hover:text-primary transition-colors"><Calculator className="h-4 w-4" /></button>
                        {canEdit && (
                          <button onClick={() => startEdit(r)} className="text-muted-foreground/50 hover:text-primary transition-colors"><Pencil className="h-4 w-4" /></button>
                        )}
                        {canDelete && (
                          <button onClick={() => setDeleteId(r.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <MortalityResellDialog open={!!resellRecord} onOpenChange={o => { if (!o) setResellRecord(null); }} record={resellRecord} />
    </div>
  );
}
