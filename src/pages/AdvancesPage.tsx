import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useFarm } from '@/contexts/FarmContext';
import type { AdvancePayment, PaymentMethod } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Wallet, Plus, Pencil, Trash2, Printer, AlertTriangle, FileSpreadsheet, FileText } from 'lucide-react';
import { toNum } from '@/lib/num';
import { advanceRemaining, buyerAdvanceBalance, deleteAdvance } from '@/lib/advances';
import { DataFilter, applyDataFilter, defaultFilterValue, type FilterValue } from '@/components/DataFilter';

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'remaining_desc' | 'buyer_asc';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT / Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

const emptyForm = () => ({
  buyerId: '',
  amount: '',
  method: 'cash' as PaymentMethod,
  date: new Date().toISOString().split('T')[0],
  notes: '',
});

export default function AdvancesPage() {
  const { buyers, advances, setAdvances, sales, setSales, collections, setCollections } = useFarm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdvancePayment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdvancePayment | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterValue>(defaultFilterValue);
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');

  const buyerName = (id: string) => buyers.find(b => b.id === id)?.name || advances.find(a => a.buyerId === id)?.buyerName || 'Unknown';
  const buyerPhone = (id: string) => buyers.find(b => b.id === id)?.phone || '';

  const balances = useMemo(() => {
    const byBuyer = new Map<string, { total: number; applied: number; remaining: number }>();
    advances.forEach(a => {
      const cur = byBuyer.get(a.buyerId) ?? { total: 0, applied: 0, remaining: 0 };
      cur.total += toNum(a.amount);
      cur.applied += toNum(a.applied);
      cur.remaining += advanceRemaining(a);
      byBuyer.set(a.buyerId, cur);
    });
    return byBuyer;
  }, [advances]);

  const totals = useMemo(() => {
    let total = 0, applied = 0, remaining = 0;
    balances.forEach(v => { total += v.total; applied += v.applied; remaining += v.remaining; });
    return { total, applied, remaining };
  }, [balances]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setError(''); setOpen(true); };
  const openEdit = (a: AdvancePayment) => {
    setEditing(a);
    setForm({
      buyerId: a.buyerId,
      amount: String(a.amount),
      method: a.method,
      date: a.date,
      notes: a.notes || '',
    });
    setError('');
    setOpen(true);
  };

  const save = () => {
    setError('');
    const schema = z.object({
      buyerId: z.string().min(1, 'Buyer is required.'),
      amount: z.number({ invalid_type_error: 'Amount is required.' }).positive('Amount must be greater than 0.'),
      date: z.string().min(1, 'Date is required.'),
    });
    const parsed = schema.safeParse({
      buyerId: form.buyerId,
      amount: form.amount === '' ? NaN : Number(form.amount),
      date: form.date,
    });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    const buyer = buyers.find(b => b.id === parsed.data.buyerId);
    if (!buyer) { setError('Buyer not found.'); return; }
    if (editing) {
      if (parsed.data.amount + 0.001 < toNum(editing.applied)) {
        setError(`Amount cannot be less than already applied (R${toNum(editing.applied).toFixed(2)}).`);
        return;
      }
      setAdvances(prev => prev.map(a => a.id !== editing.id ? a : {
        ...a,
        buyerId: buyer.id,
        buyerName: buyer.name,
        amount: parsed.data.amount,
        method: form.method,
        date: form.date,
        notes: form.notes.trim() || undefined,
      }));
    } else {
      const entry: AdvancePayment = {
        id: crypto.randomUUID(),
        buyerId: buyer.id,
        buyerName: buyer.name,
        date: form.date,
        amount: parsed.data.amount,
        applied: 0,
        method: form.method,
        notes: form.notes.trim() || undefined,
      };
      setAdvances(prev => [...prev, entry]);
    }
    setOpen(false);
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const result = deleteAdvance(deleteTarget.id, advances, sales, collections);
    setAdvances(result.advances);
    setSales(result.sales);
    setCollections(result.collections);
    setDeleteTarget(null);
  };

  const printReceipt = (a: AdvancePayment) => {
    const name = buyerName(a.buyerId);
    const phone = buyerPhone(a.buyerId);
    const remaining = advanceRemaining(a);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Advance Receipt ${a.id.slice(0, 8)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:40px auto;padding:24px;color:#111}
  h1{font-size:20px;margin:0 0 4px}
  .muted{color:#666;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  td{padding:8px 0;border-bottom:1px solid #eee;font-size:14px}
  td.label{color:#666;width:45%}
  td.val{text-align:right;font-weight:600}
  .total{font-size:18px;font-weight:700}
  .footer{margin-top:24px;font-size:11px;color:#888;text-align:center}
  @media print{ button{display:none} }
</style></head><body>
<h1>Advance Payment Receipt</h1>
<div class="muted">PoultryPro · Receipt #${a.id.slice(0, 8).toUpperCase()}</div>
<table>
  <tr><td class="label">Buyer</td><td class="val">${escapeHtml(name)}</td></tr>
  ${phone ? `<tr><td class="label">Phone</td><td class="val">${escapeHtml(phone)}</td></tr>` : ''}
  <tr><td class="label">Date</td><td class="val">${new Date(a.date).toLocaleDateString()}</td></tr>
  <tr><td class="label">Method</td><td class="val">${a.method.toUpperCase()}</td></tr>
  <tr><td class="label">Amount Received</td><td class="val total">R${toNum(a.amount).toLocaleString()}</td></tr>
  <tr><td class="label">Already Applied</td><td class="val">R${toNum(a.applied).toLocaleString()}</td></tr>
  <tr><td class="label">Remaining Credit</td><td class="val total">R${remaining.toLocaleString()}</td></tr>
  ${a.notes ? `<tr><td class="label">Notes</td><td class="val">${escapeHtml(a.notes)}</td></tr>` : ''}
</table>
<div class="footer">Generated ${new Date().toLocaleString()}</div>
<div style="text-align:center;margin-top:20px"><button onclick="window.print()">Print</button></div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=600,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-muted-foreground">Record and audit customer prepayments. Advance credit sits as a liability until applied to a sale.</p>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setEditing(null); setError(''); } }}>
          <DialogTrigger asChild>
            <Button onClick={openNew} disabled={buyers.length === 0}>
              <Plus className="h-4 w-4 mr-1.5" /> Record Advance
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {editing ? 'Edit' : 'Record'} Advance Payment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Buyer *</Label>
                <Select value={form.buyerId} onValueChange={v => { setError(''); setForm(f => ({ ...f, buyerId: v })); }}>
                  <SelectTrigger><SelectValue placeholder="Select buyer" /></SelectTrigger>
                  <SelectContent>
                    {buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}{b.phone ? ` · ${b.phone}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount (R) *</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={e => { setError(''); setForm(f => ({ ...f, amount: e.target.value.replace('-', '') })); }} /></div>
                <div>
                  <Label>Method *</Label>
                  <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v as PaymentMethod }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reference, notes, etc." /></div>
              {error && <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
              <Button className="w-full" onClick={save}>{editing ? 'Save Changes' : 'Save Advance'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {buyers.length === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 text-sm px-4 py-3">
          Add buyers first (Buyers page) to record advance payments.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Total Received</p>
          <p className="text-xl font-bold font-display">R{totals.total.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Applied to Sales</p>
          <p className="text-xl font-bold font-display text-primary">R{totals.applied.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border border-blue-500/20 p-4">
          <p className="text-xs text-muted-foreground">Outstanding Credit</p>
          <p className="text-xl font-bold font-display text-blue-600">R{totals.remaining.toLocaleString()}</p>
        </div>
      </div>



      {advances.length > 0 && (() => {
        const buyerOptions = Array.from(new Set(advances.map(a => a.buyerId))).map(id => ({
          value: id,
          label: buyerName(id),
        }));
        const filtered = applyDataFilter(advances, filter, {
          dateField: a => a.date,
          searchFields: a => [buyerName(a.buyerId), a.notes, a.method],
          selectFields: {
            buyer: a => a.buyerId,
            status: a => {
              const rem = advanceRemaining(a);
              return rem <= 0 ? 'used' : toNum(a.applied) > 0 ? 'partial' : 'open';
            },
          },
        });
        const sorted = [...filtered].sort((a, b) => {
          switch (sortKey) {
            case 'date_asc': return a.date.localeCompare(b.date);
            case 'amount_desc': return toNum(b.amount) - toNum(a.amount);
            case 'amount_asc': return toNum(a.amount) - toNum(b.amount);
            case 'remaining_desc': return advanceRemaining(b) - advanceRemaining(a);
            case 'buyer_asc': return buyerName(a.buyerId).localeCompare(buyerName(b.buyerId));
            case 'date_desc':
            default: return b.date.localeCompare(a.date);
          }
        });
        return (
          <>
            <DataFilter
              value={filter}
              onChange={setFilter}
              searchPlaceholder="Search buyer, notes, method…"
              selects={[
                { key: 'buyer', label: 'Buyer', options: buyerOptions },
                { key: 'status', label: 'Status', options: [
                  { value: 'open', label: 'Open' },
                  { value: 'partial', label: 'Partial' },
                  { value: 'used', label: 'Fully Used' },
                ]},
              ]}
              totalCount={advances.length}
              resultCount={sorted.length}
            />

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-display text-sm font-semibold">Advance Ledger</h3>
                  <p className="text-xs text-muted-foreground">All recorded advances. Deleting an advance reverses any allocations to sales.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-xs text-muted-foreground">Sort</Label>
                  <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
                    <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date_desc">Date (newest first)</SelectItem>
                      <SelectItem value="date_asc">Date (oldest first)</SelectItem>
                      <SelectItem value="amount_desc">Amount (high → low)</SelectItem>
                      <SelectItem value="amount_asc">Amount (low → high)</SelectItem>
                      <SelectItem value="remaining_desc">Remaining (high → low)</SelectItem>
                      <SelectItem value="buyer_asc">Buyer (A → Z)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8" disabled={sorted.length === 0}
                    onClick={() => exportAdvancesCSV(sorted, buyerName, buyerPhone)}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> CSV
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" disabled={sorted.length === 0}
                    onClick={() => exportAdvancesPDF(sorted, buyerName, buyerPhone)}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                  </Button>
                </div>
              </div>
              {sorted.length === 0 ? (
                <div className="p-12 text-center">
                  <Wallet className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No advances match the current filters.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Allocated (FIFO)</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {sorted.map(a => {
                      const remaining = advanceRemaining(a);
                      const applied = toNum(a.applied);
                      const status = remaining <= 0 ? 'used' : applied > 0 ? 'partial' : 'open';
                      return (
                        <TableRow key={a.id}>
                          <TableCell>{new Date(a.date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{buyerName(a.buyerId)}</TableCell>
                          <TableCell className="uppercase text-xs text-muted-foreground">{a.method}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">R{toNum(a.amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">R{applied.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-blue-600">R{remaining.toLocaleString()}</TableCell>
                          <TableCell>
                            {status === 'used' && <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">Fully Used</Badge>}
                            {status === 'partial' && <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs">Partial</Badge>}
                            {status === 'open' && <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30 text-xs">Open</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => printReceipt(a)} title="Print receipt"><Printer className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => openEdit(a)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(a)} title="Delete" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        );
      })()}

      {advances.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No advance payments recorded yet.</p>
        </div>
      )}


      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this advance payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && toNum(deleteTarget.applied) > 0
                ? `R${toNum(deleteTarget.applied).toLocaleString()} of this advance has already been applied. Deleting will reverse those allocations — affected sales will revert to Pending Collection and their collected amounts will be reduced.`
                : 'This advance has not been applied yet. It will be removed and the buyer credit balance will decrease accordingly.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function csvCell(v: string | number | undefined): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportAdvancesCSV(rows: AdvancePayment[], buyerName: (id: string) => string, buyerPhone: (id: string) => string) {
  const headers = ['Date', 'Buyer', 'Phone', 'Method', 'Amount', 'Applied', 'Remaining', 'Status', 'Notes'];
  const body = rows.map(a => {
    const remaining = advanceRemaining(a);
    const applied = toNum(a.applied);
    const status = remaining <= 0 ? 'Fully Used' : applied > 0 ? 'Partial' : 'Open';
    return [
      new Date(a.date).toLocaleDateString(),
      buyerName(a.buyerId),
      buyerPhone(a.buyerId),
      a.method.toUpperCase(),
      toNum(a.amount).toFixed(2),
      applied.toFixed(2),
      remaining.toFixed(2),
      status,
      a.notes || '',
    ].map(csvCell).join(',');
  });
  const csv = [headers.join(','), ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `advance-ledger-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportAdvancesPDF(rows: AdvancePayment[], buyerName: (id: string) => string, buyerPhone: (id: string) => string) {
  const totals = rows.reduce((acc, a) => ({
    amount: acc.amount + toNum(a.amount),
    applied: acc.applied + toNum(a.applied),
    remaining: acc.remaining + advanceRemaining(a),
  }), { amount: 0, applied: 0, remaining: 0 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Advance Ledger</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:32px;color:#111}
  h1{font-size:20px;margin:0 0 4px}
  .muted{color:#666;font-size:12px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:left}
  th{background:#f5f5f5;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:0.03em}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;border-top:2px solid #333;border-bottom:none}
  .footer{margin-top:20px;font-size:10px;color:#888;text-align:center}
  @media print{ button{display:none} }
</style></head><body>
<h1>Advance Payment Ledger</h1>
<div class="muted">PoultryPro · ${rows.length} entries · Generated ${new Date().toLocaleString()}</div>
<table>
  <thead><tr>
    <th>Date</th><th>Buyer</th><th>Phone</th><th>Method</th>
    <th class="num">Amount</th><th class="num">Applied</th><th class="num">Remaining</th><th>Status</th>
  </tr></thead>
  <tbody>
    ${rows.map(a => {
      const remaining = advanceRemaining(a);
      const applied = toNum(a.applied);
      const status = remaining <= 0 ? 'Fully Used' : applied > 0 ? 'Partial' : 'Open';
      return `<tr>
        <td>${new Date(a.date).toLocaleDateString()}</td>
        <td>${escapeHtml(buyerName(a.buyerId))}</td>
        <td>${escapeHtml(buyerPhone(a.buyerId))}</td>
        <td>${a.method.toUpperCase()}</td>
        <td class="num">R${toNum(a.amount).toLocaleString()}</td>
        <td class="num">R${applied.toLocaleString()}</td>
        <td class="num">R${remaining.toLocaleString()}</td>
        <td>${status}</td>
      </tr>`;
    }).join('')}
  </tbody>
  <tfoot><tr>
    <td colspan="4">Totals</td>
    <td class="num">R${totals.amount.toLocaleString()}</td>
    <td class="num">R${totals.applied.toLocaleString()}</td>
    <td class="num">R${totals.remaining.toLocaleString()}</td>
    <td></td>
  </tr></tfoot>
</table>
<div class="footer">PoultryPro · Advance Ledger Export</div>
<div style="text-align:center;margin-top:16px"><button onclick="window.print()">Print / Save as PDF</button></div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=800');
  if (w) { w.document.write(html); w.document.close(); }
}
