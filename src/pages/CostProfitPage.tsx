import { useState, useMemo } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle, TrendingUp, TrendingDown, DollarSign, Bird, Eye, Wheat, Heart, Package, BarChart3, PiggyBank, Activity, CalendarRange, ArrowUpRight, ArrowDownRight, WalletCards, Sparkles, Target, CircleDollarSign, Scale, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { Progress } from '@/components/ui/progress';
import type { TimeFilter } from '@/types/farm';
import { isPaidSale, saleTotal } from '@/lib/revenue';

function filterByDate<T extends { date: string }>(records: T[], filter: TimeFilter, customStart: string, customEnd: string): T[] {
  const now = new Date();
  let start: Date;
  switch (filter) {
    case 'daily': start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case 'weekly': start = new Date(now); start.setDate(now.getDate() - 7); break;
    case 'monthly': start = new Date(now); start.setMonth(now.getMonth() - 1); break;
    case 'yearly': start = new Date(now); start.setFullYear(now.getFullYear() - 1); break;
    case 'custom':
      if (customStart && customEnd) {
        const cs = new Date(customStart); const ce = new Date(customEnd); ce.setHours(23, 59, 59);
        return records.filter(r => { const d = new Date(r.date); return d >= cs && d <= ce; });
      }
      return records;
    default: return records;
  }
  return records.filter(r => new Date(r.date) >= start);
}

type BatchAnalysis = {
  id: string; name: string; status: string;
  initialCount: number; currentCount: number; sellingPricePerUnit: number;
  purchaseCost: number; totalSold: number; feedCost: number; healthcareCost: number; otherCost: number;
  totalCost: number; totalRevenue: number; netProfit: number; profitMargin: number;
  costPerChicken: number; profitPerChicken: number; isUnprofitable: boolean;
};

export default function CostProfitPage() {
  const { batches, sales, feed, expenses, mortalityResells, collections } = useFarm();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('monthly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [viewBatch, setViewBatch] = useState<BatchAnalysis | null>(null);

  const batchAnalysis = useMemo(() => {
    const filteredSales = filterByDate(sales, timeFilter, customStart, customEnd);
    const filteredFeed = filterByDate(feed, timeFilter, customStart, customEnd);
    const filteredExpenses = filterByDate(expenses, timeFilter, customStart, customEnd);
    const filteredResells = filterByDate(mortalityResells, timeFilter, customStart, customEnd);
    const filteredCollections = filterByDate(collections, timeFilter, customStart, customEnd);

    return batches.map(b => {
      const batchSales = filteredSales.filter(s => s.batchId === b.id);
      const batchFeed = filteredFeed.filter(f => f.batchId === b.id);
      const batchExp = filteredExpenses.filter(e => e.batchId === b.id);
      const batchResells = filteredResells.filter(r => r.batchId === b.id);
      const batchColl = filteredCollections.filter(c => c.batchId === b.id);

      const purchaseCost = b.initialCount * (b.purchaseCostPerChick || 0);
      const feedCost = batchFeed.reduce((s, f) => s + f.bags * f.costPerBag, 0);
      const healthcareCost = batchExp.filter(e => e.category === 'healthcare').reduce((s, e) => s + e.amount, 0);
      const otherCost = batchExp.filter(e => e.category !== 'healthcare').reduce((s, e) => s + e.amount, 0);
      const totalCost = purchaseCost + feedCost + healthcareCost + otherCost;
      const totalSold = batchSales.reduce((s, r) => s + r.quantity, 0);
      // Only paid sales + real collections count as revenue
      const salesRevenue = batchSales.filter(isPaidSale).reduce((s, r) => s + saleTotal(r), 0)
        + batchColl.reduce((s, c) => s + c.amount, 0);
      const resellRevenue = batchResells.reduce((s, r) => s + r.totalAmount, 0);
      const totalRevenue = salesRevenue + resellRevenue;
      const netProfit = totalRevenue - totalCost;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
      const costPerChicken = b.initialCount > 0 ? totalCost / b.initialCount : 0;
      const profitPerChicken = totalSold > 0 ? netProfit / totalSold : 0;
      const isUnprofitable = totalCost > 0 && netProfit < 0;

      return {
        id: b.id, name: b.name, status: b.status,
        initialCount: b.initialCount, currentCount: b.currentCount,
        sellingPricePerUnit: b.sellingPricePerUnit,
        purchaseCost, totalSold, feedCost, healthcareCost, otherCost,
        totalCost, totalRevenue, netProfit, profitMargin,
        costPerChicken, profitPerChicken, isUnprofitable,
      };
    });
  }, [batches, sales, feed, expenses, mortalityResells, collections, timeFilter, customStart, customEnd]);

  const totals = useMemo(() => batchAnalysis.reduce(
    (acc, b) => ({
      totalCost: acc.totalCost + b.totalCost, totalRevenue: acc.totalRevenue + b.totalRevenue, netProfit: acc.netProfit + b.netProfit,
      purchaseCost: acc.purchaseCost + b.purchaseCost, feedCost: acc.feedCost + b.feedCost,
      healthcareCost: acc.healthcareCost + b.healthcareCost, otherCost: acc.otherCost + b.otherCost,
    }),
    { totalCost: 0, totalRevenue: 0, netProfit: 0, purchaseCost: 0, feedCost: 0, healthcareCost: 0, otherCost: 0 }
  ), [batchAnalysis]);

  const overallMargin = totals.totalRevenue > 0 ? (totals.netProfit / totals.totalRevenue) * 100 : 0;
  const unprofitableBatches = batchAnalysis.filter(b => b.isUnprofitable);
  const profitableBatches = batchAnalysis.filter(b => b.totalRevenue > 0 && b.netProfit >= 0);
  const bestBatch = [...batchAnalysis].sort((a, b) => b.netProfit - a.netProfit)[0];
  const costBreakdown = [
    { name: 'Chicks', value: totals.purchaseCost, color: 'hsl(151,48%,32%)' },
    { name: 'Feed', value: totals.feedCost, color: 'hsl(36,76%,52%)' },
    { name: 'Healthcare', value: totals.healthcareCost, color: 'hsl(207,62%,49%)' },
    { name: 'Other', value: totals.otherCost, color: 'hsl(267,42%,52%)' },
  ].filter(item => item.value > 0);
  const periodLabel = timeFilter === 'daily' ? 'Today' : timeFilter === 'weekly' ? 'Last 7 days' : timeFilter === 'monthly' ? 'Last 30 days' : timeFilter === 'yearly' ? 'Last 12 months' : customStart && customEnd ? `${customStart} – ${customEnd}` : 'Custom range';

  const getMarginColor = (margin: number) => {
    if (margin > 30) return 'text-primary';
    if (margin > 15) return 'text-primary';
    if (margin > 0) return 'text-secondary';
    return 'text-destructive';
  };

  const getMarginLabel = (margin: number) => {
    if (margin > 30) return 'Excellent';
    if (margin > 15) return 'Good';
    if (margin > 0) return 'Average';
    return 'Poor';
  };

  const statusColor = (s: string) => s === 'active' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-6">
      {/* Profitability command header */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.10] via-card to-secondary/[0.08] p-5 md:p-6">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary/[0.06]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3 gap-1.5"><Sparkles className="h-3.5 w-3.5" />Profitability intelligence</Badge>
            <h2 className="font-display text-2xl font-extrabold md:text-3xl">Cost &amp; profit overview</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Understand where every rand goes and which flocks are creating value.</p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-card/85 p-3 shadow-sm backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5 text-primary" /> Analysis period
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={timeFilter} onValueChange={v => setTimeFilter(v as TimeFilter)}>
                <SelectTrigger className="w-[155px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Today</SelectItem>
                  <SelectItem value="weekly">Last 7 days</SelectItem>
                  <SelectItem value="monthly">Last 30 days</SelectItem>
                  <SelectItem value="yearly">Last 12 months</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {timeFilter === 'custom' && (
                <>
                  <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-[145px]" aria-label="Start date" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-[145px]" aria-label="End date" />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Primary financial KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <FinancialKpi
          label="Total revenue"
          value={`R${totals.totalRevenue.toLocaleString()}`}
          detail={`${periodLabel} · paid & collected`}
          icon={WalletCards}
          tone="green"
        />
        <FinancialKpi
          label="Total costs"
          value={`R${totals.totalCost.toLocaleString()}`}
          detail={`${costBreakdown.length} cost categories`}
          icon={DollarSign}
          tone="neutral"
        />
        <FinancialKpi
          label="Net profit"
          value={`R${totals.netProfit.toLocaleString()}`}
          detail={totals.netProfit >= 0 ? 'Positive return' : 'Operating at a loss'}
          icon={totals.netProfit >= 0 ? ArrowUpRight : ArrowDownRight}
          tone={totals.netProfit >= 0 ? 'green' : 'red'}
        />
        <FinancialKpi
          label="Profit margin"
          value={`${overallMargin.toFixed(1)}%`}
          detail={`${getMarginLabel(overallMargin)} · ${profitableBatches.length}/${batchAnalysis.length} profitable`}
          icon={Activity}
          tone={overallMargin > 0 ? 'green' : 'red'}
        />
      </div>

      {/* Loss attention panel */}
      {unprofitableBatches.length > 0 && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/[0.055] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-bold">{unprofitableBatches.length} batch{unprofitableBatches.length === 1 ? '' : 'es'} need attention</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Review cost drivers and collection status for loss-making flocks.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {unprofitableBatches.map(batch => (
                <button key={batch.id} onClick={() => setViewBatch(batch)} className="rounded-lg border border-destructive/20 bg-card px-3 py-1.5 text-xs font-semibold text-destructive shadow-sm hover:bg-destructive/5">
                  {batch.name}: -R{Math.abs(batch.netProfit).toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cost composition and batch performance */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm xl:col-span-2">
          <div className="border-b px-5 py-4">
            <h3 className="font-display font-bold">Cost composition</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">How total operating cost is distributed</p>
          </div>
          <div className="grid items-center gap-2 p-5 sm:grid-cols-[190px_1fr] xl:grid-cols-1 2xl:grid-cols-[190px_1fr]">
            <div className="relative h-[180px]">
              {costBreakdown.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={costBreakdown} dataKey="value" nameKey="name" innerRadius={53} outerRadius={76} paddingAngle={3} stroke="none" isAnimationActive={false}>
                      {costBreakdown.map(item => <Cell key={item.name} fill={item.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => `R${value.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No cost data</div>}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
                <span className="font-display text-lg font-extrabold">R{totals.totalCost.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {costBreakdown.map(item => {
                const share = totals.totalCost ? item.value / totals.totalCost * 100 : 0;
                return (
                  <div key={item.name}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                      <span className="font-semibold tabular-nums">R{item.value.toLocaleString()} <span className="font-normal text-muted-foreground">({share.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: item.color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm xl:col-span-3">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h3 className="font-display font-bold">Profit by batch</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Revenue, cost and net result comparison</p>
            </div>
            {bestBatch && <Badge variant="outline" className="hidden sm:inline-flex">Best: {bestBatch.name}</Badge>}
          </div>
          <div className="h-[300px] p-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={batchAnalysis} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.65} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={value => `R${Number(value) / 1000}k`} />
                <Tooltip formatter={(value: number, name: string) => [`R${value.toLocaleString()}`, name]} cursor={{ fill: 'hsl(var(--muted) / .35)' }} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" opacity={0.45} />
                <Bar dataKey="totalRevenue" name="Revenue" fill="hsl(151, 48%, 32%)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="totalCost" name="Cost" fill="hsl(36, 76%, 52%)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="netProfit" name="Net profit" fill="hsl(207, 62%, 49%)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {batches.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center"><Bird className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" /><p className="text-muted-foreground">Add batches and record expenses/sales to see analysis.</p></div>
      ) : (
        /* Per-Batch Profit Table */
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display font-bold">Per-batch profitability</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Select a batch to inspect its cost structure and performance.</p>
            </div>
            <Badge variant="outline" className="w-fit text-xs">{batchAnalysis.length} batches</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Cost/Bird</TableHead>
                  <TableHead className="text-center w-20">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchAnalysis.map(b => (
                  <TableRow key={b.id} className={b.isUnprofitable ? 'bg-destructive/5' : ''}>
                    <TableCell className="font-medium">
                      {b.name}
                      {b.isUnprofitable && <AlertTriangle className="inline h-3.5 w-3.5 text-destructive ml-1.5" />}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={`capitalize text-xs ${statusColor(b.status)}`}>{b.status}</Badge></TableCell>
                    <TableCell className="text-right font-medium">R{b.totalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium text-primary">R{b.totalRevenue.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-bold ${b.netProfit < 0 ? 'text-destructive' : 'text-primary'}`}>R{b.netProfit.toLocaleString()}</TableCell>
                    <TableCell className={`text-right ${getMarginColor(b.profitMargin)}`}>{b.profitMargin.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">R{b.costPerChicken.toFixed(0)}</TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setViewBatch(b)}>
                        <Eye className="h-4 w-4 mr-1" />View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Immersive batch profitability detail */}
      <Dialog open={!!viewBatch} onOpenChange={open => { if (!open) setViewBatch(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl gap-0 overflow-hidden p-0">
          {viewBatch && (
            <Tabs defaultValue="summary" className="flex min-h-0 w-full flex-col">
              <div className={`relative overflow-hidden border-b px-6 pb-5 pt-6 ${viewBatch.netProfit >= 0 ? 'bg-gradient-to-br from-primary/[0.12] via-card to-card' : 'bg-gradient-to-br from-destructive/[0.11] via-card to-card'}`}>
                <div className={`absolute -right-12 -top-16 h-44 w-44 rounded-full ${viewBatch.netProfit >= 0 ? 'bg-primary/[0.07]' : 'bg-destructive/[0.07]'}`} />
                <DialogHeader className="relative pr-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${viewBatch.netProfit >= 0 ? 'bg-primary/10 text-primary ring-primary/15' : 'bg-destructive/10 text-destructive ring-destructive/15'}`}>
                        <Bird className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <DialogTitle className="font-display text-xl font-extrabold">{viewBatch.name}</DialogTitle>
                          <Badge variant="outline" className={`capitalize text-[10px] ${statusColor(viewBatch.status)}`}>{viewBatch.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Detailed profitability and unit economics for this flock</p>
                      </div>
                    </div>
                    <div className={`w-fit rounded-xl border px-4 py-2.5 text-left shadow-sm sm:text-right ${viewBatch.netProfit >= 0 ? 'border-primary/20 bg-primary/[0.07]' : 'border-destructive/20 bg-destructive/[0.07]'}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Net result</p>
                      <p className={`mt-0.5 font-display text-xl font-extrabold tabular-nums ${viewBatch.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {viewBatch.netProfit >= 0 ? '+' : '−'}R{Math.abs(viewBatch.netProfit).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </DialogHeader>
              </div>

              <div className="border-b bg-muted/20 px-5 py-3">
                <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl bg-muted/70 p-1">
                  <TabsTrigger value="summary" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm sm:text-sm"><BarChart3 className="h-3.5 w-3.5" /> Overview</TabsTrigger>
                  <TabsTrigger value="costs" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm sm:text-sm"><PiggyBank className="h-3.5 w-3.5" /> Cost drivers</TabsTrigger>
                  <TabsTrigger value="performance" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm sm:text-sm"><Activity className="h-3.5 w-3.5" /> Performance</TabsTrigger>
                </TabsList>
              </div>

              <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
                <TabsContent value="summary" className="mt-0 space-y-5">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <DialogMetric label="Revenue" value={`R${viewBatch.totalRevenue.toLocaleString()}`} icon={WalletCards} tone="green" />
                    <DialogMetric label="Total cost" value={`R${viewBatch.totalCost.toLocaleString()}`} icon={DollarSign} tone="amber" />
                    <DialogMetric label="Margin" value={`${viewBatch.profitMargin.toFixed(1)}%`} icon={Target} tone={viewBatch.profitMargin >= 0 ? 'green' : 'red'} />
                    <DialogMetric label="Cost / bird" value={`R${viewBatch.costPerChicken.toFixed(0)}`} icon={Scale} tone="neutral" />
                  </div>

                  <div className="grid gap-4 md:grid-cols-5">
                    <div className="rounded-2xl border bg-muted/20 p-4 md:col-span-3">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">Revenue versus cost</p>
                          <p className="text-[11px] text-muted-foreground">Financial position for the selected period</p>
                        </div>
                        <Badge variant="outline" className={getMarginColor(viewBatch.profitMargin)}>{getMarginLabel(viewBatch.profitMargin)}</Badge>
                      </div>
                      <ComparisonBar label="Revenue" value={viewBatch.totalRevenue} max={Math.max(viewBatch.totalRevenue, viewBatch.totalCost)} color="bg-primary" />
                      <ComparisonBar label="Cost" value={viewBatch.totalCost} max={Math.max(viewBatch.totalRevenue, viewBatch.totalCost)} color="bg-secondary" />
                      <div className={`mt-4 flex items-center justify-between rounded-xl border p-3 ${viewBatch.netProfit >= 0 ? 'border-primary/15 bg-primary/[0.06]' : 'border-destructive/15 bg-destructive/[0.06]'}`}>
                        <span className="flex items-center gap-2 text-xs font-semibold">
                          {viewBatch.netProfit >= 0 ? <ArrowUpRight className="h-4 w-4 text-primary" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />}
                          Net {viewBatch.netProfit >= 0 ? 'gain' : 'loss'}
                        </span>
                        <span className={`font-display text-lg font-extrabold ${viewBatch.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>R{Math.abs(viewBatch.netProfit).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-card p-4 md:col-span-2">
                      <p className="text-sm font-bold">Flock snapshot</p>
                      <p className="mb-4 text-[11px] text-muted-foreground">Bird movement and unit return</p>
                      <div className="space-y-3">
                        <SnapshotRow label="Initial birds" value={viewBatch.initialCount.toLocaleString()} />
                        <SnapshotRow label="Current birds" value={viewBatch.currentCount.toLocaleString()} />
                        <SnapshotRow label="Birds sold" value={viewBatch.totalSold.toLocaleString()} />
                        <SnapshotRow label="Profit / sold bird" value={`R${viewBatch.profitPerChicken.toFixed(0)}`} valueClass={viewBatch.profitPerChicken >= 0 ? 'text-primary' : 'text-destructive'} />
                        <SnapshotRow label="Selling price" value={`R${viewBatch.sellingPricePerUnit.toLocaleString()}`} />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="costs" className="mt-0 space-y-5">
                  <div>
                    <h3 className="font-display text-base font-bold">Cost allocation</h3>
                    <p className="text-xs text-muted-foreground">See which inputs contribute most to this batch's total cost.</p>
                  </div>
                  <div className="space-y-3">
                    <CostDriver icon={Package} label="Chick purchases" value={viewBatch.purchaseCost} total={viewBatch.totalCost} color="bg-primary" />
                    <CostDriver icon={Wheat} label="Feed" value={viewBatch.feedCost} total={viewBatch.totalCost} color="bg-secondary" />
                    <CostDriver icon={Heart} label="Healthcare" value={viewBatch.healthcareCost} total={viewBatch.totalCost} color="bg-chart-blue" />
                    <CostDriver icon={DollarSign} label="Other operating costs" value={viewBatch.otherCost} total={viewBatch.totalCost} color="bg-chart-purple" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-4">
                    <MiniMetric label="Total cost" value={`R${viewBatch.totalCost.toLocaleString()}`} />
                    <MiniMetric label="Cost / bird" value={`R${viewBatch.costPerChicken.toFixed(2)}`} />
                    <MiniMetric label="Revenue" value={`R${viewBatch.totalRevenue.toLocaleString()}`} valueClass="text-primary" />
                    <MiniMetric label="Difference" value={`${viewBatch.netProfit >= 0 ? '+' : '−'}R${Math.abs(viewBatch.netProfit).toLocaleString()}`} valueClass={viewBatch.netProfit >= 0 ? 'text-primary' : 'text-destructive'} />
                  </div>
                </TabsContent>

                <TabsContent value="performance" className="mt-0 space-y-5">
                  <div className={`relative overflow-hidden rounded-2xl border p-5 ${viewBatch.isUnprofitable ? 'border-destructive/20 bg-destructive/[0.055]' : 'border-primary/20 bg-primary/[0.055]'}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${viewBatch.isUnprofitable ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                          {viewBatch.isUnprofitable ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Profitability status</p>
                          <p className={`font-display text-xl font-extrabold ${viewBatch.isUnprofitable ? 'text-destructive' : 'text-primary'}`}>{viewBatch.isUnprofitable ? 'Needs attention' : 'Profitable'}</p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-muted-foreground">Net result</p>
                        <p className={`font-display text-2xl font-extrabold ${viewBatch.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>{viewBatch.netProfit >= 0 ? '+' : '−'}R{Math.abs(viewBatch.netProfit).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold">Profit margin</p>
                        <p className="text-[11px] text-muted-foreground">Revenue retained after all recorded costs</p>
                      </div>
                      <span className={`font-display text-xl font-extrabold ${getMarginColor(viewBatch.profitMargin)}`}>{viewBatch.profitMargin.toFixed(1)}%</span>
                    </div>
                    <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full transition-all ${viewBatch.profitMargin >= 0 ? 'bg-primary' : 'bg-destructive'}`} style={{ width: `${Math.min(100, Math.max(2, Math.abs(viewBatch.profitMargin)))}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>0%</span><span>Healthy target: 15%+</span><span>100%</span></div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniMetric label="Margin rating" value={getMarginLabel(viewBatch.profitMargin)} valueClass={getMarginColor(viewBatch.profitMargin)} />
                    <MiniMetric label="Birds sold" value={viewBatch.totalSold.toLocaleString()} />
                    <MiniMetric label="Profit / bird" value={`R${viewBatch.profitPerChicken.toFixed(0)}`} valueClass={viewBatch.profitPerChicken >= 0 ? 'text-primary' : 'text-destructive'} />
                    <MiniMetric label="Current flock" value={viewBatch.currentCount.toLocaleString()} />
                  </div>

                  <div className="rounded-2xl border border-secondary/20 bg-secondary/[0.06] p-4">
                    <p className="flex items-center gap-2 text-sm font-bold"><CircleDollarSign className="h-4 w-4 text-secondary" />Management insight</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {viewBatch.isUnprofitable
                        ? `This batch needs R${Math.abs(viewBatch.netProfit).toLocaleString()} in additional collected revenue or equivalent cost reductions to break even. Review feed usage, unpaid sales and other expenses.`
                        : `This batch is generating a positive return of R${viewBatch.netProfit.toLocaleString()}. Protect the ${viewBatch.profitMargin.toFixed(1)}% margin by monitoring feed cost and maintaining collection discipline.`}
                    </p>
                  </div>
                </TabsContent>
              </div>

              <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
                <p className="hidden text-[11px] text-muted-foreground sm:block">Figures reflect the selected analysis period.</p>
                <Button className="ml-auto min-w-24" onClick={() => setViewBatch(null)}>Done</Button>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DialogMetric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof DollarSign; tone: 'green' | 'red' | 'amber' | 'neutral' }) {
  const style = tone === 'red' ? 'bg-destructive/10 text-destructive' : tone === 'amber' ? 'bg-secondary/15 text-secondary' : tone === 'green' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground';
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
      <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${style}`}><Icon className="h-4 w-4" /></div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-extrabold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

function ComparisonBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(2, value / max * 100) : 0;
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium text-muted-foreground">{label}</span><span className="font-bold tabular-nums">R{value.toLocaleString()}</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} /></div>
    </div>
  );
}

function SnapshotRow({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return <div className="flex items-center justify-between border-b border-border/60 pb-2.5 last:border-0 last:pb-0"><span className="text-xs text-muted-foreground">{label}</span><span className={`text-sm font-bold tabular-nums ${valueClass}`}>{value}</span></div>;
}

function CostDriver({ icon: Icon, label, value, total, color }: { icon: typeof DollarSign; label: string; value: number; total: number; color: string }) {
  const share = total > 0 ? value / total * 100 : 0;
  return (
    <div className="rounded-xl border border-border/70 bg-muted/15 p-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-sm"><Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-xs font-semibold">{label}</span><span className="text-sm font-bold tabular-nums">R{value.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{share.toFixed(1)}%</span></span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: `${share}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return <div className="rounded-xl border border-border/70 bg-card p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1.5 text-sm font-extrabold tabular-nums ${valueClass}`}>{value}</p></div>;
}

function FinancialKpi({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof DollarSign;
  tone: 'green' | 'red' | 'neutral';
}) {
  const iconStyle = tone === 'red'
    ? 'bg-destructive/10 text-destructive ring-destructive/10'
    : tone === 'green'
      ? 'bg-primary/10 text-primary ring-primary/10'
      : 'bg-secondary/15 text-secondary ring-secondary/10';
  const valueStyle = tone === 'red' ? 'text-destructive' : tone === 'green' ? 'text-foreground' : 'text-foreground';
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md sm:p-5">
      <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-primary/[0.035] transition-transform group-hover:scale-125" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className={`mt-2 truncate font-display text-xl font-extrabold tabular-nums sm:text-2xl ${valueStyle}`}>{value}</p>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{detail}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${iconStyle}`}><Icon className="h-4.5 w-4.5" /></div>
      </div>
    </div>
  );
}
