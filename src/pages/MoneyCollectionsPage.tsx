import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useFarm } from '@/contexts/FarmContext';
import type { PaymentCollection, PaymentMethod, SaleRecord } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Wallet, Plus, ChevronDown, ChevronUp, Trash2, AlertTriangle, CheckCircle2, HandCoins } from 'lucide-react';
import { isPendingSale, saleTotal, collectedForSale, outstandingForSale } from '@/lib/revenue';
import { toNum } from '@/lib/num';
import { applyAdvanceToPendingSale, buyerAdvanceBalance } from '@/lib/advances';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT / Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

export default function MoneyCollectionsPage() {
  const { sales, setSales, collections, setCollections, batches, buyers, advances, setAdvances } = useFarm();
  const [payingSale, setPayingSale] = useState<SaleRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useFilterState('collections');
  const [form, setForm] = useState({
    amount: '',
    method: 'cash' as PaymentMethod,
    date: new Date().toISOString().split('T')[0],
    capturedBy: '',
    notes: '',
  });
  const [error, setError] = useState('');

  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name || 'Unknown';

  const pendingSales = useMemo(
    () => sales.filter(s => isPendingSale(s) && outstandingForSale(s, collections) > 0),
    [sales, collections],
  );

  const filteredPending = useMemo(() => applyDataFilter(pendingSales, filter, {
    dateField: s => s.date,
    searchFields: s => [s.buyer, s.invoiceNumber, getBatchName(s.batchId)],
    selectFields: {
      batch: s => s.batchId,
      progress: s => {
        const total = saleTotal(s);
        const collected = collectedForSale(s.id, collections);
        if (collected <= 0) return 'unpaid';
        if (collected >= total - 0.001) return 'paid';
        return 'partial';
      },
    },
  }), [pendingSales, filter, collections, batches]);

  const totals = useMemo(() => {
    const totalOutstanding = filteredPending.reduce((s, r) => s + outstandingForSale(r, collections), 0);
    const totalInvoiced = filteredPending.reduce((s, r) => s + saleTotal(r), 0);
    const totalCollected = filteredPending.reduce((s, r) => s + collectedForSale(r.id, collections), 0);
    return { totalOutstanding, totalInvoiced, totalCollected };
  }, [filteredPending, collections]);

  const openPay = (sale: SaleRecord) => {
    const outstanding = outstandingForSale(sale, collections);
    setPayingSale(sale);
    setForm({
      amount: outstanding.toString(),
      method: 'cash',
      date: new Date().toISOString().split('T')[0],
      capturedBy: '',
      notes: '',
    });
    setError('');
  };

  const submitPayment = () => {
    if (!payingSale) return;
    const outstanding = outstandingForSale(payingSale, collections);
    const schema = z.object({
      amount: z
        .number({ invalid_type_error: 'Amount is required.' })
        .positive('Amount must be greater than 0.')
        .max(outstanding + 0.001, `Amount cannot exceed outstanding R${outstanding.toFixed(2)}.`),
      date: z.string().min(1, 'Date is required.'),
      capturedBy: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse({
      amount: form.amount === '' ? NaN : Number(form.amount),
      date: form.date,
      capturedBy: form.capturedBy,
      notes: form.notes,
    });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    const { amount } = parsed.data;


    const entry: PaymentCollection = {
      id: crypto.randomUUID(),
      saleId: payingSale.id,
      batchId: payingSale.batchId,
      date: form.date,
      amount,
      method: form.method,
      capturedBy: form.capturedBy.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    setCollections(prev => [...prev, entry]);

    const newCollected = (payingSale.amountCollected ?? 0) + amount;
    const totalDue = saleTotal(payingSale);
    const nowPaid = newCollected >= totalDue - 0.001;
    setSales(prev => prev.map(s => s.id !== payingSale.id ? s : {
      ...s,
      amountCollected: newCollected,
      paymentStatus: nowPaid ? 'paid' : 'pending',
    }));
    setPayingSale(null);
  };

  const removeCollection = (saleId: string, collectionId: string) => {
    const removed = collections.find(c => c.id === collectionId);
    if (!removed) return;
    setCollections(prev => prev.filter(c => c.id !== collectionId));
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      const newCollected = Math.max(0, (sale.amountCollected ?? 0) - removed.amount);
      setSales(prev => prev.map(s => s.id !== saleId ? s : {
        ...s,
        amountCollected: newCollected,
        // If we removed a payment, sale is pending again
        paymentStatus: 'pending',
      }));
    }
  };

  const advanceBalances = useMemo(() => {
    const map = new Map<string, number>();
    advances.forEach(a => map.set(a.buyerId, (map.get(a.buyerId) ?? 0) + toNum(a.amount) - toNum(a.applied)));
    return map;
  }, [advances]);
  const totalAdvanceCredit = Array.from(advanceBalances.values()).reduce((s, v) => s + v, 0);

  const applyAdvance = (sale: SaleRecord) => {
    if (!sale.buyerId) return;
    const result = applyAdvanceToPendingSale(sale, advances, sales, collections, new Date().toISOString().split('T')[0]);
    setAdvances(result.advances);
    setSales(result.sales);
    setCollections(result.collections);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-muted-foreground">Manage pending invoices and record collections. Advance credit is managed on the <Link to="/advances" className="text-primary underline underline-offset-2">Advances</Link> page.</p>
      </div>


      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Open Invoices</p>
          <p className="text-xl font-bold font-display">{pendingSales.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Total Invoiced</p>
          <p className="text-xl font-bold font-display">R{totals.totalInvoiced.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Collected</p>
          <p className="text-xl font-bold font-display text-primary">R{totals.totalCollected.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-xl font-bold font-display text-amber-600">R{totals.totalOutstanding.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border border-blue-500/20 p-4">
          <p className="text-xs text-muted-foreground">Advance Credit</p>
          <p className="text-xl font-bold font-display text-blue-600">R{totalAdvanceCredit.toLocaleString()}</p>
        </div>
      </div>




      {pendingSales.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-semibold">No pending invoices</p>
          <p className="text-sm text-muted-foreground mt-1">Paid invoices automatically move to Completed Sales.</p>
        </div>
      ) : (
        <>
          <DataFilter
            value={filter}
            onChange={setFilter}
            searchPlaceholder="Search customer, invoice, batch…"
            selects={[
              { key: 'progress', label: 'Progress', options: [
                { value: 'unpaid', label: 'Not started' },
                { value: 'partial', label: 'Partially collected' },
                { value: 'paid', label: 'Fully collected' },
              ]},
              { key: 'batch', label: 'Batch', options: Array.from(new Set(pendingSales.map(s => s.batchId))).map(id => ({ value: id, label: getBatchName(id) })) },
            ]}
            totalCount={pendingSales.length}
            resultCount={filteredPending.length}
          />
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sale Date</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="w-40">Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPending.map(s => {
                const total = saleTotal(s);
                const collected = collectedForSale(s.id, collections);
                const outstanding = outstandingForSale(s, collections);
                const progress = total > 0 ? (collected / total) * 100 : 0;
                const saleCollections = collections.filter(c => c.saleId === s.id);
                const expanded = expandedId === s.id;
                return (
                  <>
                    <TableRow key={s.id}>
                      <TableCell>
                        <button
                          onClick={() => setExpandedId(expanded ? null : s.id)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Payment history"
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.invoiceNumber || '—'}</TableCell>
                      <TableCell className="font-medium">{s.buyer}</TableCell>
                      <TableCell>{new Date(s.date).toLocaleDateString()}</TableCell>
                      <TableCell>{getBatchName(s.batchId)}</TableCell>
                      <TableCell className="text-right font-semibold">R{total.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-primary">R{collected.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-amber-600 font-semibold">R{outstanding.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="h-2" />
                          <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{progress.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs">Pending</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          {s.buyerId && buyerAdvanceBalance(s.buyerId, advances) > 0 && (
                            <Button size="sm" variant="outline" onClick={() => applyAdvance(s)} title="Apply available advance credit">
                              <HandCoins className="h-3.5 w-3.5 mr-1" /> Advance
                            </Button>
                          )}
                          <Button size="sm" onClick={() => openPay(s)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Payment
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow key={s.id + '-history'}>
                        <TableCell colSpan={11} className="bg-muted/30 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Collection History</p>
                          {saleCollections.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {saleCollections.map(c => (
                                <div key={c.id} className="flex items-center justify-between text-sm bg-background rounded-md px-3 py-2 border border-border">
                                  <div>
                                    <span className="font-semibold text-primary">R{c.amount.toLocaleString()}</span>
                                    <span className="mx-2 text-muted-foreground">·</span>
                                    <span className="uppercase text-xs text-muted-foreground">{c.method}</span>
                                    <span className="mx-2 text-muted-foreground">·</span>
                                    <span>{new Date(c.date).toLocaleDateString()}</span>
                                    {c.capturedBy && <span className="text-muted-foreground text-xs ml-2">by {c.capturedBy}</span>}
                                    {c.notes && <div className="text-xs text-muted-foreground mt-0.5">{c.notes}</div>}
                                  </div>
                                  <button onClick={() => removeCollection(s.id, c.id)} className="text-muted-foreground/50 hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      <Dialog open={!!payingSale} onOpenChange={o => { if (!o) setPayingSale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Record Payment
            </DialogTitle>
          </DialogHeader>
          {payingSale && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-mono">{payingSale.invoiceNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-semibold">{payingSale.buyer}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>R{saleTotal(payingSale).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Outstanding</span><span className="text-amber-600 font-bold">R{outstandingForSale(payingSale, collections).toLocaleString()}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount (R) *</Label>
                  <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => { setError(''); setForm(f => ({ ...f, amount: e.target.value.replace('-', '') })); }} />
                </div>
                <div>
                  <Label>Payment Method *</Label>
                  <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v as PaymentMethod }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date *</Label>
                  <Input type="date" value={form.date} onChange={e => { setError(''); setForm(f => ({ ...f, date: e.target.value })); }} />
                </div>
                <div>
                  <Label>Captured By</Label>
                  <Input placeholder="Your name" value={form.capturedBy} onChange={e => setForm(f => ({ ...f, capturedBy: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reference, receipt no, etc." />
              </div>
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}
              <Button className="w-full" onClick={submitPayment}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Record Payment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
