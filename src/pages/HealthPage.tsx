import { useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { HealthRecord } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Heart, Pencil, Trash2 } from 'lucide-react';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';

export default function HealthPage() {
  const { batches, health, setHealth } = useFarm();
  const [filter, setFilter] = useFilterState('health');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ batchId: '', type: 'vaccination' as HealthRecord['type'], description: '', medication: '', notes: '', date: new Date().toISOString().split('T')[0] });

  const resetForm = () => setForm({ batchId: '', type: 'vaccination', description: '', medication: '', notes: '', date: new Date().toISOString().split('T')[0] });

  const addRecord = () => {
    if (!form.batchId || !form.description) return;
    const record: HealthRecord = {
      id: crypto.randomUUID(), batchId: form.batchId, date: form.date, type: form.type,
      description: form.description.trim(), medication: form.medication.trim(), notes: form.notes.trim(),
    };
    setHealth(prev => [...prev, record]);
    resetForm(); setOpen(false);
  };

  const startEdit = (r: HealthRecord) => {
    setEditId(r.id);
    setForm({ batchId: r.batchId, type: r.type, description: r.description, medication: r.medication, notes: r.notes, date: r.date });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editId || !form.description) return;
    setHealth(prev => prev.map(r => r.id !== editId ? r : { ...r, type: form.type, description: form.description.trim(), medication: form.medication.trim(), notes: form.notes.trim(), date: form.date }));
    resetForm(); setEditId(null); setEditOpen(false);
  };

  const confirmDelete = () => {
    if (deleteId) {
      setHealth(prev => prev.filter(r => r.id !== deleteId));
      setDeleteId(null);
    }
  };

  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name || 'Unknown';
  const activeBatches = batches.filter(b => b.status === 'active');
  const typeColor = (t: string) => t === 'vaccination' ? 'bg-primary/10 text-primary border-primary/20' : t === 'disease' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-secondary/10 text-secondary border-secondary/20';

  const formFields = (
    <div className="space-y-4 pt-2">
      <div><Label>Batch</Label>
        <Select value={form.batchId} onValueChange={v => setForm(f => ({ ...f, batchId: v }))}>
          <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
          <SelectContent>{activeBatches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Type</Label>
        <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as HealthRecord['type'] }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vaccination">Vaccination</SelectItem>
            <SelectItem value="disease">Disease</SelectItem>
            <SelectItem value="treatment">Treatment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
      <div><Label>Description</Label><Input placeholder="e.g. Newcastle vaccine" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      <div><Label>Medication</Label><Input placeholder="Medication used" value={form.medication} onChange={e => setForm(f => ({ ...f, medication: e.target.value }))} /></div>
      <div><Label>Notes</Label><Textarea placeholder="Additional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Health, vaccinations, and treatments</p>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Record</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Add Health Record</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={addRecord}>Add Record</Button></DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
        <DialogContent><DialogHeader><DialogTitle>Edit Health Record</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={saveEdit}>Save Changes</Button></DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this health record?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DataFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search description, medication, notes…"
        selects={[
          { key: 'batch', label: 'Batch', options: batches.map(b => ({ value: b.id, label: b.name })) },
          { key: 'type', label: 'Type', options: [
            { value: 'vaccination', label: 'Vaccination' },
            { value: 'disease', label: 'Disease' },
            { value: 'treatment', label: 'Treatment' },
          ]},
        ]}
        totalCount={health.length}
        resultCount={applyDataFilter(health, filter, {
          dateField: r => r.date,
          searchFields: r => [r.description, r.medication, r.notes],
          selectFields: { batch: r => r.batchId, type: r => r.type },
        }).length}
      />

      {health.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Heart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No health records yet.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Batch</TableHead><TableHead>Type</TableHead>
                <TableHead>Description</TableHead><TableHead>Medication</TableHead><TableHead>Notes</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...applyDataFilter(health, filter, {
                dateField: r => r.date,
                searchFields: r => [r.description, r.medication, r.notes],
                selectFields: { batch: r => r.batchId, type: r => r.type },
              })].reverse().map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{getBatchName(r.batchId)}</TableCell>
                  <TableCell><Badge variant="outline" className={typeColor(r.type)}>{r.type}</Badge></TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell>{r.medication || '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.notes || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(r)} className="text-muted-foreground/50 hover:text-primary transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteId(r.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
