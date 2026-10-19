import { useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { ExpenseRecord } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, DollarSign, Pencil, Trash2 } from 'lucide-react';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';
import { NONE_SENTINEL } from '@/lib/filter-sentinel';

const categories: ExpenseRecord['category'][] = ['feed', 'healthcare', 'equipment', 'labor', 'utilities', 'new_batches', 'other'];
const categoryLabels: Record<ExpenseRecord['category'], string> = {
  feed: 'Feed', healthcare: 'Healthcare', equipment: 'Equipment',
  labor: 'Labor', utilities: 'Utilities', new_batches: 'New Batches', other: 'Other',
};

export default function ExpensesPage() {
  const { batches, expenses, setExpenses } = useFarm();
  const [filter, setFilter] = useFilterState('expenses');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ category: 'feed' as ExpenseRecord['category'], description: '', amount: '', batchId: '', date: new Date().toISOString().split('T')[0] });

  const resetForm = () => setForm({ category: 'feed', description: '', amount: '', batchId: '', date: new Date().toISOString().split('T')[0] });

  const addExpense = () => {
    if (!form.description || !form.amount) return;
    const record: ExpenseRecord = {
      id: crypto.randomUUID(), date: form.date, category: form.category,
      description: form.description.trim(), amount: parseFloat(form.amount),
      batchId: form.batchId && form.batchId !== 'general' ? form.batchId : undefined,
    };
    setExpenses(prev => [...prev, record]);
    resetForm(); setOpen(false);
  };

  const startEdit = (r: ExpenseRecord) => {
    setEditId(r.id);
    setForm({ category: r.category, description: r.description, amount: String(r.amount), batchId: r.batchId || 'general', date: r.date });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editId || !form.description || !form.amount) return;
    setExpenses(prev => prev.map(r => r.id !== editId ? r : {
      ...r, category: form.category, description: form.description.trim(),
      amount: parseFloat(form.amount),
      batchId: form.batchId && form.batchId !== 'general' ? form.batchId : undefined, date: form.date,
    }));
    resetForm(); setEditId(null); setEditOpen(false);
  };

  const confirmDelete = () => {
    if (deleteId) {
      setExpenses(prev => prev.filter(r => r.id !== deleteId));
      setDeleteId(null);
    }
  };

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const getBatchName = (id?: string) => id ? (batches.find(b => b.id === id)?.name || 'Unknown') : '—';

  const formFields = (
    <div className="space-y-4 pt-2">
      <div><Label>Category</Label>
        <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as ExpenseRecord['category'] }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
      <div><Label>Description</Label><Input placeholder="What was the expense for?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      <div><Label>Amount (R)</Label><Input type="number" placeholder="10000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
      <div><Label>Batch (optional)</Label>
        <Select value={form.batchId} onValueChange={v => setForm(f => ({ ...f, batchId: v }))}>
          <SelectTrigger><SelectValue placeholder="General expense" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General</SelectItem>
            {batches.filter(b => b.status === 'active').map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">Track all farm expenses</p>
          <p className="text-sm text-destructive font-semibold mt-1">Total Expenses: R{totalExpenses.toLocaleString()}</p>
        </div>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Expense</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={addExpense}>Add Expense</Button></DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
        <DialogContent><DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={saveEdit}>Save Changes</Button></DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this expense?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DataFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search description…"
        selects={[
          { key: 'category', label: 'Category', options: categories.map(c => ({ value: c, label: categoryLabels[c] })) },
          { key: 'batch', label: 'Batch', options: [
            { value: NONE_SENTINEL, label: 'General' },
            ...batches.map(b => ({ value: b.id, label: b.name })),
          ]},
        ]}
        totalCount={expenses.length}
        resultCount={applyDataFilter(expenses, filter, {
          dateField: r => r.date,
          searchFields: r => [r.description],
          selectFields: { category: r => r.category, batch: r => r.batchId || NONE_SENTINEL },
        }).length}
      />

      {expenses.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No expenses recorded yet.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead>
                <TableHead>Batch</TableHead><TableHead>Amount</TableHead><TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...applyDataFilter(expenses, filter, {
                dateField: r => r.date,
                searchFields: r => [r.description],
                selectFields: { category: r => r.category, batch: r => r.batchId || '' },
              })].reverse().map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{categoryLabels[r.category]}</Badge></TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell>{getBatchName(r.batchId)}</TableCell>
                  <TableCell className="font-semibold text-destructive">R{r.amount.toLocaleString()}</TableCell>
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
