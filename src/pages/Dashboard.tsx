import { useFarm } from '@/contexts/FarmContext';
import StatCard from '@/components/StatCard';
import { Bird, Skull, ShoppingCart, DollarSign, Wheat, AlertTriangle, TrendingUp, Package, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { receivedRevenue, isPaidSale, saleTotal } from '@/lib/revenue';
import { toNum } from '@/lib/num';
import { remainingHarvestStock, harvestStockRemainingForBatch } from '@/lib/harvest';
import CustomerCollectionsBreakdown from '@/components/CustomerCollectionsBreakdown';
import { DataFilter, applyDataFilter, type SelectFilterConfig } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';
import { useMemo } from 'react';

const COLORS = ['hsl(142,40%,32%)', 'hsl(36,60%,52%)', 'hsl(0,65%,50%)', 'hsl(210,50%,50%)', 'hsl(270,40%,50%)'];

export default function Dashboard() {
  const { batches, mortality, mortalityResells, sales, collections, feed, expenses, feedSettings, harvests } = useFarm();

  // ---- Batch filter (search / start date / status / breed) ----
  const [batchFilter, setBatchFilter] = useFilterState('dashboard-batches');
  const batchSelects = useMemo<SelectFilterConfig[]>(() => {
    const breeds = [...new Set(batches.map(b => b.breed).filter(Boolean))].sort();
    return [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'closed', label: 'Closed' },
          { value: 'sold', label: 'Sold' },
          { value: 'archived', label: 'Archived' },
        ],
      },
      { key: 'breed', label: 'Breed', options: breeds.map(b => ({ value: b, label: b })) },
    ];
  }, [batches]);

  const filteredBatches = useMemo(() => applyDataFilter(batches, batchFilter, {
    dateField: b => b.startDate,
    searchFields: b => [b.name, b.breed, b.status],
    selectFields: { status: b => b.status, breed: b => b.breed },
  }), [batches, batchFilter]);

  const activeBatches = batches.filter(b => b.status === 'active');
  const num = toNum;
  const totalBirds = activeBatches.reduce((s, b) => s + num(b.currentCount), 0);
  const totalMortality = mortality.reduce((s, m) => s + num(m.count), 0);
  const totalResold = mortalityResells.reduce((s, r) => s + num(r.quantity), 0);
  const recoveredFromResell = mortalityResells.reduce((s, r) => s + num(r.totalAmount), 0);
  const remainingMortalityLoss = Math.max(0, totalMortality - totalResold);
  const totalMortalityCost = mortality.reduce((s, m) => s + num(m.totalCost), 0);
  const netMortalityImpact = totalMortalityCost - recoveredFromResell;
  const totalSold = sales.reduce((s, r) => s + num(r.quantity), 0);
  const totalRevenue = receivedRevenue(sales, collections) + recoveredFromResell;
  const outstandingPending = sales.filter(s => s.paymentStatus === 'pending')
    .reduce((s, r) => s + Math.max(0, saleTotal(r) - num(r.amountCollected)), 0);
  const totalFeedCost = feed.reduce((s, f) => s + num(f.bags) * num(f.costPerBag), 0);
  const totalExpenses = expenses.reduce((s, e) => s + num(e.amount), 0) + totalFeedCost;
  const totalFeedStock = feedSettings.reduce((s, f) => s + num(f.stockBags), 0);
  const netProfit = totalRevenue - totalExpenses;

  // Estimated revenue from unsold birds
  const estRevenue = activeBatches.reduce((s, b) => s + b.currentCount * (b.sellingPricePerUnit || 0), 0);

  // Today's revenue = paid sales today + collections today
  const today = new Date().toISOString().split('T')[0];
  const todayPaid = sales.filter(s => s.date === today && isPaidSale(s)).reduce((s, r) => s + saleTotal(r), 0);
  const todayCollected = collections.filter(c => c.date === today).reduce((s, c) => s + c.amount, 0);
  const todayRevenue = todayPaid + todayCollected;

  // This month profit
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Harvest activity
  const readyForHarvest = harvests.reduce((s, h) => s + remainingHarvestStock(h, sales), 0);
  const harvestedToday = harvests.filter(h => h.date === today).reduce((s, h) => s + num(h.quantity), 0);
  const soldToday = sales.filter(s => s.date === today).reduce((s, r) => s + num(r.quantity), 0);
  const soldTodayValue = sales.filter(s => s.date === today).reduce((s, r) => s + saleTotal(r), 0);
  const activeHarvestStock = activeBatches.reduce((s, b) => s + harvestStockRemainingForBatch(b.id, harvests, sales), 0);
  const startsWithMonth = (d?: string) => typeof d === 'string' && d.startsWith(thisMonth);
  const monthPaid = sales.filter(s => startsWithMonth(s.date) && isPaidSale(s)).reduce((s, r) => s + saleTotal(r), 0);
  const monthCollected = collections.filter(c => startsWithMonth(c.date)).reduce((s, c) => s + c.amount, 0);
  const monthRevenue = monthPaid + monthCollected;
  const monthFeedCost = feed.filter(f => startsWithMonth(f.date)).reduce((s, f) => s + f.bags * f.costPerBag, 0);
  const monthExpenses = expenses.filter(e => startsWithMonth(e.date)).reduce((s, e) => s + e.amount, 0);
  const monthProfit = monthRevenue - monthFeedCost - monthExpenses;

  const batchData = filteredBatches.filter(b => b.status === 'active').map(b => ({ name: b.name, birds: b.currentCount, initial: b.initialCount }));

  const expenseByCategory = Object.entries(
    expenses.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));
  if (totalFeedCost > 0) expenseByCategory.push({ name: 'feed', value: totalFeedCost });

  const mortalityTrend = mortality.slice(-7).map(m => ({
    date: new Date(m.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    deaths: m.count,
  }));

  // Smart Business Alerts
  const alerts: { type: 'warning' | 'danger'; message: string }[] = [];
  feedSettings.forEach(fs => {
    if ((fs.stockBags || 0) <= 5) {
      alerts.push({ type: 'warning', message: `Low ${fs.brand} ${fs.feedType} stock: ${fs.stockBags || 0} bags remaining` });
    }
  });
  activeBatches.forEach(b => {
    const batchDead = mortality.filter(m => m.batchId === b.id).reduce((s, m) => s + m.count, 0);
    const rate = b.initialCount > 0 ? (batchDead / b.initialCount) * 100 : 0;
    if (rate > 5) alerts.push({ type: 'danger', message: `High mortality in ${b.name}: ${rate.toFixed(1)}% (${batchDead} birds)` });
  });
  activeBatches.forEach(b => {
    const purchaseCost = b.initialCount * (b.purchaseCostPerChick || 0);
    const bFeedCost = feed.filter(f => f.batchId === b.id).reduce((s, f) => s + f.bags * f.costPerBag, 0);
    const bExpenses = expenses.filter(e => e.batchId === b.id).reduce((s, e) => s + e.amount, 0);
    const totalCost = purchaseCost + bFeedCost + bExpenses;
    const paidRev = sales.filter(s => s.batchId === b.id && isPaidSale(s)).reduce((s, r) => s + saleTotal(r), 0);
    const colRev = collections.filter(c => c.batchId === b.id).reduce((s, c) => s + c.amount, 0);
    const revenue = paidRev + colRev;
    if (totalCost > 0 && revenue > 0 && revenue < totalCost) {
      alerts.push({ type: 'danger', message: `${b.name} is currently at a loss: Cost R${totalCost.toLocaleString()} > Revenue R${revenue.toLocaleString()}` });
    }
  });

  // Per-batch summary for table (show all batches)
  const batchSummary = filteredBatches.map(b => {
    const bSales = sales.filter(s => s.batchId === b.id);
    const bFeed = feed.filter(f => f.batchId === b.id);
    const bExp = expenses.filter(e => e.batchId === b.id);
    const bMort = mortality.filter(m => m.batchId === b.id);
    const paidRev = bSales.filter(isPaidSale).reduce((s, r) => s + saleTotal(r), 0);
    const collectedRev = collections.filter(c => c.batchId === b.id).reduce((s, c) => s + c.amount, 0);
    const revenue = paidRev + collectedRev;
    const feedCost = bFeed.reduce((s, f) => s + f.bags * f.costPerBag, 0);
    const otherCost = bExp.reduce((s, e) => s + e.amount, 0);
    const purchaseCost = b.initialCount * (b.purchaseCostPerChick || 0);
    const totalCost = purchaseCost + feedCost + otherCost;
    const profit = revenue - totalCost;
    const mortCount = bMort.reduce((s, m) => s + m.count, 0);
    const mortRate = b.initialCount > 0 ? (mortCount / b.initialCount * 100) : 0;
    return { ...b, revenue, feedCost, totalCost, profit, mortCount, mortRate, sold: bSales.reduce((s, r) => s + r.quantity, 0) };
  });

  return (
    <div className="space-y-6">
      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 5).map((alert, i) => (
            <div key={i} className={`rounded-lg p-3 flex items-center gap-2 text-sm ${
              alert.type === 'danger' ? 'bg-destructive/10 border border-destructive/20 text-destructive' : 'bg-warning/10 border border-warning/20 text-warning'
            }`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Key Financial Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 stat-card-hover">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/10"><Bird className="h-4 w-4 text-primary" /></div>
            <span className="text-xs font-medium text-muted-foreground">Active Birds</span>
          </div>
          <p className="text-xl font-bold font-display">{totalBirds.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{activeBatches.length} batches</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 stat-card-hover">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/10"><TrendingUp className="h-4 w-4 text-primary" /></div>
            <span className="text-xs font-medium text-muted-foreground">Est. Revenue</span>
          </div>
          <p className="text-xl font-bold font-display">R{estRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">from unsold birds</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 stat-card-hover">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-secondary/10"><Wheat className="h-4 w-4 text-secondary" /></div>
            <span className="text-xs font-medium text-muted-foreground">Feed Cost</span>
          </div>
          <p className="text-xl font-bold font-display">R{totalFeedCost.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{totalFeedStock} bags in stock</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 stat-card-hover">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/10"><ShoppingCart className="h-4 w-4 text-primary" /></div>
            <span className="text-xs font-medium text-muted-foreground">Total Revenue</span>
          </div>
          <p className="text-xl font-bold font-display">R{totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{totalSold} birds sold{outstandingPending > 0 ? ` · R${outstandingPending.toLocaleString()} pending` : ''}</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 stat-card-hover">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-destructive/10"><DollarSign className="h-4 w-4 text-destructive" /></div>
            <span className="text-xs font-medium text-muted-foreground">Total Expenses</span>
          </div>
          <p className="text-xl font-bold font-display">R{totalExpenses.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">all costs</p>
        </div>

        <div className={`rounded-xl border p-4 stat-card-hover ${netProfit >= 0 ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-lg ${netProfit >= 0 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
              {netProfit >= 0 ? <ArrowUpRight className="h-4 w-4 text-primary" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />}
            </div>
            <span className="text-xs font-medium text-muted-foreground">Net Profit</span>
          </div>
          <p className={`text-xl font-bold font-display ${netProfit < 0 ? 'text-destructive' : 'text-primary'}`}>R{netProfit.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{netProfit >= 0 ? 'Profitable' : 'Loss'}</p>
        </div>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total Mortality" value={totalMortality.toLocaleString()} icon={Skull} />
        <StatCard title="Today's Revenue" value={`R${todayRevenue.toLocaleString()}`} icon={DollarSign} />
        <StatCard title="Month Profit" value={`R${monthProfit.toLocaleString()}`} icon={TrendingUp} trendUp={monthProfit > 0} trend={monthProfit > 0 ? 'Profitable' : monthProfit < 0 ? 'Loss' : ''} />
        <StatCard title="Feed Stock" value={`${totalFeedStock} bags`} icon={Package} />
      </div>

      {/* Harvest & Sales Activity */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Ready for Harvest" value={readyForHarvest.toLocaleString()} icon={Wheat} trend="unsold harvested birds" />
        <StatCard title="Harvested Today" value={harvestedToday.toLocaleString()} icon={Bird} trend="birds" />
        <StatCard title="Sold Today" value={soldToday.toLocaleString()} icon={ShoppingCart} trend={`R${soldTodayValue.toLocaleString()}`} />
        <StatCard title="Active Harvest Stock" value={activeHarvestStock.toLocaleString()} icon={Package} trend="in active batches" />
      </div>

      <CustomerCollectionsBreakdown />

      {/* Mortality Resell Summary */}
      {totalMortality > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Skull className="h-4 w-4 text-destructive" />
            <h3 className="font-display text-sm font-semibold">Mortality &amp; Resell</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-border">
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Total Dead</p>
              <p className="text-lg font-bold tabular-nums">{totalMortality}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Resold</p>
              <p className="text-lg font-bold text-primary tabular-nums">{totalResold}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Remaining Loss</p>
              <p className="text-lg font-bold text-destructive tabular-nums">{remainingMortalityLoss}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Recovered</p>
              <p className="text-lg font-bold text-success tabular-nums">R{recoveredFromResell.toLocaleString()}</p>
            </div>
            <div className="p-3 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-muted-foreground">Net Impact</p>
              <p className={`text-lg font-bold tabular-nums ${netMortalityImpact <= 0 ? 'text-success' : 'text-destructive'}`}>R{netMortalityImpact.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Batch filter */}
      {batches.length > 0 && (
        <DataFilter
          value={batchFilter}
          onChange={setBatchFilter}
          searchPlaceholder="Search batches by name, breed or status…"
          selects={batchSelects}
          resultCount={filteredBatches.length}
          totalCount={batches.length}
        />
      )}

      {/* Batch Performance Table */}
      {batchSummary.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Batch Performance</h3>
            <Badge variant="outline" className="text-xs">{batchSummary.length} batches</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Birds</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Mortality</TableHead>
                  <TableHead className="text-right">Feed Cost</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchSummary.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize text-xs ${b.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground'}`}>{b.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground">{b.initialCount}</span>
                      <span className="mx-1 text-muted-foreground/50">→</span>
                      <span className="font-semibold">{b.currentCount}</span>
                    </TableCell>
                    <TableCell className="text-right">{b.sold}</TableCell>
                    <TableCell className="text-right">
                      <span className={b.mortRate > 5 ? 'text-destructive font-semibold' : ''}>{b.mortCount}</span>
                      <span className="text-muted-foreground text-xs ml-1">({b.mortRate.toFixed(1)}%)</span>
                    </TableCell>
                    <TableCell className="text-right">R{b.feedCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium text-primary">R{b.revenue.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-bold ${b.profit < 0 ? 'text-destructive' : 'text-primary'}`}>
                      R{b.profit.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : batches.length > 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No batches match the current filter.
        </div>
      ) : null}

      {/* Charts */}
      {batches.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-display text-lg font-semibold mb-4">Batch Overview</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={batchData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40,18%,88%)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="initial" fill="hsl(36,60%,52%)" radius={[4, 4, 0, 0]} name="Initial" />
                <Bar dataKey="birds" fill="hsl(142,40%,32%)" radius={[4, 4, 0, 0]} name="Current" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-display text-lg font-semibold mb-4">Mortality Trend</h3>
            {mortalityTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={mortalityTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(40,18%,88%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="deaths" stroke="hsl(0,65%,50%)" strokeWidth={2} dot={{ fill: 'hsl(0,65%,50%)' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No mortality data yet</div>
            )}
          </div>

          {expenseByCategory.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="font-display text-lg font-semibold mb-4">Expense Breakdown</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {expenseByCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `R${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {batches.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Bird className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="font-display text-xl font-semibold mb-2">Welcome to PoultryPro</h3>
          <p className="text-muted-foreground max-w-md mx-auto">Start by adding your first batch of chickens. Navigate to the Batches page to get started.</p>
        </div>
      )}
    </div>
  );
}
