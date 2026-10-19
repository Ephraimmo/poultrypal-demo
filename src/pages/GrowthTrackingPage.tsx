import { useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { WeightRecord } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, TrendingUp, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';

function getAgeDisplay(startDate: string): string {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  if (weeks === 0) return `${totalDays} day${totalDays !== 1 ? 's' : ''}`;
  if (days === 0) return `Week ${weeks}`;
  return `Week ${weeks} + ${days} day${days !== 1 ? 's' : ''}`;
}

export default function GrowthTrackingPage() {
  const { batches, weightRecords, setWeightRecords } = useFarm();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useFilterState('growth');
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ batchId: '', weightGrams: '', notes: '', date: new Date().toISOString().split('T')[0] });

  const resetForm = () => setForm({ batchId: '', weightGrams: '', notes: '', date: new Date().toISOString().split('T')[0] });
  const activeBatches = batches.filter(b => b.status === 'active');
  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name || 'Unknown';
  const getBatch = (id: string) => batches.find(b => b.id === id);

  const addRecord = () => {
    if (!form.batchId || !form.weightGrams) return;
    const record: WeightRecord = {
      id: crypto.randomUUID(),
      batchId: form.batchId,
      date: form.date,
      weightGrams: parseFloat(form.weightGrams),
      notes: form.notes,
    };
    setWeightRecords(prev => [...prev, record]);
    resetForm();
    setOpen(false);
  };

  const startEdit = (r: WeightRecord) => {
    setEditId(r.id);
    setForm({ batchId: r.batchId, weightGrams: String(r.weightGrams), notes: r.notes, date: r.date });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editId || !form.weightGrams) return;
    setWeightRecords(prev => prev.map(r => r.id !== editId ? r : {
      ...r, weightGrams: parseFloat(form.weightGrams), notes: form.notes, date: form.date,
    }));
    resetForm();
    setEditId(null);
    setEditOpen(false);
  };

  const formFields = (
    <div className="space-y-4 pt-2">
      <div>
        <Label>Batch</Label>
        <Select value={form.batchId} onValueChange={v => setForm(f => ({ ...f, batchId: v }))}>
          <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
          <SelectContent>{activeBatches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
      <div><Label>Weight (grams)</Label><Input type="number" placeholder="250" value={form.weightGrams} onChange={e => setForm(f => ({ ...f, weightGrams: e.target.value }))} /></div>
      <div><Label>Notes</Label><Input placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Track batch age and chicken weight over time</p>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Record Weight</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Weight</DialogTitle></DialogHeader>
            {formFields}
            <Button className="w-full" onClick={addRecord}>Record Weight</Button>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Weight Record</DialogTitle></DialogHeader>
          {formFields}
          <Button className="w-full" onClick={saveEdit}>Save Changes</Button>
        </DialogContent>
      </Dialog>

      {/* Batch Age Cards */}
      {activeBatches.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeBatches.map(b => {
            const latestWeight = [...weightRecords].filter(w => w.batchId === b.id).sort((a, c) => new Date(c.date).getTime() - new Date(a.date).getTime())[0];
            return (
              <div key={b.id} className="bg-card rounded-xl border border-border p-4">
                <h4 className="font-semibold">{b.name}</h4>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Age</span>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{getAgeDisplay(b.startDate)}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latest Weight</span>
                    <span className="font-medium">{latestWeight ? `${latestWeight.weightGrams}g` : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Count</span>
                    <span className="font-medium">{b.currentCount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DataFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search notes…"
        selects={[
          { key: 'batch', label: 'Batch', options: batches.map(b => ({ value: b.id, label: b.name })) },
        ]}
        totalCount={weightRecords.length}
        resultCount={applyDataFilter(weightRecords, filter, {
          dateField: r => r.date,
          searchFields: r => [r.notes],
          selectFields: { batch: r => r.batchId },
        }).length}
      />

      {/* Weight Records Table */}
      {weightRecords.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No weight records yet. Start tracking chicken growth.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Weight (g)</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...applyDataFilter(weightRecords, filter, {
                dateField: r => r.date,
                searchFields: r => [r.notes],
                selectFields: { batch: r => r.batchId },
              })].reverse().map(r => {
                const batch = getBatch(r.batchId);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{getBatchName(r.batchId)}</TableCell>
                    <TableCell>{batch ? getAgeDisplay(batch.startDate) : '—'}</TableCell>
                    <TableCell className="font-semibold">{r.weightGrams}g</TableCell>
                    <TableCell className="text-muted-foreground">{r.notes || '—'}</TableCell>
                    <TableCell><button onClick={() => startEdit(r)} className="text-muted-foreground/50 hover:text-primary transition-colors"><Pencil className="h-4 w-4" /></button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
