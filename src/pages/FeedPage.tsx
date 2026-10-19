import { useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { FeedRecord } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Wheat, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';

export default function FeedPage() {
  const { batches, feed, setFeed, feedSettings, setFeedSettings } = useFarm();
  const [filter, setFilter] = useFilterState('feed');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ batchId: '', bags: '', feedType: '', costPerBag: '', date: new Date().toISOString().split('T')[0], feedSettingId: '' });

  const resetForm = () => setForm({ batchId: '', bags: '', feedType: '', costPerBag: '', date: new Date().toISOString().split('T')[0], feedSettingId: '' });

  const handleFeedSettingChange = (id: string) => {
    const setting = feedSettings.find(s => s.id === id);
    if (setting) setForm(f => ({ ...f, feedSettingId: id, feedType: setting.feedType, costPerBag: String(setting.pricePerBag) }));
  };

  // Stock check for current form
  const stockWarning = (() => {
    if (!form.feedSettingId || !form.bags) return null;
    const setting = feedSettings.find(s => s.id === form.feedSettingId);
    if (!setting) return null;
    const bags = parseInt(form.bags);
    if (bags > (setting.stockBags || 0)) {
      return `Insufficient stock: need ${bags} bags, only ${setting.stockBags || 0} available`;
    }
    return null;
  })();

  const addFeed = () => {
    if (!form.batchId || !form.bags) return;
    if (stockWarning) return;
    const bags = parseInt(form.bags);
    const record: FeedRecord = { id: crypto.randomUUID(), batchId: form.batchId, date: form.date, bags, feedType: form.feedType || 'Starter', costPerBag: parseFloat(form.costPerBag) || 0, feedSettingId: form.feedSettingId || undefined };
    // Deduct from stock on feed usage
    if (form.feedSettingId) {
      setFeedSettings(prev => prev.map(s => s.id === form.feedSettingId ? { ...s, stockBags: Math.max(0, (s.stockBags || 0) - bags) } : s));
    }
    setFeed(prev => [...prev, record]);
    resetForm(); setOpen(false);
  };

  const startEdit = (r: FeedRecord) => { setEditId(r.id); setForm({ batchId: r.batchId, bags: String(r.bags), feedType: r.feedType, costPerBag: String(r.costPerBag), date: r.date, feedSettingId: r.feedSettingId || '' }); setEditOpen(true); };

  const saveEdit = () => {
    if (!editId || !form.bags) return;
    setFeed(prev => prev.map(r => r.id !== editId ? r : { ...r, bags: parseInt(form.bags), feedType: form.feedType || 'Starter', costPerBag: parseFloat(form.costPerBag) || 0, date: form.date }));
    resetForm(); setEditId(null); setEditOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const record = feed.find(r => r.id === deleteId);
    // Restore stock
    if (record?.feedSettingId) {
      setFeedSettings(prev => prev.map(s => s.id === record.feedSettingId ? { ...s, stockBags: (s.stockBags || 0) + record.bags } : s));
    }
    setFeed(prev => prev.filter(r => r.id !== deleteId));
    setDeleteId(null);
  };

  const activeBatches = batches.filter(b => b.status === 'active');
  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name || 'Unknown';
  const totalBags = feed.reduce((s, f) => s + f.bags, 0);
  const totalCost = feed.reduce((s, f) => s + f.bags * f.costPerBag, 0);

  const feedByBatch = batches.map(b => ({
    name: b.name,
    totalBags: feed.filter(f => f.batchId === b.id).reduce((s, f) => s + f.bags, 0),
    totalCost: feed.filter(f => f.batchId === b.id).reduce((s, f) => s + f.bags * f.costPerBag, 0),
  })).filter(b => b.totalBags > 0);

  const formFields = (
    <div className="space-y-4 pt-2">
      <div><Label>Batch</Label><Select value={form.batchId} onValueChange={v => setForm(f => ({ ...f, batchId: v }))}><SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger><SelectContent>{activeBatches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
      {feedSettings.length > 0 && (
        <div><Label>Feed Brand (auto-fills type & cost)</Label><Select value={form.feedSettingId} onValueChange={handleFeedSettingChange}><SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger><SelectContent>{feedSettings.map(s => <SelectItem key={s.id} value={s.id}>{s.brand} — {s.feedType} (Stock: {s.stockBags || 0})</SelectItem>)}</SelectContent></Select></div>
      )}
      <div><Label>Number of Bags</Label><Input type="number" placeholder="10" value={form.bags} onChange={e => setForm(f => ({ ...f, bags: e.target.value }))} /></div>
      <div><Label>Feed Type</Label><Select value={form.feedType} onValueChange={v => setForm(f => ({ ...f, feedType: v }))}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent><SelectItem value="Starter">Starter</SelectItem><SelectItem value="Grower">Grower</SelectItem><SelectItem value="Finisher">Finisher</SelectItem><SelectItem value="Layer Mash">Layer Mash</SelectItem></SelectContent></Select></div>
      <div><Label>Cost per Bag (R)</Label><Input type="number" placeholder="5000" value={form.costPerBag} onChange={e => setForm(f => ({ ...f, costPerBag: e.target.value }))} /></div>
      {stockWarning && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />{stockWarning}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><p className="text-muted-foreground">Track feed purchases and consumption</p><div className="flex gap-4 mt-1 text-sm"><span className="text-primary font-semibold">Total Bags: {totalBags}</span><span className="text-secondary font-semibold">Total Cost: R{totalCost.toLocaleString()}</span></div></div>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Record Feed</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Record Feed</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={addFeed} disabled={!!stockWarning}>Record Feed</Button></DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
        <DialogContent><DialogHeader><DialogTitle>Edit Feed Record</DialogTitle></DialogHeader>{formFields}<Button className="w-full" onClick={saveEdit}>Save Changes</Button></DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure you want to delete this record?</AlertDialogTitle><AlertDialogDescription>The feed bags will be restored to stock.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {feedByBatch.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {feedByBatch.map(b => (<div key={b.name} className="bg-card rounded-xl border border-border p-4"><h4 className="font-semibold">{b.name}</h4><p className="text-sm text-muted-foreground mt-1">{b.totalBags} bags · R{b.totalCost.toLocaleString()}</p></div>))}
        </div>
      )}

      <DataFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search feed type…"
        selects={[
          { key: 'batch', label: 'Batch', options: batches.map(b => ({ value: b.id, label: b.name })) },
          { key: 'type', label: 'Feed Type', options: ['Starter','Grower','Finisher','Layer Mash'].map(t => ({ value: t, label: t })) },
        ]}
        totalCount={feed.length}
        resultCount={applyDataFilter(feed, filter, {
          dateField: r => r.date,
          searchFields: r => [r.feedType],
          selectFields: { batch: r => r.batchId, type: r => r.feedType },
        }).length}
      />

      {feed.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center"><Wheat className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" /><p className="text-muted-foreground">No feed records yet.</p></div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Batch</TableHead><TableHead>Type</TableHead><TableHead>Bags</TableHead><TableHead>Cost/Bag</TableHead><TableHead>Total</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
            <TableBody>
              {[...applyDataFilter(feed, filter, {
                dateField: r => r.date,
                searchFields: r => [r.feedType],
                selectFields: { batch: r => r.batchId, type: r => r.feedType },
              })].reverse().map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{getBatchName(r.batchId)}</TableCell>
                  <TableCell>{r.feedType}</TableCell>
                  <TableCell>{r.bags}</TableCell>
                  <TableCell>R{r.costPerBag.toLocaleString()}</TableCell>
                  <TableCell className="font-semibold">R{(r.bags * r.costPerBag).toLocaleString()}</TableCell>
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
