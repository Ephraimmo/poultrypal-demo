import { useState, useMemo } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { Batch, FeedStrategy, WeightRecord } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarWidget } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Plus, Bird, Trash2, Pencil, AlertTriangle, Eye, TrendingUp, Target, Wheat, DollarSign, Calendar, Lock, Download, FileSpreadsheet, Info, MoreHorizontal, Printer } from 'lucide-react';
import { DataFilter, applyDataFilter, defaultFilterValue } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCan } from '@/contexts/PermissionsContext';
import { Can } from '@/components/Can';
import { useFlockScope } from '@/hooks/useFlockScope';

// Weight targets for broilers (grams)
const WEIGHT_TARGETS: Record<number, number> = { 1: 180, 2: 450, 3: 900, 4: 1500, 5: 2000, 6: 2500 };

const SLAUGHTER_INFO: Record<number, string> = { 4: 'Early Market', 5: 'Ideal', 6: 'Heavy' };

function getWeekName(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
  return `${months[date.getMonth()]} Week ${week}`;
}

function getAgeDisplay(startDate: string): string {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  if (weeks === 0) return `${totalDays} day${totalDays !== 1 ? 's' : ''}`;
  if (days === 0) return `Week ${weeks}`;
  return `Week ${weeks} + ${days} day${days !== 1 ? 's' : ''}`;
}

function getAgeDays(startDate: string): number {
  return Math.floor((new Date().getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
}

function getProfitRating(margin: number): { label: string; color: string } {
  if (margin > 30) return { label: 'Excellent', color: 'text-primary' };
  if (margin > 15) return { label: 'Good', color: 'text-primary' };
  if (margin > 5) return { label: 'Average', color: 'text-yellow-600' };
  return { label: 'Poor', color: 'text-destructive' };
}

function escapeCSV(value: string | number | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function BatchesPage() {
  const { batches: allBatches, setBatches, feedSettings, feed: allFeed, mortality: allMortality, sales: allSales, health: allHealth, weightRecords: allWeightRecords, setWeightRecords, expenses: allExpenses } = useFarm();
  const { scope } = useFlockScope();
  const canCreate = useCan('flocks', 'create');
  const canEdit = useCan('flocks', 'edit');
  const canDelete = useCan('flocks', 'delete');
  const canExport = useCan('flocks', 'export');

  // Flock-based scoping: non-admins only ever see the flocks assigned to them,
  // and every derived record (feed, mortality, sales…) is filtered to match.
  const batches = useMemo(() => scope(allBatches, b => b.id), [allBatches, scope]);
  const feed = useMemo(() => scope(allFeed, f => f.batchId), [allFeed, scope]);
  const mortality = useMemo(() => scope(allMortality, m => m.batchId), [allMortality, scope]);
  const sales = useMemo(() => scope(allSales, s => s.batchId), [allSales, scope]);
  const health = useMemo(() => scope(allHealth, h => h.batchId), [allHealth, scope]);
  const weightRecords = useMemo(() => scope(allWeightRecords, w => w.batchId), [allWeightRecords, scope]);
  const expenses = useMemo(() => scope(allExpenses, e => e.batchId), [allExpenses, scope]);
  const [filter, setFilter] = useFilterState('batches');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewBatch, setViewBatch] = useState<Batch | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [form, setForm] = useState({
    initialCount: '', breed: '', sellingPricePerUnit: '', purchaseCostPerChick: '',
    feedStrategy: 'grower_finisher' as FeedStrategy,
    starterFeedId: '', growerFeedId: '', finisherFeedId: '',
  });
  // Batch start date — auto-filled to today, but the user can pick a different date from the calendar.
  const [startDate, setStartDate] = useState<Date>(new Date());
  // Weight recording form
  const [weightForm, setWeightForm] = useState({ weightGrams: '', notes: '', date: new Date().toISOString().split('T')[0] });

  const resetForm = () => {
    setForm({
      initialCount: '', breed: '', sellingPricePerUnit: '', purchaseCostPerChick: '',
      feedStrategy: 'grower_finisher',
      starterFeedId: '', growerFeedId: '', finisherFeedId: '',
    });
    setStartDate(new Date());
  };

  const starterOptions = feedSettings.filter(s => s.feedType === 'Starter');
  const growerOptions = feedSettings.filter(s => s.feedType === 'Grower');
  const finisherOptions = feedSettings.filter(s => s.feedType === 'Finisher');
  const hasRequiredFeeds = form.feedStrategy === 'grower_only'
    ? starterOptions.length > 0 && growerOptions.length > 0
    : starterOptions.length > 0 && growerOptions.length > 0 && finisherOptions.length > 0;

  const feedCalc = useMemo(() => {
    const count = parseInt(form.initialCount) || 0;
    if (count === 0) return null;
    const starter = feedSettings.find(s => s.id === form.starterFeedId);
    const grower = feedSettings.find(s => s.id === form.growerFeedId);
    const finisher = form.feedStrategy === 'grower_finisher' ? feedSettings.find(s => s.id === form.finisherFeedId) : null;

    const calcStarter = (setting: typeof starter) => {
      if (!setting) return { bags: 0, cost: 0 };
      const bags = Math.ceil((count / 100) * setting.bagsPerHundredChickens);
      return { bags, cost: bags * setting.pricePerBag };
    };
    const calcGrower = () => {
      if (!grower) return { bags: 0, cost: 0 };
      const ratio = form.feedStrategy === 'grower_only' ? 6 : 3;
      const bags = Math.ceil((count / 100) * ratio);
      return { bags, cost: bags * grower.pricePerBag };
    };
    const calcFinisher = () => {
      if (!finisher || form.feedStrategy === 'grower_only') return { bags: 0, cost: 0 };
      const bags = Math.ceil((count / 100) * 3);
      return { bags, cost: bags * finisher.pricePerBag };
    };

    const s = calcStarter(starter);
    const g = calcGrower();
    const f = calcFinisher();
    return { starter: s, grower: g, finisher: f, totalBags: s.bags + g.bags + f.bags, totalCost: s.cost + g.cost + f.cost };
  }, [form.initialCount, form.starterFeedId, form.growerFeedId, form.finisherFeedId, form.feedStrategy, feedSettings]);

  const addBatch = () => {
    if (!form.initialCount || !hasRequiredFeeds) return;
    const autoName = getWeekName(startDate);
    const existingCount = batches.filter(b => b.name.startsWith(autoName)).length;
    const name = existingCount > 0 ? `${autoName} (${existingCount + 1})` : autoName;

    const batch: Batch = {
      id: crypto.randomUUID(), name,
      initialCount: parseInt(form.initialCount), currentCount: parseInt(form.initialCount),
      startDate: startDate.toISOString(), breed: form.breed || 'Broiler', status: 'active',
      sellingPricePerUnit: parseFloat(form.sellingPricePerUnit) || 0,
      purchaseCostPerChick: parseFloat(form.purchaseCostPerChick) || 0,
      feedStrategy: form.feedStrategy,
      feedSelections: {
        starter: form.starterFeedId, grower: form.growerFeedId,
        finisher: form.feedStrategy === 'grower_finisher' ? form.finisherFeedId : '',
      },
    };
    setBatches(prev => [...prev, batch]);
    resetForm();
    setOpen(false);
  };

  const startEdit = (batch: Batch) => {
    setEditId(batch.id);
    setForm({
      initialCount: String(batch.initialCount), breed: batch.breed,
      sellingPricePerUnit: String(batch.sellingPricePerUnit),
      purchaseCostPerChick: String(batch.purchaseCostPerChick || 0),
      feedStrategy: batch.feedStrategy || 'grower_finisher',
      starterFeedId: batch.feedSelections?.starter || '',
      growerFeedId: batch.feedSelections?.grower || '',
      finisherFeedId: batch.feedSelections?.finisher || '',
    });
    setStartDate(new Date(batch.startDate));
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editId || !form.initialCount) return;
    setBatches(prev => prev.map(b => b.id !== editId ? b : {
      ...b, initialCount: parseInt(form.initialCount),
      breed: form.breed || b.breed,
      sellingPricePerUnit: parseFloat(form.sellingPricePerUnit) || 0,
      purchaseCostPerChick: parseFloat(form.purchaseCostPerChick) || 0,
      feedStrategy: form.feedStrategy,
      startDate: startDate.toISOString(),
      feedSelections: {
        starter: form.starterFeedId || b.feedSelections?.starter || '',
        grower: form.growerFeedId || b.feedSelections?.grower || '',
        finisher: form.feedStrategy === 'grower_finisher' ? (form.finisherFeedId || b.feedSelections?.finisher || '') : '',
      },
    }));
    resetForm(); setEditId(null); setEditOpen(false);
  };

  const confirmDelete = () => {
    if (deleteId) {
      setBatches(prev => prev.filter(b => b.id !== deleteId));
      setDeleteId(null);
    }
  };

  const confirmClose = () => {
    if (closeId) {
      setBatches(prev => prev.map(b => b.id === closeId ? { ...b, status: 'closed' as const } : b));
      setCloseId(null);
    }
  };

  const addWeightRecord = () => {
    if (!viewBatch || !weightForm.weightGrams) return;
    const record: WeightRecord = {
      id: crypto.randomUUID(),
      batchId: viewBatch.id,
      date: weightForm.date,
      weightGrams: parseFloat(weightForm.weightGrams),
      notes: weightForm.notes,
    };
    setWeightRecords(prev => [...prev, record]);
    setWeightForm({ weightGrams: '', notes: '', date: new Date().toISOString().split('T')[0] });
  };

  const statusColor = (s: string) => s === 'active' ? 'bg-primary/10 text-primary border-primary/20' : s === 'closed' ? 'bg-muted text-muted-foreground' : s === 'sold' ? 'bg-secondary/10 text-secondary border-secondary/20' : 'bg-muted text-muted-foreground';
  const getFeedName = (id: string) => { const s = feedSettings.find(f => f.id === id); return s ? `${s.brand} ${s.feedType}` : '—'; };
  const getStrategyLabel = (s?: FeedStrategy) => s === 'grower_only' ? 'Grower Only' : 'Grower + Finisher';

  const filteredBatches = useMemo(() => applyDataFilter(batches, filter, {
    dateField: b => b.startDate,
    searchFields: b => [b.name, b.breed],
    selectFields: { status: b => b.status },
  }), [batches, filter]);

  const getBatchFeedUsed = (id: string) => feed.filter(f => f.batchId === id).reduce((s, f) => s + f.bags, 0);
  const getBatchMortality = (id: string) => mortality.filter(m => m.batchId === id).reduce((s, m) => s + m.count, 0);
  const getBatchRevenue = (id: string) => sales.filter(s => s.batchId === id).reduce((s, r) => s + r.quantity * r.pricePerUnit, 0);
  const getBatchFeedCost = (id: string) => feed.filter(f => f.batchId === id).reduce((s, f) => s + f.bags * f.costPerBag, 0);
  const getBatchSoldQty = (id: string) => sales.filter(s => s.batchId === id).reduce((s, r) => s + r.quantity, 0);

  /**
   * Estimated revenue for a batch:
   *  Actual sales revenue so far + potential revenue from remaining live birds
   *  at the batch's target selling price. This projects the total the batch
   *  can bring in if all remaining birds sell at the expected price.
   */
  const getBatchEstRevenue = (batch: Batch) => {
    const realized = getBatchRevenue(batch.id);
    const sold = getBatchSoldQty(batch.id);
    const unsold = Math.max(0, batch.currentCount - Math.max(0, sold - (batch.initialCount - batch.currentCount)));
    // Simpler: remaining live birds are the ones left to sell.
    const remainingBirds = Math.max(0, batch.currentCount);
    const projected = remainingBirds * (batch.sellingPricePerUnit || 0);
    return { realized, projected, total: realized + projected };
  };

  const getBatchProfit = (batch: Batch) => {
    const purchaseCost = batch.initialCount * (batch.purchaseCostPerChick || 0);
    const feedCost = getBatchFeedCost(batch.id);
    const otherExp = expenses.filter(e => e.batchId === batch.id && e.category !== 'feed').reduce((s, e) => s + e.amount, 0);
    const feedExpenses = expenses.filter(e => e.batchId === batch.id && e.category === 'feed').reduce((s, e) => s + e.amount, 0);
    const totalCost = purchaseCost + feedCost + otherExp + feedExpenses;
    const revenue = getBatchRevenue(batch.id);
    return revenue - totalCost;
  };

  const warningBanner = (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
      <p className="text-sm text-yellow-800 dark:text-yellow-200">
        <span className="font-semibold">Warning:</span> Feed calculations are estimates based on the number of chickens entered. Actual feed usage may vary depending on chicken growth, environment, and management practices.
      </p>
    </div>
  );

  const feedSelectionFields = (
    <>
      <div>
        <Label>Feed Strategy</Label>
        <Select value={form.feedStrategy} onValueChange={v => setForm(f => ({ ...f, feedStrategy: v as FeedStrategy, finisherFeedId: v === 'grower_only' ? '' : f.finisherFeedId }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="grower_only">Grower Only (6 bags / 100 chickens)</SelectItem>
            <SelectItem value="grower_finisher">Grower + Finisher (3 + 3 bags / 100 chickens)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Starter Feed</Label>
        <Select value={form.starterFeedId} onValueChange={v => setForm(f => ({ ...f, starterFeedId: v }))}>
          <SelectTrigger><SelectValue placeholder="Select starter feed" /></SelectTrigger>
          <SelectContent>{starterOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.brand} — R{s.pricePerBag}/bag</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Grower Feed</Label>
        <Select value={form.growerFeedId} onValueChange={v => setForm(f => ({ ...f, growerFeedId: v }))}>
          <SelectTrigger><SelectValue placeholder="Select grower feed" /></SelectTrigger>
          <SelectContent>{growerOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.brand} — R{s.pricePerBag}/bag</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {form.feedStrategy === 'grower_finisher' && (
        <div>
          <Label>Finisher Feed</Label>
          <Select value={form.finisherFeedId} onValueChange={v => setForm(f => ({ ...f, finisherFeedId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select finisher feed" /></SelectTrigger>
            <SelectContent>{finisherOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.brand} — R{s.pricePerBag}/bag</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
    </>
  );

  const formFields = (
    <div className="space-y-4 pt-2">
      {warningBanner}
      <div>
        <Label>Start Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start font-normal">
              <Calendar className="h-4 w-4 mr-2 opacity-50" />
              {format(startDate, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarWidget
              mode="single"
              selected={startDate}
              onSelect={d => d && setStartDate(d)}
              disabled={date => date > new Date()}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground mt-1">Defaults to today — pick a date if this batch started earlier.</p>
      </div>
      <div><Label>Number of Chickens</Label><Input type="number" placeholder="500" value={form.initialCount} onChange={e => setForm(f => ({ ...f, initialCount: e.target.value }))} /></div>
      <div>
        <Label>Breed</Label>
        <Select value={form.breed} onValueChange={v => setForm(f => ({ ...f, breed: v }))}>
          <SelectTrigger><SelectValue placeholder="Select breed" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Broiler">Broiler</SelectItem>
            <SelectItem value="Layer">Layer</SelectItem>
            <SelectItem value="Cockerel">Cockerel</SelectItem>
            <SelectItem value="Noiler">Noiler</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Purchase Cost (R per chick)</Label><Input type="number" placeholder="50" value={form.purchaseCostPerChick} onChange={e => setForm(f => ({ ...f, purchaseCostPerChick: e.target.value }))} /></div>
      <div><Label>Expected Selling Price (R per bird)</Label><Input type="number" placeholder="5000" value={form.sellingPricePerUnit} onChange={e => setForm(f => ({ ...f, sellingPricePerUnit: e.target.value }))} /></div>
      {feedSelectionFields}
      {feedCalc && (
        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1 border border-border">
          <p className="font-semibold text-foreground">Feed Estimate (for planning only — no stock deducted)</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Starter</span><span>{feedCalc.starter.bags} bags — R{feedCalc.starter.cost.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Grower</span><span>{feedCalc.grower.bags} bags — R{feedCalc.grower.cost.toLocaleString()}</span></div>
          {form.feedStrategy === 'grower_finisher' && (
            <div className="flex justify-between"><span className="text-muted-foreground">Finisher</span><span>{feedCalc.finisher.bags} bags — R{feedCalc.finisher.cost.toLocaleString()}</span></div>
          )}
          <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1"><span>Total</span><span>{feedCalc.totalBags} bags — R{feedCalc.totalCost.toLocaleString()}</span></div>
        </div>
      )}
    </div>
  );

  // View batch detail data
  const viewBatchData = useMemo(() => {
    if (!viewBatch) return null;
    const id = viewBatch.id;
    const batchFeed = feed.filter(f => f.batchId === id);
    const batchMortality = mortality.filter(m => m.batchId === id);
    const batchSales = sales.filter(s => s.batchId === id);
    const batchHealth = health.filter(h => h.batchId === id);
    const batchWeights = weightRecords.filter(w => w.batchId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const batchExpenses = expenses.filter(e => e.batchId === id);

    const purchaseCost = viewBatch.initialCount * (viewBatch.purchaseCostPerChick || 0);
    const feedCost = batchFeed.reduce((s, f) => s + f.bags * f.costPerBag, 0);
    const healthcareCost = batchExpenses.filter(e => e.category === 'healthcare').reduce((s, e) => s + e.amount, 0);
    const otherCosts = batchExpenses.filter(e => e.category !== 'healthcare').reduce((s, e) => s + e.amount, 0);
    const totalCost = purchaseCost + feedCost + healthcareCost + otherCosts;
    const totalRevenue = batchSales.reduce((s, r) => s + r.quantity * r.pricePerUnit, 0);
    const netProfit = totalRevenue - totalCost;
    const birdsSold = batchSales.reduce((s, r) => s + r.quantity, 0);
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const profitPerBird = birdsSold > 0 ? netProfit / birdsSold : 0;

    // Feed prediction — based on remaining (live) chick count
    const count = Math.max(0, viewBatch.currentCount);
    const strategy = viewBatch.feedStrategy || 'grower_finisher';
    const growerSetting = feedSettings.find(s => s.id === viewBatch.feedSelections?.grower)
      || feedSettings.find(s => s.feedType === 'Grower');
    const finisherSetting = strategy === 'grower_finisher'
      ? (feedSettings.find(s => s.id === viewBatch.feedSelections?.finisher) || feedSettings.find(s => s.feedType === 'Finisher'))
      : null;
    const starterSetting = feedSettings.find(s => s.id === viewBatch.feedSelections?.starter)
      || feedSettings.find(s => s.feedType === 'Starter');

    const predStarterBags = starterSetting ? Math.ceil((count / 100) * starterSetting.bagsPerHundredChickens) : 0;
    const predGrowerBags = Math.ceil((count / 100) * (strategy === 'grower_only' ? 6 : 3));
    const predFinisherBags = strategy === 'grower_finisher' ? Math.ceil((count / 100) * 3) : 0;
    const predStarterCost = predStarterBags * (starterSetting?.pricePerBag || 0);
    const predGrowerCost = predGrowerBags * (growerSetting?.pricePerBag || 0);
    const predFinisherCost = predFinisherBags * (finisherSetting?.pricePerBag || 0);
    const predTotalCost = predStarterCost + predGrowerCost + predFinisherCost;

    // Feed stock forecast
    const growerUsed = batchFeed.filter(f => f.feedType === 'Grower').reduce((s, f) => s + f.bags, 0);
    const finisherUsed = batchFeed.filter(f => f.feedType === 'Finisher').reduce((s, f) => s + f.bags, 0);
    const growerStillNeeded = Math.max(0, predGrowerBags - growerUsed);
    const finisherStillNeeded = Math.max(0, predFinisherBags - finisherUsed);
    const growerStock = growerSetting?.stockBags || 0;
    const finisherStock = finisherSetting?.stockBags || 0;
    const growerShortage = Math.max(0, growerStillNeeded - growerStock);
    const finisherShortage = Math.max(0, finisherStillNeeded - finisherStock);

    // Slaughter prediction
    const ageDays = getAgeDays(viewBatch.startDate);
    const ageWeeks = Math.floor(ageDays / 7);
    const latestWeight = batchWeights.length > 0 ? batchWeights[0].weightGrams : null;
    let slaughterStatus = '';
    let slaughterRecommendation = '';
    if (latestWeight && latestWeight >= 2000) {
      slaughterStatus = 'Ready for market';
      slaughterRecommendation = 'Birds have reached target market weight. Consider scheduling slaughter.';
    } else if (latestWeight && latestWeight < 1600) {
      slaughterStatus = 'Continue feeding';
      slaughterRecommendation = 'Birds are below market weight. Continue feeding for optimal returns.';
    } else if (latestWeight) {
      slaughterStatus = 'Approaching market weight';
      slaughterRecommendation = 'Birds are growing well. Monitor weight closely.';
    } else if (ageWeeks >= 5) {
      slaughterStatus = 'Ideal slaughter window';
      slaughterRecommendation = 'Birds are at ideal slaughter age. Record weights to confirm readiness.';
    } else if (ageWeeks >= 4) {
      slaughterStatus = 'Early market window';
      slaughterRecommendation = 'Birds can be sold for early market. Waiting 1-2 more weeks is recommended.';
    } else {
      slaughterStatus = 'Still growing';
      slaughterRecommendation = `Estimated ${Math.max(0, 35 - ageDays)} days until ideal slaughter window.`;
    }
    const daysToIdeal = Math.max(0, 35 - ageDays);
    const daysToHeavy = Math.max(0, 42 - ageDays);

    // Feed efficiency
    const totalFeedUsedKg = batchFeed.reduce((s, f) => s + f.bags * 50, 0); // assume 50kg per bag
    const totalWeightProducedKg = latestWeight ? (viewBatch.currentCount * latestWeight) / 1000 : 0;
    const fcr = totalWeightProducedKg > 0 ? totalFeedUsedKg / totalWeightProducedKg : 0;
    let fcrStatus = '';
    if (fcr > 0 && fcr < 1.6) fcrStatus = 'Excellent';
    else if (fcr >= 1.6 && fcr <= 1.9) fcrStatus = 'Good';
    else if (fcr > 1.9) fcrStatus = 'Poor';

    // Mortality rate
    const totalDead = batchMortality.reduce((s, m) => s + m.count, 0);
    const mortalityRate = viewBatch.initialCount > 0 ? (totalDead / viewBatch.initialCount) * 100 : 0;

    return {
      batchFeed, batchMortality, batchSales, batchHealth, batchWeights,
      purchaseCost, feedCost, healthcareCost, otherCosts, totalCost, totalRevenue, netProfit, margin, profitPerBird, birdsSold,
      predStarterBags, predGrowerBags, predFinisherBags, predStarterCost, predGrowerCost, predFinisherCost, predTotalCost,
      growerStillNeeded, finisherStillNeeded, growerStock, finisherStock, growerShortage, finisherShortage,
      slaughterStatus, slaughterRecommendation, daysToIdeal, daysToHeavy, ageWeeks, ageDays, latestWeight,
      fcr, fcrStatus, mortalityRate, totalDead,
    };
  }, [viewBatch, feed, mortality, sales, health, weightRecords, expenses, feedSettings]);

  return (
    <div className="space-y-6">
      {warningBanner}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">Manage your chicken batches</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">Batches are auto-named by week (e.g. "Mar Week 3")</p>
        </div>
        <Can module="flocks" action="create">
          <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button disabled={!hasRequiredFeeds}><Plus className="h-4 w-4 mr-2" />Add Batch</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add New Batch — {getWeekName(startDate)}</DialogTitle></DialogHeader>
              {formFields}
              <Button className="w-full" onClick={addBatch}>Add Batch</Button>
            </DialogContent>
          </Dialog>
        </Can>
      </div>

      {canCreate && !hasRequiredFeeds && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">You must configure feed settings (Starter, Grower{form.feedStrategy === 'grower_finisher' ? ', and Finisher' : ''}) before creating batches. Go to <a href="/feed-settings" className="underline font-semibold">Feed Settings</a>.</p>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Batch</DialogTitle></DialogHeader>
          {formFields}
          <Button className="w-full" onClick={saveEdit}>Save Changes</Button>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this batch?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close Batch Confirmation */}
      <AlertDialog open={!!closeId} onOpenChange={o => { if (!o) setCloseId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to close this batch?</AlertDialogTitle>
            <AlertDialogDescription>Closed batches cannot be edited. You will still be able to view all batch history and reports.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>Close Batch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DataFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search batch name or breed…"
        selects={[
          { key: 'status', label: 'Status', options: [
            { value: 'active', label: 'Active' },
            { value: 'closed', label: 'Closed' },
            { value: 'sold', label: 'Sold' },
            { value: 'archived', label: 'Archived' },
          ]},
        ]}
        totalCount={batches.length}
        resultCount={filteredBatches.length}
      />

      {canExport && <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={filteredBatches.length === 0}
          onClick={() => {
            const headers = ['Name', 'Status', 'Breed', 'Initial Count', 'Current Count', 'Start Date', 'Age (Days)', 'Feed Used (Bags)', 'Mortality', 'Revenue (R)', 'Profit (R)'];
            const rows = filteredBatches.map(b => {
              const profit = getBatchProfit(b);
              return [
                escapeCSV(b.name),
                escapeCSV(b.status),
                escapeCSV(b.breed),
                escapeCSV(b.initialCount),
                escapeCSV(b.currentCount),
                escapeCSV(new Date(b.startDate).toLocaleDateString()),
                escapeCSV(getAgeDays(b.startDate)),
                escapeCSV(getBatchFeedUsed(b.id)),
                escapeCSV(getBatchMortality(b.id)),
                escapeCSV(getBatchRevenue(b.id)),
                escapeCSV(profit),
              ];
            });
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `batches-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
          }}
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>}

      {/* Estimated Revenue Overview */}
      {filteredBatches.length > 0 && (() => {
        const active = filteredBatches.filter(b => b.status === 'active');
        const rows = active.map(b => ({ batch: b, ...getBatchEstRevenue(b) }));
        const totals = rows.reduce((acc, r) => ({
          realized: acc.realized + r.realized,
          projected: acc.projected + r.projected,
          total: acc.total + r.total,
        }), { realized: 0, projected: 0, total: 0 });
        if (rows.length === 0) return null;
        const maxTotal = Math.max(1, ...rows.map(r => r.total));
        return (
          <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <div>
                  <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
                    Estimated Revenue by Batch
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label="How is Estimated Revenue calculated?" className="text-muted-foreground/60 hover:text-primary">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                          <p className="font-semibold mb-1">Est. Revenue = Realized + Projected</p>
                          <p><span className="text-primary font-medium">Realized</span>: actual sales already captured for the batch.</p>
                          <p><span className="text-blue-600 font-medium">Projected</span>: remaining live birds × the batch's target selling price.</p>
                          <p className="text-muted-foreground mt-1">Assumes all remaining birds sell at target price. Actual results vary with mortality, market price, and cull rates.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Realized sales + projected value of remaining live birds at target price.</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-card border border-border px-3 py-1.5 min-w-[110px]">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Realized</p>
                  <p className="font-display font-bold text-primary tabular-nums">R{totals.realized.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-card border border-border px-3 py-1.5 min-w-[110px]">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Projected</p>
                  <p className="font-display font-bold text-blue-600 tabular-nums">R{totals.projected.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-1.5 min-w-[110px]">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. Total</p>
                  <p className="font-display font-bold text-primary tabular-nums">R{totals.total.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-border">
              {rows.map(r => {
                const pctRealized = r.total > 0 ? (r.realized / r.total) * 100 : 0;
                const barWidth = (r.total / maxTotal) * 100;
                return (
                  <div key={r.batch.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1.5 gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{r.batch.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {r.batch.currentCount.toLocaleString()} birds × R{(r.batch.sellingPricePerUnit || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs tabular-nums flex items-center gap-3">
                        <span className="text-primary font-semibold">R{r.realized.toLocaleString()}</span>
                        <span className="text-muted-foreground">+</span>
                        <span className="text-blue-600 font-semibold">R{r.projected.toLocaleString()}</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="font-display font-bold">R{r.total.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden" style={{ width: `${barWidth}%`, minWidth: '20%' }}>
                      <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pctRealized}%` }} />
                      <div className="absolute inset-y-0 bg-blue-500/70" style={{ left: `${pctRealized}%`, right: 0 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Batch Table */}
      {batches.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Bird className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No batches yet. {hasRequiredFeeds ? 'Add your first batch to get started.' : 'Configure feed settings first.'}</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Chick Count</TableHead>
                <TableHead>Age</TableHead>
                <TableHead className="text-right">Feed Used</TableHead>
                <TableHead className="text-right">Mortality</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Est. Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBatches.map(batch => {
                const profit = getBatchProfit(batch);
                const est = getBatchEstRevenue(batch);
                return (
                  <TableRow key={batch.id}>
                    <TableCell className="font-semibold">{batch.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(batch.status)}>{batch.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground">{batch.initialCount}</span>
                      <span className="mx-1">→</span>
                      <span className="font-bold text-primary">{batch.currentCount}</span>
                    </TableCell>
                    <TableCell>{getAgeDisplay(batch.startDate)}</TableCell>
                    <TableCell className="text-right">{getBatchFeedUsed(batch.id)} bags</TableCell>
                    <TableCell className="text-right text-destructive font-medium">{getBatchMortality(batch.id)}</TableCell>
                    <TableCell className="text-right font-medium">R{getBatchRevenue(batch.id).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-bold text-primary">R{est.total.toLocaleString()}</div>
                      {est.projected > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          incl. R{est.projected.toLocaleString()} projected
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${profit < 0 ? 'text-destructive' : 'text-primary'}`}>
                      R{profit.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setViewBatch(batch)}>
                              <Eye className="h-4 w-4 mr-2" /> View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => printBatchSummary(batch, getBatchRevenue(batch.id), getBatchFeedCost(batch.id), getBatchFeedUsed(batch.id), getBatchMortality(batch.id), getBatchEstRevenue(batch), getBatchProfit(batch), getAgeDays(batch.startDate))}>
                              <Printer className="h-4 w-4 mr-2" /> Print summary
                            </DropdownMenuItem>
                            {canExport && (
                              <DropdownMenuItem onClick={() => exportBatchCSV(batch, getBatchRevenue(batch.id), getBatchFeedCost(batch.id), getBatchFeedUsed(batch.id), getBatchMortality(batch.id), getBatchEstRevenue(batch), getBatchProfit(batch), getAgeDays(batch.startDate))}>
                                <FileSpreadsheet className="h-4 w-4 mr-2" /> Export CSV
                              </DropdownMenuItem>
                            )}
                            {batch.status === 'active' && (canEdit || canDelete) && (
                              <>
                                <DropdownMenuSeparator />
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => startEdit(batch)}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                )}
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => setCloseId(batch.id)}>
                                    <Lock className="h-4 w-4 mr-2" /> Close batch
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem onClick={() => setDeleteId(batch.id)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {batch.status === 'closed' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled className="text-xs text-muted-foreground">Read-only (closed)</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredBatches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10">
                    <Bird className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-muted-foreground mb-1">No batches match your filters.</p>
                    {(filter.search.trim() || filter.datePreset !== 'all' || filter.selects.status) && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground/70">
                          Active filters:{filter.search.trim() ? ` Search "${filter.search.trim()}"` : ''}
                          {filter.datePreset !== 'all' ? ` Date: ${filter.datePreset}` : ''}
                          {filter.selects.status ? ` Status: ${filter.selects.status}` : ''}
                        </p>
                        <Button variant="outline" size="sm" onClick={() => setFilter(defaultFilterValue)}>
                          Clear all filters
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}


      {/* View Batch Details Popup */}
      <Dialog open={!!viewBatch} onOpenChange={o => { if (!o) setViewBatch(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {viewBatch && viewBatchData && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {viewBatch.name}
                  <Badge variant="outline" className={statusColor(viewBatch.status)}>{viewBatch.status}</Badge>
                  {viewBatch.status === 'closed' && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      <Lock className="h-3 w-3 mr-1" />Closed — Read Only
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              {viewBatch.status === 'active' && canEdit && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setCloseId(viewBatch.id); setViewBatch(null); }}>
                    <Lock className="h-4 w-4 mr-1" />Close Batch
                  </Button>
                </div>
              )}
              <Tabs defaultValue="overview" className="mt-2">
                <TabsList className="w-full grid grid-cols-6">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="feed">Feed</TabsTrigger>
                  <TabsTrigger value="mortality">Mortality</TabsTrigger>
                  <TabsTrigger value="growth">Growth</TabsTrigger>
                  <TabsTrigger value="sales">Sales</TabsTrigger>
                  <TabsTrigger value="profit">Profit</TabsTrigger>
                </TabsList>

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-muted/50 rounded-lg p-3"><p className="text-muted-foreground text-xs">Date Created</p><p className="font-medium">{new Date(viewBatch.startDate).toLocaleDateString()}</p></div>
                    <div className="bg-muted/50 rounded-lg p-3"><p className="text-muted-foreground text-xs">Age</p><p className="font-medium">{getAgeDisplay(viewBatch.startDate)}</p></div>
                    <div className="bg-muted/50 rounded-lg p-3"><p className="text-muted-foreground text-xs">Initial Count</p><p className="font-medium">{viewBatch.initialCount.toLocaleString()}</p></div>
                    <div className="bg-muted/50 rounded-lg p-3"><p className="text-muted-foreground text-xs">Current Count</p><p className="font-bold text-primary">{viewBatch.currentCount.toLocaleString()}</p></div>
                    <div className="bg-muted/50 rounded-lg p-3"><p className="text-muted-foreground text-xs">Breed</p><p className="font-medium">{viewBatch.breed}</p></div>
                    <div className="bg-muted/50 rounded-lg p-3"><p className="text-muted-foreground text-xs">Feed Strategy</p><p className="font-medium">{getStrategyLabel(viewBatch.feedStrategy)}</p></div>
                  </div>

                  {/* Slaughter Prediction Card */}
                  <div className="border border-border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold">Slaughter Prediction</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        viewBatchData.slaughterStatus === 'Ready for market' ? 'bg-primary/10 text-primary border-primary/20' :
                        viewBatchData.slaughterStatus === 'Continue feeding' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                        'bg-muted text-muted-foreground'
                      }>{viewBatchData.slaughterStatus}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{viewBatchData.slaughterRecommendation}</p>
                    {viewBatchData.daysToIdeal > 0 && (
                      <div className="text-sm grid grid-cols-2 gap-2">
                        <div><span className="text-muted-foreground">Ideal window starts:</span> <span className="font-medium">{viewBatchData.daysToIdeal} days</span></div>
                        <div><span className="text-muted-foreground">Heavy market:</span> <span className="font-medium">{viewBatchData.daysToHeavy} days</span></div>
                      </div>
                    )}
                    {/* Slaughter age reference */}
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">Slaughter Age Reference:</p>
                      <div className="flex gap-3 text-xs">
                        {Object.entries(SLAUGHTER_INFO).map(([week, label]) => (
                          <span key={week} className={`px-2 py-0.5 rounded ${viewBatchData.ageWeeks === Number(week) ? 'bg-primary/10 text-primary font-semibold' : 'bg-muted text-muted-foreground'}`}>
                            Week {week}: {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quick Alerts */}
                  {(viewBatchData.mortalityRate > 5 || viewBatchData.growerShortage > 0 || viewBatchData.finisherShortage > 0) && (
                    <div className="space-y-2">
                      {viewBatchData.mortalityRate > 5 && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span className="text-destructive">High mortality rate: {viewBatchData.mortalityRate.toFixed(1)}% ({viewBatchData.totalDead} birds)</span>
                        </div>
                      )}
                      {viewBatchData.growerShortage > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3 flex items-center gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <span className="text-yellow-800 dark:text-yellow-200">You need {viewBatchData.growerShortage} more grower bags (Stock: {viewBatchData.growerStock}, Need: {viewBatchData.growerStillNeeded})</span>
                        </div>
                      )}
                      {viewBatchData.finisherShortage > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3 flex items-center gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <span className="text-yellow-800 dark:text-yellow-200">You need {viewBatchData.finisherShortage} more finisher bags (Stock: {viewBatchData.finisherStock}, Need: {viewBatchData.finisherStillNeeded})</span>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* FEED TAB - with prediction */}
                <TabsContent value="feed" className="space-y-4 mt-4">
                  {/* Live chick count summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Starting</p>
                      <p className="text-lg font-bold tabular-nums">{viewBatch.initialCount.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mortality</p>
                      <p className="text-lg font-bold tabular-nums text-destructive">
                        −{Math.max(0, viewBatchData.totalDead).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining</p>
                      <p className="text-lg font-bold tabular-nums text-primary">
                        {Math.max(0, viewBatch.currentCount).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Guardrail: mortality exceeds remaining */}
                  {viewBatchData.totalDead > viewBatch.initialCount && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">Mortality exceeds available chicks</p>
                        <p className="text-xs opacity-90">
                          Recorded deaths ({viewBatchData.totalDead.toLocaleString()}) are greater than
                          the starting count ({viewBatch.initialCount.toLocaleString()}).
                          Predictions are clamped to zero — please review mortality records.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Feed Prediction Card */}
                  <div className="border border-border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Wheat className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold">Feed Prediction — Full Cycle</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Estimated feed needed for{' '}
                      <span className="font-semibold text-foreground">
                        {Math.max(0, viewBatch.currentCount).toLocaleString()}
                      </span>{' '}
                      remaining chicks ({getStrategyLabel(viewBatch.feedStrategy)}) · initial{' '}
                      {viewBatch.initialCount.toLocaleString()}
                    </p>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Starter</span><span>{viewBatchData.predStarterBags} bags — R{viewBatchData.predStarterCost.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Grower</span><span>{viewBatchData.predGrowerBags} bags — R{viewBatchData.predGrowerCost.toLocaleString()}</span></div>
                      {viewBatch.feedStrategy !== 'grower_only' && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Finisher</span><span>{viewBatchData.predFinisherBags} bags — R{viewBatchData.predFinisherCost.toLocaleString()}</span></div>
                      )}
                      <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Total Feed Budget</span><span className="text-primary">R{viewBatchData.predTotalCost.toLocaleString()}</span></div>
                    </div>
                  </div>

                  {/* Prediction breakdown — shows impact of mortality on the prediction */}
                  {viewBatch.initialCount > 0 && viewBatchData.totalDead > 0 && (
                    <div className="rounded-lg border border-border p-3 text-xs space-y-1.5 bg-muted/20">
                      <p className="text-xs font-semibold text-foreground">Prediction breakdown</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">Starting chicks</span><span className="tabular-nums">{viewBatch.initialCount.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Mortality recorded</span><span className="tabular-nums text-destructive">−{viewBatchData.totalDead.toLocaleString()}</span></div>
                      <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Live count used for prediction</span><span className="tabular-nums font-semibold text-primary">{Math.max(0, viewBatch.currentCount).toLocaleString()}</span></div>
                      {(() => {
                        const strategy = viewBatch.feedStrategy || 'grower_finisher';
                        const starter = feedSettings.find(s => s.id === viewBatch.feedSelections?.starter);
                        const grower = feedSettings.find(s => s.id === viewBatch.feedSelections?.grower);
                        const finisher = strategy === 'grower_finisher' ? feedSettings.find(s => s.id === viewBatch.feedSelections?.finisher) : null;
                        const initBags =
                          (starter ? Math.ceil((viewBatch.initialCount / 100) * starter.bagsPerHundredChickens) : 0) +
                          Math.ceil((viewBatch.initialCount / 100) * (strategy === 'grower_only' ? 6 : 3)) +
                          (strategy === 'grower_finisher' ? Math.ceil((viewBatch.initialCount / 100) * 3) : 0);
                        const initCost =
                          (starter ? Math.ceil((viewBatch.initialCount / 100) * starter.bagsPerHundredChickens) * (starter.pricePerBag || 0) : 0) +
                          Math.ceil((viewBatch.initialCount / 100) * (strategy === 'grower_only' ? 6 : 3)) * (grower?.pricePerBag || 0) +
                          (strategy === 'grower_finisher' ? Math.ceil((viewBatch.initialCount / 100) * 3) * (finisher?.pricePerBag || 0) : 0);
                        const bagsDiff = initBags - (viewBatchData.predStarterBags + viewBatchData.predGrowerBags + viewBatchData.predFinisherBags);
                        const costDiff = initCost - viewBatchData.predTotalCost;
                        if (bagsDiff <= 0 && costDiff <= 0) return null;
                        return (
                          <div className="flex justify-between border-t border-border pt-1 text-emerald-700 dark:text-emerald-400">
                            <span>Savings vs. starting prediction</span>
                            <span className="tabular-nums font-semibold">−{bagsDiff} bags · −R{costDiff.toLocaleString()}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Feed Stock Forecast */}
                  {(viewBatchData.growerShortage > 0 || viewBatchData.finisherShortage > 0) && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3 space-y-1">
                      <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Feed Stock Alert</p>
                      {viewBatchData.growerShortage > 0 && <p className="text-sm text-yellow-800 dark:text-yellow-200">⚠ You need {viewBatchData.growerShortage} more grower bags</p>}
                      {viewBatchData.finisherShortage > 0 && <p className="text-sm text-yellow-800 dark:text-yellow-200">⚠ You need {viewBatchData.finisherShortage} more finisher bags</p>}
                    </div>
                  )}

                  {/* Feed efficiency */}
                  {viewBatchData.fcr > 0 && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Feed Conversion Ratio (FCR)</span>
                        <span className={`font-semibold ${viewBatchData.fcrStatus === 'Excellent' ? 'text-primary' : viewBatchData.fcrStatus === 'Good' ? 'text-primary' : 'text-destructive'}`}>
                          {viewBatchData.fcr.toFixed(2)} — {viewBatchData.fcrStatus}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Feed Records */}
                  <h4 className="font-semibold text-sm">Feed Usage Records</h4>
                  {viewBatchData.batchFeed.length === 0 ? (
                    <p className="text-muted-foreground text-center py-6">No feed records</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Bags</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {viewBatchData.batchFeed.map(f => (
                          <TableRow key={f.id}>
                            <TableCell>{new Date(f.date).toLocaleDateString()}</TableCell>
                            <TableCell>{f.feedType}</TableCell>
                            <TableCell className="text-right">{f.bags}</TableCell>
                            <TableCell className="text-right">R{(f.bags * f.costPerBag).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* MORTALITY TAB */}
                <TabsContent value="mortality" className="mt-4">
                  {viewBatchData.mortalityRate > 0 && (
                    <div className={`rounded-lg p-3 mb-3 text-sm ${viewBatchData.mortalityRate > 5 ? 'bg-destructive/10 border border-destructive/20 text-destructive' : 'bg-muted/50'}`}>
                      Mortality Rate: <span className="font-bold">{viewBatchData.mortalityRate.toFixed(1)}%</span> ({viewBatchData.totalDead} of {viewBatch.initialCount})
                    </div>
                  )}
                  {viewBatchData.batchMortality.length === 0 ? (
                    <p className="text-muted-foreground text-center py-6">No mortality records</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Deaths</TableHead><TableHead>Cause</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {viewBatchData.batchMortality.map(m => (
                          <TableRow key={m.id}>
                            <TableCell>{new Date(m.date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right text-destructive font-semibold">{m.count}</TableCell>
                            <TableCell>{m.cause}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* GROWTH TAB */}
                <TabsContent value="growth" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-muted-foreground text-xs">Current Age</p>
                      <p className="font-medium">{getAgeDisplay(viewBatch.startDate)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-muted-foreground text-xs">Latest Weight</p>
                      <p className="font-medium">{viewBatchData.latestWeight ? `${viewBatchData.latestWeight}g` : 'No records'}</p>
                    </div>
                  </div>

                  {/* Weight Target Indicator */}
                  {viewBatchData.ageWeeks >= 1 && viewBatchData.ageWeeks <= 6 && (
                    <div className="border border-border rounded-lg p-3 space-y-2">
                      <h4 className="font-semibold text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Weight Targets</h4>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {Object.entries(WEIGHT_TARGETS).map(([week, target]) => {
                          const isCurrentWeek = viewBatchData.ageWeeks === Number(week);
                          const belowTarget = isCurrentWeek && viewBatchData.latestWeight !== null && viewBatchData.latestWeight < target;
                          return (
                            <div key={week} className={`rounded-lg p-2 text-center ${isCurrentWeek ? (belowTarget ? 'bg-destructive/10 border border-destructive/20' : 'bg-primary/10 border border-primary/20') : 'bg-muted/50'}`}>
                              <p className="text-muted-foreground">Week {week}</p>
                              <p className="font-bold">{target >= 1000 ? `${(target / 1000).toFixed(1)}kg` : `${target}g`}</p>
                              {isCurrentWeek && viewBatchData.latestWeight !== null && (
                                <p className={`mt-0.5 font-semibold ${belowTarget ? 'text-destructive' : 'text-primary'}`}>
                                  {belowTarget ? '⚠ Below' : '✓ On track'}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {viewBatchData.latestWeight !== null && viewBatchData.ageWeeks >= 1 && viewBatchData.ageWeeks <= 6 && viewBatchData.latestWeight < WEIGHT_TARGETS[viewBatchData.ageWeeks] && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded p-2 flex items-center gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                          <span className="text-yellow-800 dark:text-yellow-200">⚠ Birds below expected weight. Target: {WEIGHT_TARGETS[viewBatchData.ageWeeks]}g, Actual: {viewBatchData.latestWeight}g</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add Weight Record - only for active batches */}
                  {viewBatch.status === 'active' && (
                  <div className="border border-border rounded-lg p-3 space-y-3">
                    <h4 className="font-semibold text-sm">Record Weight</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-xs">Date</Label><Input type="date" value={weightForm.date} onChange={e => setWeightForm(f => ({ ...f, date: e.target.value }))} /></div>
                      <div><Label className="text-xs">Avg Weight (g)</Label><Input type="number" placeholder="900" value={weightForm.weightGrams} onChange={e => setWeightForm(f => ({ ...f, weightGrams: e.target.value }))} /></div>
                      <div><Label className="text-xs">Notes</Label><Input placeholder="Optional" value={weightForm.notes} onChange={e => setWeightForm(f => ({ ...f, notes: e.target.value }))} /></div>
                    </div>
                    <Button size="sm" onClick={addWeightRecord} disabled={!weightForm.weightGrams}>Add Weight Record</Button>
                  </div>
                  )}

                  {/* Weight Records Table */}
                  {viewBatchData.batchWeights.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No weight records yet.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Week</TableHead><TableHead className="text-right">Avg Weight (g)</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {viewBatchData.batchWeights.map(w => {
                          const recordDays = Math.floor((new Date(w.date).getTime() - new Date(viewBatch.startDate).getTime()) / (1000 * 60 * 60 * 24));
                          const recordWeek = Math.floor(recordDays / 7);
                          const target = WEIGHT_TARGETS[recordWeek];
                          const below = target && w.weightGrams < target;
                          return (
                            <TableRow key={w.id}>
                              <TableCell>{new Date(w.date).toLocaleDateString()}</TableCell>
                              <TableCell>Week {recordWeek}</TableCell>
                              <TableCell className={`text-right font-semibold ${below ? 'text-destructive' : ''}`}>{w.weightGrams}g {below && '⚠'}</TableCell>
                              <TableCell className="text-muted-foreground">{w.notes || '—'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* SALES TAB */}
                <TabsContent value="sales" className="mt-4">
                  {viewBatchData.batchSales.length === 0 ? (
                    <p className="text-muted-foreground text-center py-6">No sales records</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Price/Bird</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Buyer</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {viewBatchData.batchSales.map(s => (
                          <TableRow key={s.id}>
                            <TableCell>{new Date(s.date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">{s.quantity}</TableCell>
                            <TableCell className="text-right">R{s.pricePerUnit.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">R{(s.quantity * s.pricePerUnit).toLocaleString()}</TableCell>
                            <TableCell>{s.buyer}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* PROFIT TAB */}
                <TabsContent value="profit" className="space-y-4 mt-4">
                  {/* Profit Summary Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className="text-xl font-bold text-primary">R{viewBatchData.totalRevenue.toLocaleString()}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">Total Cost</p>
                      <p className="text-xl font-bold">R{viewBatchData.totalCost.toLocaleString()}</p>
                    </div>
                    <div className={`rounded-lg p-4 text-center ${viewBatchData.netProfit >= 0 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                      <p className="text-xs text-muted-foreground">Net Profit</p>
                      <p className={`text-xl font-bold ${viewBatchData.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>R{viewBatchData.netProfit.toLocaleString()}</p>
                    </div>
                    <div className={`rounded-lg p-4 text-center ${viewBatchData.profitPerBird >= 0 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                      <p className="text-xs text-muted-foreground">Profit Per Bird</p>
                      <p className={`text-xl font-bold ${viewBatchData.profitPerBird >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        R{viewBatchData.profitPerBird.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">{viewBatchData.birdsSold} birds sold</p>
                    </div>
                  </div>

                  {/* Margin & Rating */}
                  <div className="border border-border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Profit Margin</span>
                      <span className="font-bold">{viewBatchData.margin.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Performance Rating</span>
                      <Badge variant="outline" className={`${getProfitRating(viewBatchData.margin).color} font-semibold`}>
                        {getProfitRating(viewBatchData.margin).label}
                      </Badge>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mt-2">
                      <div className={`h-2 rounded-full transition-all ${viewBatchData.margin > 15 ? 'bg-primary' : viewBatchData.margin > 5 ? 'bg-yellow-500' : 'bg-destructive'}`} style={{ width: `${Math.min(100, Math.max(0, viewBatchData.margin))}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground"><span>0%</span><span>Poor</span><span>Average</span><span>Good</span><span>Excellent</span></div>
                  </div>

                  {/* Cost Breakdown */}
                  <div className="border border-border rounded-lg p-4 space-y-1 text-sm">
                    <h4 className="font-semibold mb-2">Cost Breakdown</h4>
                    <div className="flex justify-between"><span className="text-muted-foreground">Chick Purchase ({viewBatch.initialCount} × R{(viewBatch.purchaseCostPerChick || 0)})</span><span>R{viewBatchData.purchaseCost.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Feed Cost</span><span>R{viewBatchData.feedCost.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Healthcare</span><span>R{viewBatchData.healthcareCost.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Other Costs</span><span>R{viewBatchData.otherCosts.toLocaleString()}</span></div>
                    <div className="flex justify-between font-bold border-t border-border pt-1"><span>Total Cost</span><span>R{viewBatchData.totalCost.toLocaleString()}</span></div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function exportBatchCSV(
  batch: Batch, revenue: number, feedCost: number, feedBags: number,
  mortality: number, est: { realized: number; projected: number; total: number },
  profit: number, ageDays: number,
) {
  const rows = [
    ['Field', 'Value'],
    ['Batch Name', batch.name],
    ['Status', batch.status],
    ['Breed', batch.breed],
    ['Start Date', new Date(batch.startDate).toLocaleDateString()],
    ['Age (days)', String(ageDays)],
    ['Initial Count', String(batch.initialCount)],
    ['Current Count', String(batch.currentCount)],
    ['Mortality', String(mortality)],
    ['Feed Used (bags)', String(feedBags)],
    ['Feed Cost (R)', feedCost.toFixed(2)],
    ['Selling Price/Bird (R)', String(batch.sellingPricePerUnit || 0)],
    ['Realized Revenue (R)', est.realized.toFixed(2)],
    ['Projected Revenue (R)', est.projected.toFixed(2)],
    ['Est. Total Revenue (R)', est.total.toFixed(2)],
    ['Actual Revenue (R)', revenue.toFixed(2)],
    ['Profit (R)', profit.toFixed(2)],
  ];
  const csv = rows.map(r => r.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `batch-${batch.name.replace(/\s+/g, '_')}-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printBatchSummary(
  batch: Batch, revenue: number, feedCost: number, feedBags: number,
  mortality: number, est: { realized: number; projected: number; total: number },
  profit: number, ageDays: number,
) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Batch Summary — ${escapeHtml(batch.name)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:32px auto;padding:0 24px;color:#111}
  h1{font-size:22px;margin:0 0 4px}
  .muted{color:#666;font-size:12px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
  .card{border:1px solid #e5e5e5;border-radius:8px;padding:12px}
  .card .label{font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.03em}
  .card .val{font-size:18px;font-weight:700;margin-top:4px}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
  td{padding:6px 0;border-bottom:1px solid #eee}
  td.label{color:#666;width:55%}
  td.val{text-align:right;font-weight:600}
  .footer{margin-top:24px;font-size:11px;color:#888;text-align:center}
  @media print{ button{display:none} }
</style></head><body>
<h1>Batch Summary — ${escapeHtml(batch.name)}</h1>
<div class="muted">PoultryPro · ${escapeHtml(batch.breed)} · ${escapeHtml(batch.status)} · Generated ${new Date().toLocaleString()}</div>
<div class="grid">
  <div class="card"><div class="label">Est. Total Revenue</div><div class="val">R${est.total.toLocaleString()}</div></div>
  <div class="card"><div class="label">Profit to Date</div><div class="val" style="color:${profit<0?'#c00':'#0a7'}">R${profit.toLocaleString()}</div></div>
</div>
<table>
  <tr><td class="label">Start date</td><td class="val">${new Date(batch.startDate).toLocaleDateString()}</td></tr>
  <tr><td class="label">Age</td><td class="val">${ageDays} days</td></tr>
  <tr><td class="label">Initial → Current</td><td class="val">${batch.initialCount.toLocaleString()} → ${batch.currentCount.toLocaleString()}</td></tr>
  <tr><td class="label">Mortality</td><td class="val">${mortality.toLocaleString()}</td></tr>
  <tr><td class="label">Feed used</td><td class="val">${feedBags} bags — R${feedCost.toLocaleString()}</td></tr>
  <tr><td class="label">Target selling price</td><td class="val">R${(batch.sellingPricePerUnit || 0).toLocaleString()} / bird</td></tr>
  <tr><td class="label">Realized revenue</td><td class="val">R${est.realized.toLocaleString()}</td></tr>
  <tr><td class="label">Projected revenue (remaining birds × target)</td><td class="val">R${est.projected.toLocaleString()}</td></tr>
  <tr><td class="label">Actual revenue captured</td><td class="val">R${revenue.toLocaleString()}</td></tr>
</table>
<div class="footer">Est. Revenue = Realized sales + (remaining live birds × target price)</div>
<div style="text-align:center;margin-top:16px"><button onclick="window.print()">Print / Save as PDF</button></div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=760,height=820');
  if (w) { w.document.write(html); w.document.close(); }
}
