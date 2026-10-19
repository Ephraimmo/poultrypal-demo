import { useMemo, useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { Buyer } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Users, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';
import { useUrlTableState } from '@/hooks/useUrlTableState';
import { useFlockScope } from '@/hooks/useFlockScope';
import { useCan } from '@/contexts/PermissionsContext';
import { Can } from '@/components/Can';
import ExportButtons from '@/components/ExportButtons';
import { advanceRemaining } from '@/lib/advances';

const buyerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be under 100 characters.'),
  phone: z.string().trim().max(30, 'Phone must be under 30 characters.').optional(),
  notes: z.string().trim().max(500, 'Notes must be under 500 characters.').optional(),
});

type BuyerSortKey = 'name' | 'phone' | 'sales' | 'credit';
const PAGE_SIZE = 10;

export default function BuyersPage() {
  const { buyers, setBuyers, sales: allSales, advances } = useFarm();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [error, setError] = useState('');
  const [filter, setFilter] = useFilterState('buyers');
  const [table, setTable] = useUrlTableState('b', { sort: 'name', dir: 'asc', page: 1 });

  // Flock scoping — sales counts only reflect flocks the user may see.
  const { scope } = useFlockScope();
  const sales = useMemo(() => scope(allSales, s => s.batchId), [allSales, scope]);

  const canCreate = useCan('customers', 'create');
  const canEdit = useCan('customers', 'edit');
  const canDelete = useCan('customers', 'delete');
  const canExport = useCan('customers', 'export');

  const reset = () => { setForm({ name: '', phone: '', notes: '' }); setError(''); setEditId(null); };

  const save = () => {
    if (editId ? !canEdit : !canCreate) { toast.error('You do not have permission to do that.'); return; }
    const parsed = buyerSchema.safeParse(form);
    if (!parsed.success) { const m = parsed.error.issues[0].message; setError(m); toast.error(m); return; }
    if (editId) {
      setBuyers(prev => prev.map(b => b.id === editId ? { ...b, ...parsed.data } : b));
      toast.success('Buyer updated');
    } else {
      const b: Buyer = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), name: parsed.data.name, phone: parsed.data.phone, notes: parsed.data.notes };
      setBuyers(prev => [...prev, b]);
      toast.success('Buyer added');
    }
    reset(); setOpen(false);
  };

  const startEdit = (b: Buyer) => {
    if (!canEdit) { toast.error('You do not have permission to edit buyers.'); return; }
    setEditId(b.id);
    setForm({ name: b.name, phone: b.phone || '', notes: b.notes || '' });
    setError('');
    setOpen(true);
  };

  const confirmDelete = () => {
    if (!canDelete) { toast.error('You do not have permission to delete buyers.'); setDeleteId(null); return; }
    setBuyers(prev => prev.filter(b => b.id !== deleteId));
    setDeleteId(null);
    toast.success('Buyer deleted');
  };

  const salesCount = (buyerId: string) => sales.filter(s => s.buyerId === buyerId).length;
  const advanceCredit = (buyerId: string) => advances.filter(a => a.buyerId === buyerId).reduce((s, a) => s + advanceRemaining(a), 0);

  const filtered = useMemo(() => applyDataFilter(buyers, filter, {
    dateField: b => b.createdAt,
    searchFields: b => [b.name, b.phone, b.notes],
    selectFields: {
      activity: b => salesCount(b.id) > 0 ? 'active' : 'inactive',
      credit: b => advanceCredit(b.id) > 0 ? 'yes' : 'no',
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [buyers, filter, sales, advances]);

  const sortKey = table.sort as BuyerSortKey;
  const sortDir = table.dir as 'asc' | 'desc';

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'phone': return (a.phone || '').localeCompare(b.phone || '') * dir;
        case 'sales': return (salesCount(a.id) - salesCount(b.id)) * dir;
        case 'credit': return (advanceCredit(a.id) - advanceCredit(b.id)) * dir;
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, sales, advances]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(table.page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSort = (k: BuyerSortKey) => {
    if (sortKey === k) setTable({ dir: sortDir === 'asc' ? 'desc' : 'asc', page: 1 });
    else setTable({ sort: k, dir: k === 'name' || k === 'phone' ? 'asc' : 'desc', page: 1 });
  };

  const SortHead = ({ k, label, className }: { k: BuyerSortKey; label: string; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === k ? 'text-foreground font-semibold' : ''}`}
      >
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-muted-foreground">Saved customers reused across sales, invoices and advance payments.</p>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && buyers.length > 0 && (
            <ExportButtons
              filename="buyers"
              title="Customers"
              rows={sorted}
              columns={[
                { header: 'Name', value: b => b.name },
                { header: 'Phone', value: b => b.phone || '—' },
                { header: 'Notes', value: b => b.notes || '—' },
                { header: 'Sales', value: b => salesCount(b.id) },
                { header: 'Advance Credit', value: b => advanceCredit(b.id) },
              ]}
            />
          )}
          <Can module="customers" action="create">
            <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Buyer</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editId ? 'Edit Buyer' : 'Add Buyer'}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => { setError(''); setForm(f => ({ ...f, name: e.target.value })); }} placeholder="Customer name" /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+27..." /></div>
                  <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" /></div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button className="w-full" onClick={save}>{editId ? 'Save Changes' : 'Add Buyer'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </Can>
        </div>
      </div>

      {/* Edit dialog for users who can edit but not create */}
      {!canCreate && canEdit && (
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Buyer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => { setError(''); setForm(f => ({ ...f, name: e.target.value })); }} placeholder="Customer name" /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+27..." /></div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" /></div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={save}>Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {buyers.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No buyers yet. Add your first customer to reuse them in sales.</p>
        </div>
      ) : (
        <>
          <DataFilter
            value={filter}
            onChange={setFilter}
            searchPlaceholder="Search name, phone, notes…"
            selects={[
              { key: 'activity', label: 'Activity', options: [
                { value: 'active', label: 'Has sales' },
                { value: 'inactive', label: 'No sales yet' },
              ]},
              { key: 'credit', label: 'Advance Credit', options: [
                { value: 'yes', label: 'Has credit' },
                { value: 'no', label: 'No credit' },
              ]},
            ]}
            totalCount={buyers.length}
            resultCount={filtered.length}
          />

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <SortHead k="name" label="Name" />
                  <SortHead k="phone" label="Phone" />
                  <TableHead>Notes</TableHead>
                  <SortHead k="sales" label="Sales" className="text-right" />
                  <SortHead k="credit" label="Advance Credit" className="text-right" />
                  <TableHead className="w-24"></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {pageRows.map(b => {
                    const credit = advanceCredit(b.id);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-muted-foreground">{b.phone || '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{b.notes || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{salesCount(b.id)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${credit > 0 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                          R{credit.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {canEdit && (
                              <button onClick={() => startEdit(b)} title="Edit buyer" className="text-muted-foreground/50 hover:text-primary"><Pencil className="h-4 w-4" /></button>
                            )}
                            {canDelete && (
                              <button onClick={() => setDeleteId(b.id)} title="Delete buyer" className="text-muted-foreground/50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No buyers match the current filters.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm">
              <span className="text-muted-foreground">
                Showing {pageRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{(currentPage - 1) * PAGE_SIZE + pageRows.length} of {sorted.length}
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
        </>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this buyer?</AlertDialogTitle><AlertDialogDescription>Existing sales keep their captured buyer name; they will just no longer be linked.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
