import { useState, useMemo, useEffect } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { MortalityRecord, MortalityResell } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Trash2, RotateCcw } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: MortalityRecord | null;
}

export default function MortalityResellDialog({ open, onOpenChange, record }: Props) {
  const { mortalityResells, setMortalityResells, batches } = useFarm();
  const [form, setForm] = useState({
    quantity: '',
    pricePerUnit: '',
    buyer: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [error, setError] = useState('');

  const existing = useMemo(
    () => mortalityResells.filter(r => r.mortalityId === record?.id),
    [mortalityResells, record?.id]
  );

  const totalDead = record?.count ?? 0;
  const alreadyResold = existing.reduce((s, r) => s + r.quantity, 0);
  const remaining = Math.max(0, totalDead - alreadyResold);
  const recovered = existing.reduce((s, r) => s + r.totalAmount, 0);
  const batchName = batches.find(b => b.id === record?.batchId)?.name ?? '—';

  useEffect(() => {
    if (open) {
      setForm({ quantity: '', pricePerUnit: '', buyer: '', date: new Date().toISOString().split('T')[0], notes: '' });
      setError('');
    }
  }, [open, record?.id]);

  const qty = parseInt(form.quantity) || 0;
  const price = parseFloat(form.pricePerUnit) || 0;
  const total = qty * price;

  const submit = () => {
    if (!record) return;
    if (qty < 1) { setError('Quantity must be at least 1.'); return; }
    if (qty > remaining) { setError(`Cannot resell more than ${remaining} remaining chicken${remaining === 1 ? '' : 's'}.`); return; }
    if (price <= 0) { setError('Price per chicken must be greater than 0.'); return; }
    if (!form.date) { setError('Date is required.'); return; }

    const entry: MortalityResell = {
      id: crypto.randomUUID(),
      mortalityId: record.id,
      batchId: record.batchId,
      date: form.date,
      quantity: qty,
      pricePerUnit: price,
      totalAmount: qty * price,
      buyer: form.buyer.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    setMortalityResells(prev => [...prev, entry]);
    setForm({ quantity: '', pricePerUnit: '', buyer: '', date: new Date().toISOString().split('T')[0], notes: '' });
    setError('');
  };

  const removeResell = (id: string) => {
    setMortalityResells(prev => prev.filter(r => r.id !== id));
  };

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Resell Mortality</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-muted/40 rounded-md p-2">
            <p className="text-[10px] text-muted-foreground">Dead</p>
            <p className="font-bold tabular-nums">{totalDead}</p>
          </div>
          <div className="bg-primary/10 rounded-md p-2">
            <p className="text-[10px] text-muted-foreground">Resold</p>
            <p className="font-bold text-primary tabular-nums">{alreadyResold}</p>
          </div>
          <div className="bg-destructive/10 rounded-md p-2">
            <p className="text-[10px] text-muted-foreground">Remaining</p>
            <p className="font-bold text-destructive tabular-nums">{remaining}</p>
          </div>
          <div className="bg-success/10 rounded-md p-2">
            <p className="text-[10px] text-muted-foreground">Recovered</p>
            <p className="font-bold text-success tabular-nums">R{recovered.toFixed(0)}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {batchName} · {record.cause} · {new Date(record.date).toLocaleDateString()}
        </p>

        {remaining > 0 ? (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity <span className="text-destructive">*</span></Label>
                <Input type="number" min={1} max={remaining} placeholder={`Max ${remaining}`} value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value.replace('-', '') }))} />
              </div>
              <div>
                <Label>Price per chicken (R) <span className="text-destructive">*</span></Label>
                <Input type="number" min={0} step="0.01" placeholder="0.00" value={form.pricePerUnit}
                  onChange={e => setForm(f => ({ ...f, pricePerUnit: e.target.value.replace('-', '') }))} />
              </div>
            </div>
            <div className="bg-muted/30 rounded-md px-3 py-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Total recovered</span>
              <span className="font-bold text-success tabular-nums">R{total.toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>Buyer (optional)</Label>
                <Input placeholder="Buyer name" value={form.buyer} onChange={e => setForm(f => ({ ...f, buyer: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. pet food, processing…" />
            </div>
            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span>
              </div>
            )}
            <Button className="w-full" onClick={submit}>Record Resell</Button>
          </div>
        ) : (
          <div className="border-t border-border pt-3 text-sm text-center text-muted-foreground">
            All dead chickens from this record have been resold.
          </div>
        )}

        {existing.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Past Resells</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {existing.map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm bg-muted/30 rounded-md px-3 py-2">
                  <div>
                    <div className="font-medium">{r.quantity} × R{r.pricePerUnit.toFixed(2)} = <span className="text-success">R{r.totalAmount.toFixed(2)}</span></div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.date).toLocaleDateString()}{r.buyer ? ` · ${r.buyer}` : ''}
                    </div>
                  </div>
                  <button onClick={() => removeResell(r.id)} className="text-muted-foreground/60 hover:text-destructive transition-colors" title="Delete resell">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
