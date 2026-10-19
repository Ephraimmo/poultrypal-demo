import { useMemo } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Users, Wallet } from 'lucide-react';
import { isPendingSale, saleTotal, collectedForSale, outstandingForSale } from '@/lib/revenue';
import { toNum, pct } from '@/lib/num';

/**
 * Per-customer / per-invoice breakdown for the Dashboard.
 * Shows Collected, Pending Outstanding, and Advance Credit separately so the user
 * can see exactly how much each buyer still owes and how much they've pre-paid.
 */
export default function CustomerCollectionsBreakdown() {
  const { sales, collections, buyers, advances } = useFarm();

  const rows = useMemo(() => {
    const pendings = sales.filter(s => isPendingSale(s) && outstandingForSale(s, collections) > 0);
    // Group by buyerId (or buyer name fallback)
    const groups = new Map<string, { key: string; name: string; invoices: typeof pendings; advance: number }>();
    pendings.forEach(s => {
      const key = s.buyerId || `name:${s.buyer}`;
      if (!groups.has(key)) groups.set(key, { key, name: s.buyer, invoices: [], advance: 0 });
      groups.get(key)!.invoices.push(s);
    });
    // Also surface buyers who have advance credit but no pending invoices
    advances.forEach(a => {
      const key = a.buyerId;
      if (!groups.has(key)) {
        const b = buyers.find(x => x.id === a.buyerId);
        groups.set(key, { key, name: b?.name || a.buyerName, invoices: [], advance: 0 });
      }
    });
    // Compute advance balances
    advances.forEach(a => {
      const g = groups.get(a.buyerId);
      if (g) g.advance += toNum(a.amount) - toNum(a.applied);
    });
    return Array.from(groups.values()).map(g => {
      const total = g.invoices.reduce((s, r) => s + saleTotal(r), 0);
      const collected = g.invoices.reduce((s, r) => s + collectedForSale(r.id, collections), 0);
      const outstanding = g.invoices.reduce((s, r) => s + outstandingForSale(r, collections), 0);
      return { ...g, total, collected, outstanding };
    }).sort((a, b) => b.outstanding - a.outstanding);
  }, [sales, collections, buyers, advances]);

  const totals = rows.reduce((acc, r) => ({
    collected: acc.collected + r.collected,
    outstanding: acc.outstanding + r.outstanding,
    advance: acc.advance + r.advance,
  }), { collected: 0, outstanding: 0, advance: 0 });

  if (rows.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold">Customer Collections</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span><span className="text-muted-foreground">Collected:</span> <span className="font-bold text-primary">R{totals.collected.toLocaleString()}</span></span>
          <span><span className="text-muted-foreground">Outstanding:</span> <span className="font-bold text-amber-600">R{totals.outstanding.toLocaleString()}</span></span>
          <span><span className="text-muted-foreground">Advance:</span> <span className="font-bold text-blue-600">R{totals.advance.toLocaleString()}</span></span>
        </div>
      </div>
      <div className="divide-y divide-border">
        {rows.map(r => (
          <div key={r.key} className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{r.name}</span>
                <Badge variant="outline" className="text-[10px]">{r.invoices.length} invoice{r.invoices.length === 1 ? '' : 's'}</Badge>
                {r.advance > 0 && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30 text-[10px]">
                    <Wallet className="h-3 w-3 mr-1" />Advance R{r.advance.toLocaleString()}
                  </Badge>
                )}
              </div>
              <div className="text-xs tabular-nums">
                <span className="text-primary font-semibold">R{r.collected.toLocaleString()}</span>
                <span className="text-muted-foreground"> collected · </span>
                <span className="text-amber-600 font-semibold">R{r.outstanding.toLocaleString()}</span>
                <span className="text-muted-foreground"> outstanding</span>
              </div>
            </div>
            {r.invoices.map(inv => {
              const total = saleTotal(inv);
              const col = collectedForSale(inv.id, collections);
              const out = outstandingForSale(inv, collections);
              const p = pct(col, total);
              return (
                <div key={inv.id} className="pl-3 border-l-2 border-border">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono text-muted-foreground">{inv.invoiceNumber || inv.id.slice(0, 8)}</span>
                    <span className="tabular-nums">
                      R{col.toLocaleString()} / R{total.toLocaleString()}
                      <span className="text-amber-600 ml-2">R{out.toLocaleString()} left</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={p} className="h-2 flex-1" />
                    <span className="text-[11px] tabular-nums text-muted-foreground w-16 text-right">
                      {p.toFixed(0)}% / {(100 - p).toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
