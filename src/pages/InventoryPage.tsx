import { useMemo, useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { FeedSetting } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, AlertTriangle, TrendingDown, Plus, Wheat, Boxes, DollarSign, FileSpreadsheet } from 'lucide-react';
import { DataFilter, applyDataFilter } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';
import { toNum } from '@/lib/num';

const LOW_STOCK_THRESHOLD = 5;
const CRITICAL_STOCK_THRESHOLD = 2;

type StockStatus = 'ok' | 'low' | 'critical' | 'out';

const stockStatus = (s: number): StockStatus => {
  if (s <= 0) return 'out';
  if (s <= CRITICAL_STOCK_THRESHOLD) return 'critical';
  if (s <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
};

const statusBadge = (s: StockStatus) => {
  switch (s) {
    case 'out': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">Out of stock</Badge>;
    case 'critical': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">Critical</Badge>;
    case 'low': return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs">Low</Badge>;
    default: return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">In stock</Badge>;
  }
};

export default function InventoryPage() {
  const { feedSettings, setFeedSettings, feed, batches } = useFarm();
  const [filter, setFilter] = useFilterState('inventory');
  const [restockTarget, setRestockTarget] = useState<FeedSetting | null>(null);
  const [restockAmount, setRestockAmount] = useState('');
  const [restockCost, setRestockCost] = useState('');

  // --- Derived: usage per feed setting from feed records
  const usageBySetting = useMemo(() => {
    const map = new Map<string, number>();
    feed.forEach(f => {
      if (!f.feedSettingId) return;
      map.set(f.feedSettingId, (map.get(f.feedSettingId) ?? 0) + toNum(f.bags));
    });
    return map;
  }, [feed]);

  // --- Forecast: bags still needed by all active batches
  const projectedNeedBySetting = useMemo(() => {
    const map = new Map<string, number>();
    const active = batches.filter(b => b.status === 'active');
    active.forEach(b => {
      const remaining = Math.max(0, b.currentCount);
      const strategy = b.feedStrategy || 'grower_finisher';
      const sIds = b.feedSelections;
      if (!sIds) return;
      const starter = feedSettings.find(s => s.id === sIds.starter);
      if (starter) {
        const need = Math.ceil((remaining / 100) * starter.bagsPerHundredChickens);
        map.set(starter.id, (map.get(starter.id) ?? 0) + need);
      }
      if (sIds.grower) {
        const need = Math.ceil((remaining / 100) * (strategy === 'grower_only' ? 6 : 3));
        map.set(sIds.grower, (map.get(sIds.grower) ?? 0) + need);
      }
      if (strategy === 'grower_finisher' && sIds.finisher) {
        const need = Math.ceil((remaining / 100) * 3);
        map.set(sIds.finisher, (map.get(sIds.finisher) ?? 0) + need);
      }
    });
    return map;
  }, [batches, feedSettings]);

  // --- Summary metrics
  const summary = useMemo(() => {
    let totalBags = 0, totalValue = 0, lowCount = 0, outCount = 0;
    feedSettings.forEach(s => {
      const stock = toNum(s.stockBags);
      totalBags += stock;
      totalValue += stock * toNum(s.pricePerBag);
      const st = stockStatus(stock);
      if (st === 'low' || st === 'critical') lowCount++;
      if (st === 'out') outCount++;
    });
    return { totalBags, totalValue, lowCount, outCount, skuCount: feedSettings.length };
  }, [feedSettings]);

  // --- Filter + sort
  const filtered = useMemo(() => applyDataFilter(feedSettings, filter, {
    searchFields: s => [s.brand, s.feedType],
    selectFields: {
      feedType: s => s.feedType,
      status: s => stockStatus(toNum(s.stockBags)),
    },
  }), [feedSettings, filter]);

  const brandOptions = Array.from(new Set(feedSettings.map(s => s.brand))).sort();

  const openRestock = (s: FeedSetting) => {
    setRestockTarget(s);
    setRestockAmount('');
    setRestockCost(String(s.pricePerBag));
  };
  const doRestock = () => {
    if (!restockTarget) return;
    const add = Math.max(0, Math.floor(Number(restockAmount) || 0));
    if (add <= 0) return;
    const newPrice = Number(restockCost);
    setFeedSettings(prev => prev.map(s => s.id !== restockTarget.id ? s : {
      ...s,
      stockBags: toNum(s.stockBags) + add,
      pricePerBag: Number.isFinite(newPrice) && newPrice > 0 ? newPrice : s.pricePerBag,
    }));
    setRestockTarget(null);
  };

  const exportCSV = () => {
    const headers = ['Brand', 'Type', 'Stock (bags)', 'Price/Bag (R)', 'Stock Value (R)', 'Used to Date (bags)', 'Projected Need (bags)', 'Status'];
    const rows = filtered.map(s => {
      const stock = toNum(s.stockBags);
      const need = projectedNeedBySetting.get(s.id) ?? 0;
      return [s.brand, s.feedType, stock, s.pricePerBag, stock * toNum(s.pricePerBag), usageBySetting.get(s.id) ?? 0, need, stockStatus(stock)];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-muted-foreground">Live stock levels, usage, and forecast demand across all feed brands.</p>
          <p className="text-xs text-muted-foreground/70">Add or edit brands on <a className="underline" href="/feed-settings">Feed Settings</a>.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> SKUs</div>
          <p className="text-xl font-bold font-display">{summary.skuCount}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wheat className="h-3.5 w-3.5" /> Total Stock</div>
          <p className="text-xl font-bold font-display">{summary.totalBags.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">bags</span></p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="h-3.5 w-3.5" /> Stock Value</div>
          <p className="text-xl font-bold font-display text-primary">R{summary.totalValue.toLocaleString()}</p>
        </div>
        <div className={`rounded-xl border p-4 ${summary.outCount > 0 ? 'border-destructive/40 bg-destructive/5' : summary.lowCount > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-card'}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Alerts</div>
          <p className="text-xl font-bold font-display">
            {summary.outCount > 0 && <span className="text-destructive">{summary.outCount} out</span>}
            {summary.outCount > 0 && summary.lowCount > 0 && <span className="text-muted-foreground"> · </span>}
            {summary.lowCount > 0 && <span className="text-amber-600">{summary.lowCount} low</span>}
            {summary.outCount === 0 && summary.lowCount === 0 && <span className="text-primary">All good</span>}
          </p>
        </div>
      </div>

      {feedSettings.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="font-display text-lg font-semibold mb-2">No inventory yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto">Add feed brands from <a className="underline text-primary" href="/feed-settings">Feed Settings</a> to start tracking stock, usage, and demand forecasts.</p>
        </div>
      ) : (
        <>
          <DataFilter
            value={filter}
            onChange={setFilter}
            showDate={false}
            searchPlaceholder="Search brand or feed type…"
            selects={[
              { key: 'feedType', label: 'Feed Type', options: [
                { value: 'Starter', label: 'Starter' },
                { value: 'Grower', label: 'Grower' },
                { value: 'Finisher', label: 'Finisher' },
              ]},
              { key: 'status', label: 'Stock', options: [
                { value: 'ok', label: 'In stock' },
                { value: 'low', label: 'Low' },
                { value: 'critical', label: 'Critical' },
                { value: 'out', label: 'Out of stock' },
              ]},
              ...(brandOptions.length > 1 ? [{
                key: 'brand', label: 'Brand', options: brandOptions.map(b => ({ value: b, label: b })),
              }] : []),
            ]}
            totalCount={feedSettings.length}
            resultCount={filtered.length}
          />

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="font-display text-sm font-semibold">Feed Inventory</h3>
              <p className="text-xs text-muted-foreground">Stock coverage compared to projected demand for active batches.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Price / Bag</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="w-48">Coverage vs. Forecast</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => {
                  const stock = toNum(s.stockBags);
                  const used = usageBySetting.get(s.id) ?? 0;
                  const need = projectedNeedBySetting.get(s.id) ?? 0;
                  const coverage = need === 0 ? 100 : Math.min(100, (stock / need) * 100);
                  const shortage = Math.max(0, need - stock);
                  const status = stockStatus(stock);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.brand}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{s.feedType}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{stock.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">bags</span></TableCell>
                      <TableCell className="text-right tabular-nums">R{toNum(s.pricePerBag).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary font-semibold">R{(stock * toNum(s.pricePerBag)).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{used.toLocaleString()}</TableCell>
                      <TableCell>
                        {need === 0 ? (
                          <span className="text-xs text-muted-foreground">No active demand</span>
                        ) : (
                          <div className="space-y-1">
                            <Progress value={coverage} className={`h-2 ${shortage > 0 ? '[&>div]:bg-destructive' : ''}`} />
                            <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                              <span>{stock}/{need} bags</span>
                              {shortage > 0 ? (
                                <span className="text-destructive font-semibold flex items-center gap-1">
                                  <TrendingDown className="h-3 w-3" /> short {shortage}
                                </span>
                              ) : (
                                <span className="text-primary">covered</span>
                              )}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(status)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openRestock(s)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Restock
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      No inventory items match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!restockTarget} onOpenChange={o => { if (!o) setRestockTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock {restockTarget?.brand} — {restockTarget?.feedType}</DialogTitle>
          </DialogHeader>
          {restockTarget && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 p-3 text-sm flex justify-between">
                <span className="text-muted-foreground">Current stock</span>
                <span className="font-semibold">{toNum(restockTarget.stockBags)} bags</span>
              </div>
              <div>
                <Label>Bags to add *</Label>
                <Input type="number" min="1" step="1" value={restockAmount} onChange={e => setRestockAmount(e.target.value.replace('-', ''))} placeholder="e.g. 20" />
              </div>
              <div>
                <Label>New price per bag (R)</Label>
                <Input type="number" min="0" step="0.01" value={restockCost} onChange={e => setRestockCost(e.target.value.replace('-', ''))} />
                <p className="text-[11px] text-muted-foreground mt-1">Updates unit price if different from current.</p>
              </div>
              <Button className="w-full" onClick={doRestock} disabled={!restockAmount || Number(restockAmount) <= 0}>
                Add {restockAmount || 0} bags to inventory
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
