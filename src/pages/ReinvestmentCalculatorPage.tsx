import { useMemo, useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Calculator, Sparkles, Bird, Wallet, TrendingUp, PiggyBank,
  RotateCcw, Layers, AlertTriangle,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import { sumBy, pct, toNum } from '@/lib/num';

const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365;
const MAX_CYCLES = 1200;

/** Compact large counts/currency (e.g. R92.8M) so KPI cards never clip — reinvestment
 * compounding over a year+ routinely produces 7-8 digit numbers. */
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
// Intl's compact notation stops abbreviating past "T" (trillion) and just keeps
// expanding digits, which can produce 20+ character strings for runaway compounding.
// Cap the display so the layout never breaks, however extreme the inputs are.
function formatCompact(n: number, prefix = ''): string {
  if (!Number.isFinite(n)) return `${prefix}—`;
  if (Math.abs(n) >= 1e15) return `${n < 0 ? '-' : ''}${prefix}999T+`;
  return `${prefix}${compactFormatter.format(n)}`;
}

interface CycleResult {
  cycle: number;
  dayEnd: number;
  flockSize: number;
  sold: number;
  moneyMade: number;
  cost: number;
  profit: number;
  cumulativeProfit: number;
  cumulativeSold: number;
  cumulativeCost: number;
  cumulativeMoneyMade: number;
  /** Only populated by the "Weekly + Capital" model: fresh outside money added on top of reinvested earnings. */
  injected?: number;
  cumulativeInjected?: number;
}

/**
 * Simple "sell the batch, reinvest what it made" model: you tell us how many
 * chickens made how much money, we assume that R-per-bird ratio holds as the
 * flock grows, and each cycle's reinvested money buys as many new chicks as
 * it can afford at your given cost-per-chick.
 */
function runProjectionSimple(opts: {
  startingFlockSize: number;
  moneyMadePerBatch: number;
  costPerNewChick: number;
  reinvestPct: number;
  cycleLengthDays: number;
  horizonDays: number;
}): CycleResult[] {
  const { startingFlockSize, moneyMadePerBatch, costPerNewChick, reinvestPct, cycleLengthDays, horizonDays } = opts;
  if (cycleLengthDays <= 0 || startingFlockSize <= 0 || costPerNewChick <= 0 || moneyMadePerBatch <= 0) return [];

  const moneyPerBird = moneyMadePerBatch / startingFlockSize;
  const totalCycles = Math.min(MAX_CYCLES, Math.floor(horizonDays / cycleLengthDays));
  const results: CycleResult[] = [];
  let nextFlockSize = Math.floor(startingFlockSize);
  let cumulativeProfit = 0, cumulativeSold = 0, cumulativeCost = 0, cumulativeMoneyMade = 0;

  for (let i = 1; i <= totalCycles; i++) {
    const flockSize = nextFlockSize;
    if (flockSize <= 0) break;
    // Cycle 1 uses your exact stated numbers; later cycles scale by the same R-per-bird ratio.
    const moneyMade = i === 1 ? moneyMadePerBatch : flockSize * moneyPerBird;
    const cost = flockSize * costPerNewChick;
    const profit = moneyMade - cost;
    const reinvestAmount = moneyMade * (reinvestPct / 100);

    cumulativeProfit += profit;
    cumulativeSold += flockSize;
    cumulativeCost += cost;
    cumulativeMoneyMade += moneyMade;

    results.push({
      cycle: i, dayEnd: i * cycleLengthDays, flockSize, sold: flockSize, moneyMade, cost, profit,
      cumulativeProfit, cumulativeSold, cumulativeCost, cumulativeMoneyMade,
    });

    nextFlockSize = Math.floor(reinvestAmount / costPerNewChick);
  }
  return results;
}

/**
 * Detailed model: break the cost and revenue down per bird (chick price, feed,
 * other costs, selling price, mortality) instead of a single lump "money made"
 * figure. Useful when you want to flex individual assumptions separately.
 */
function runProjectionDetailed(opts: {
  startingFlockSize: number;
  costPerChick: number;
  sellingPrice: number;
  feedCostPerBird: number;
  otherCostPerBird: number;
  mortalityRatePct: number;
  cycleLengthDays: number;
  reinvestPct: number;
  horizonDays: number;
}): CycleResult[] {
  const {
    startingFlockSize, costPerChick, sellingPrice, feedCostPerBird, otherCostPerBird,
    mortalityRatePct, cycleLengthDays, reinvestPct, horizonDays,
  } = opts;
  // The cost of raising ONE new bird to sale is chick + feed + other combined — the same
  // basis must be used both to price this cycle's batch and to convert next cycle's
  // reinvested budget back into a flock size, or growth gets systematically overstated.
  const costPerBirdAllIn = costPerChick + feedCostPerBird + otherCostPerBird;
  if (cycleLengthDays <= 0 || startingFlockSize <= 0 || costPerBirdAllIn <= 0) return [];

  const totalCycles = Math.min(MAX_CYCLES, Math.floor(horizonDays / cycleLengthDays));
  const results: CycleResult[] = [];
  let nextFlockSize = Math.floor(startingFlockSize);
  let cumulativeProfit = 0, cumulativeSold = 0, cumulativeCost = 0, cumulativeMoneyMade = 0;

  for (let i = 1; i <= totalCycles; i++) {
    const flockSize = nextFlockSize;
    if (flockSize <= 0) break;
    const sold = Math.max(0, Math.floor(flockSize * (1 - mortalityRatePct / 100)));
    const cost = flockSize * costPerBirdAllIn;
    const moneyMade = sold * sellingPrice;
    const profit = moneyMade - cost;
    // Reinvesting X% of profit while the base cost is always recycled into the next cycle —
    // at 100% reinvestment, next cycle's budget equals this cycle's full revenue.
    const reinvestAmount = cost + profit * (reinvestPct / 100);

    cumulativeProfit += profit;
    cumulativeSold += sold;
    cumulativeCost += cost;
    cumulativeMoneyMade += moneyMade;

    results.push({
      cycle: i, dayEnd: i * cycleLengthDays, flockSize, sold, moneyMade, cost, profit,
      cumulativeProfit, cumulativeSold, cumulativeCost, cumulativeMoneyMade,
    });

    nextFlockSize = Math.floor(reinvestAmount / costPerBirdAllIn);
  }
  return results;
}

/**
 * Weekly + Capital model: you start a new batch every cycle (typically every
 * week) and top up each one with fresh outside capital, on top of whatever
 * the previous batch's earnings reinvest. Built on the same "sell the batch,
 * reinvest what it made" math as the Simple model, plus a steady injection.
 */
function runProjectionWeeklyCapital(opts: {
  startingFlockSize: number;
  moneyMadePerBatch: number;
  costPerNewChick: number;
  capitalInjectionPerCycle: number;
  reinvestPct: number;
  cycleLengthDays: number;
  horizonDays: number;
}): CycleResult[] {
  const {
    startingFlockSize, moneyMadePerBatch, costPerNewChick, capitalInjectionPerCycle,
    reinvestPct, cycleLengthDays, horizonDays,
  } = opts;
  if (cycleLengthDays <= 0 || startingFlockSize <= 0 || costPerNewChick <= 0 || moneyMadePerBatch <= 0) return [];

  const moneyPerBird = moneyMadePerBatch / startingFlockSize;
  const totalCycles = Math.min(MAX_CYCLES, Math.floor(horizonDays / cycleLengthDays));
  const results: CycleResult[] = [];
  let nextFlockSize = Math.floor(startingFlockSize);
  let cumulativeProfit = 0, cumulativeSold = 0, cumulativeCost = 0, cumulativeMoneyMade = 0, cumulativeInjected = 0;

  for (let i = 1; i <= totalCycles; i++) {
    const flockSize = nextFlockSize;
    if (flockSize <= 0) break;
    const moneyMade = i === 1 ? moneyMadePerBatch : flockSize * moneyPerBird;
    const cost = flockSize * costPerNewChick;
    const profit = moneyMade - cost;
    const injected = capitalInjectionPerCycle;
    // Same reinvestment as Simple, plus a fresh capital top-up every cycle.
    const reinvestAmount = moneyMade * (reinvestPct / 100) + injected;

    cumulativeProfit += profit;
    cumulativeSold += flockSize;
    cumulativeCost += cost;
    cumulativeMoneyMade += moneyMade;
    cumulativeInjected += injected;

    results.push({
      cycle: i, dayEnd: i * cycleLengthDays, flockSize, sold: flockSize, moneyMade, cost, profit,
      cumulativeProfit, cumulativeSold, cumulativeCost, cumulativeMoneyMade, injected, cumulativeInjected,
    });

    nextFlockSize = Math.floor(reinvestAmount / costPerNewChick);
  }
  return results;
}

function Kpi({ label, value, detail, icon: Icon, tone = 'neutral' }: {
  label: string; value: string; detail?: string; icon: typeof Bird; tone?: 'green' | 'red' | 'neutral';
}) {
  const iconStyle = tone === 'red'
    ? 'bg-destructive/10 text-destructive ring-destructive/10'
    : tone === 'green'
      ? 'bg-primary/10 text-primary ring-primary/10'
      : 'bg-secondary/15 text-secondary ring-secondary/10';
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md sm:p-5">
      <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-primary/[0.035] transition-transform group-hover:scale-125" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-2 whitespace-nowrap font-display text-xl font-extrabold tabular-nums sm:text-2xl">{value}</p>
          {detail && <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{detail}</p>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${iconStyle}`}><Icon className="h-4.5 w-4.5" /></div>
      </div>
    </div>
  );
}

const HORIZON_PRESETS = [
  { label: '5 months', months: 5 },
  { label: '1 year', months: 12 },
  { label: '5 years', months: 60 },
];

export default function ReinvestmentCalculatorPage() {
  const { batches, feed, mortality } = useFarm();

  const defaults = useMemo(() => {
    const validBatches = batches.filter(b => b.initialCount > 0);
    const costSamples = validBatches.filter(b => b.purchaseCostPerChick > 0);
    const priceSamples = validBatches.filter(b => b.sellingPricePerUnit > 0);
    const totalInitial = sumBy(validBatches, b => b.initialCount);
    const totalFeedCost = sumBy(feed, f => f.bags * f.costPerBag);
    const totalMortality = sumBy(mortality, m => m.count);
    const mostRecent = [...validBatches].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

    const avgCostPerChick = costSamples.length ? sumBy(costSamples, b => b.purchaseCostPerChick) / costSamples.length : 6;
    const avgFeedCostPerBird = totalInitial > 0 ? totalFeedCost / totalInitial : 11;
    const avgSellingPrice = priceSamples.length ? sumBy(priceSamples, b => b.sellingPricePerUnit) / priceSamples.length : 60;
    const avgMortalityRate = totalInitial > 0 ? pct(totalMortality, totalInitial) : 5;
    const startingFlockSize = mostRecent?.initialCount || 200;
    const survivors = Math.round(startingFlockSize * (1 - avgMortalityRate / 100));

    return {
      startingFlockSize,
      costPerNewChick: Math.round((avgCostPerChick + avgFeedCostPerBird) * 10) / 10,
      moneyMadePerBatch: Math.round(survivors * avgSellingPrice),
      costPerChick: Math.round(avgCostPerChick),
      sellingPrice: Math.round(avgSellingPrice),
      feedCostPerBird: Math.round(avgFeedCostPerBird * 10) / 10,
      mortalityRate: Math.round(avgMortalityRate * 10) / 10,
    };
  }, [batches, feed, mortality]);

  const [mode, setMode] = useState<'simple' | 'detailed' | 'weekly'>('simple');

  // Simple-mode fields (also used as the base fields for Weekly + Capital)
  const [startingFlockSize, setStartingFlockSize] = useState(String(defaults.startingFlockSize));
  const [moneyMadePerBatch, setMoneyMadePerBatch] = useState(String(defaults.moneyMadePerBatch));
  const [costPerNewChick, setCostPerNewChick] = useState(String(defaults.costPerNewChick));

  // Detailed-mode fields
  const [costPerChick, setCostPerChick] = useState(String(defaults.costPerChick));
  const [sellingPrice, setSellingPrice] = useState(String(defaults.sellingPrice));
  const [feedCostPerBird, setFeedCostPerBird] = useState(String(defaults.feedCostPerBird));
  const [otherCostPerBird, setOtherCostPerBird] = useState('0');
  const [mortalityRate, setMortalityRate] = useState(String(defaults.mortalityRate));

  // Weekly + Capital-mode field
  const [capitalInjectionPerCycle, setCapitalInjectionPerCycle] = useState('0');

  // Shared fields
  const [reinvestPct, setReinvestPct] = useState('100');
  const [cycleLengthDays, setCycleLengthDays] = useState('35');
  const [horizonMonths, setHorizonMonths] = useState('5');
  const [showAllCycles, setShowAllCycles] = useState(false);

  const resetToActuals = () => {
    setStartingFlockSize(String(defaults.startingFlockSize));
    setMoneyMadePerBatch(String(defaults.moneyMadePerBatch));
    setCostPerNewChick(String(defaults.costPerNewChick));
    setCostPerChick(String(defaults.costPerChick));
    setSellingPrice(String(defaults.sellingPrice));
    setFeedCostPerBird(String(defaults.feedCostPerBird));
    setOtherCostPerBird('0');
    setMortalityRate(String(defaults.mortalityRate));
    setCapitalInjectionPerCycle('0');
    setReinvestPct('100');
    setCycleLengthDays('35');
  };

  const cycleDays = toNum(cycleLengthDays);
  const months = toNum(horizonMonths);

  const cycles = useMemo(() => {
    if (mode === 'simple') {
      return runProjectionSimple({
        startingFlockSize: toNum(startingFlockSize),
        moneyMadePerBatch: toNum(moneyMadePerBatch),
        costPerNewChick: toNum(costPerNewChick),
        reinvestPct: toNum(reinvestPct),
        cycleLengthDays: cycleDays,
        horizonDays: months * DAYS_PER_MONTH,
      });
    }
    if (mode === 'weekly') {
      return runProjectionWeeklyCapital({
        startingFlockSize: toNum(startingFlockSize),
        moneyMadePerBatch: toNum(moneyMadePerBatch),
        costPerNewChick: toNum(costPerNewChick),
        capitalInjectionPerCycle: toNum(capitalInjectionPerCycle),
        reinvestPct: toNum(reinvestPct),
        cycleLengthDays: cycleDays,
        horizonDays: months * DAYS_PER_MONTH,
      });
    }
    return runProjectionDetailed({
      startingFlockSize: toNum(startingFlockSize),
      costPerChick: toNum(costPerChick),
      sellingPrice: toNum(sellingPrice),
      feedCostPerBird: toNum(feedCostPerBird),
      otherCostPerBird: toNum(otherCostPerBird),
      mortalityRatePct: toNum(mortalityRate),
      cycleLengthDays: cycleDays,
      reinvestPct: toNum(reinvestPct),
      horizonDays: months * DAYS_PER_MONTH,
    });
  }, [mode, startingFlockSize, moneyMadePerBatch, costPerNewChick, costPerChick, sellingPrice, feedCostPerBird, otherCostPerBird, mortalityRate, capitalInjectionPerCycle, reinvestPct, cycleDays, months]);

  const finalCycle = cycles.length ? cycles[cycles.length - 1] : null;

  const yearlySnapshots = useMemo(() => {
    if (cycles.length === 0) return [];
    const years = Math.max(1, Math.ceil(months / 12));
    const snaps: { year: number; cycle: CycleResult }[] = [];
    for (let y = 1; y <= years; y++) {
      const dayMark = y * DAYS_PER_YEAR;
      const upTo = cycles.filter(c => c.dayEnd <= dayMark);
      const snap = upTo.length ? upTo[upTo.length - 1] : cycles[cycles.length - 1];
      snaps.push({ year: y, cycle: snap });
    }
    // Collapse trailing duplicate years once the final cycle has already been reached.
    return snaps.filter((s, idx) => idx === 0 || s.cycle.cycle !== snaps[idx - 1].cycle.cycle);
  }, [cycles, months]);

  const useYearlyView = cycles.length > 24 && !showAllCycles;
  const visibleCycles = showAllCycles ? cycles.slice(0, 300) : cycles;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.10] via-card to-secondary/[0.08] p-5 md:p-6">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary/[0.06]" />
        <div className="relative">
          <Badge variant="secondary" className="mb-3 gap-1.5"><Sparkles className="h-3.5 w-3.5" />Growth planning</Badge>
          <h2 className="font-display text-2xl font-extrabold md:text-3xl">Reinvestment growth calculator</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Tell us what a batch made you and what it costs to raise the next one — we'll show how big your flock and profits get if you plough it all back in, cycle after cycle.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Assumptions panel */}
        <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 h-fit">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4 text-primary" />Assumptions</h3>
            <Button variant="ghost" size="sm" onClick={resetToActuals}><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Use my actuals</Button>
          </div>

          <div className="flex gap-2 rounded-lg border border-border/70 bg-muted/30 p-1">
            <Button
              type="button"
              size="sm"
              variant={mode === 'simple' ? 'default' : 'ghost'}
              className="flex-1"
              onClick={() => setMode('simple')}
            >
              Simple
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'detailed' ? 'default' : 'ghost'}
              className="flex-1"
              onClick={() => setMode('detailed')}
            >
              Detailed
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'weekly' ? 'default' : 'ghost'}
              className="flex-1"
              onClick={() => setMode('weekly')}
            >
              New Batch + Capital
            </Button>
          </div>

          <div>
            <Label className="text-xs">Starting flock size</Label>
            <Input type="number" value={startingFlockSize} onChange={e => setStartingFlockSize(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">e.g. "I sell all 200"</p>
          </div>

          {mode === 'detailed' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cost per chick (R)</Label>
                <Input type="number" value={costPerChick} onChange={e => setCostPerChick(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Selling price/bird (R)</Label>
                <Input type="number" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Feed cost/bird (R)</Label>
                <Input type="number" value={feedCostPerBird} onChange={e => setFeedCostPerBird(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Other cost/bird (R)</Label>
                <Input type="number" value={otherCostPerBird} onChange={e => setOtherCostPerBird(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Mortality rate (%)</Label>
                <Input type="number" value={mortalityRate} onChange={e => setMortalityRate(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Money made selling that batch (R)</Label>
                <Input type="number" value={moneyMadePerBatch} onChange={e => setMoneyMadePerBatch(e.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">e.g. "then I make R14,000"</p>
              </div>

              <div>
                <Label className="text-xs">Cost to raise each new chick (R)</Label>
                <Input type="number" value={costPerNewChick} onChange={e => setCostPerNewChick(e.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">All-in: chick + feed + everything, per bird</p>
              </div>

              {mode === 'weekly' && (
                <div>
                  <Label className="text-xs">Capital injected each cycle (R)</Label>
                  <Input type="number" value={capitalInjectionPerCycle} onChange={e => setCapitalInjectionPerCycle(e.target.value)} />
                  <p className="mt-1 text-[11px] text-muted-foreground">Fresh outside money added on top of reinvested earnings every time you start a new batch — e.g. R2,000 topped up from savings each time, whether that's weekly or every 2 weeks.</p>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Reinvestment (%)</Label>
              <Input type="number" min={0} max={100} value={reinvestPct} onChange={e => setReinvestPct(e.target.value)} />
              <p className="mt-1 text-[11px] text-muted-foreground">100% = "I take it all and reinvest"</p>
            </div>
            <div>
              <Label className="text-xs">Cycle length (days)</Label>
              <Input type="number" value={cycleLengthDays} onChange={e => setCycleLengthDays(e.target.value)} />
              {mode === 'weekly' && <p className="mt-1 text-[11px] text-muted-foreground">How often you add a new batch — 7 for every week, 14 for every 2 weeks, etc.</p>}
            </div>
          </div>

          <div>
            <Label className="text-xs">Time horizon</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {HORIZON_PRESETS.map(p => (
                <Button
                  key={p.months}
                  type="button"
                  size="sm"
                  variant={horizonMonths === String(p.months) ? 'default' : 'outline'}
                  onClick={() => setHorizonMonths(String(p.months))}
                >
                  {p.label}
                </Button>
              ))}
              <div className="flex items-center gap-1.5">
                <Input type="number" className="w-20 h-8" value={horizonMonths} onChange={e => setHorizonMonths(e.target.value)} />
                <span className="text-xs text-muted-foreground">months</span>
              </div>
            </div>
            {cycleDays > 0 && months > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                ≈ {cycles.length} cycle{cycles.length !== 1 ? 's' : ''} fit into {months} month{months !== 1 ? 's' : ''} at {cycleDays}-day cycles.
              </p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground border-t border-border/70 pt-3">
            Defaults are estimated from your recorded batches, feed logs and mortality — every field is editable. We assume the same rand-per-bird return holds as the flock grows. This is a projection, not a guarantee: real prices, disease, and market demand will vary.
          </p>
        </div>

        {/* Results panel */}
        <div className="space-y-4">
          {!finalCycle ? (
            <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                These numbers don't sustain even one full cycle within the chosen time horizon — check your starting flock size, {mode === 'detailed' ? 'selling price and costs' : 'money made and cost per chick'}, and cycle length.
              </p>
            </div>
          ) : (
            <>
              {finalCycle.flockSize > 1_000_000 && (
                <div className="flex items-start gap-3 rounded-2xl border border-secondary/25 bg-secondary/10 p-4">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-secondary" />
                  <p className="text-sm text-secondary-foreground">
                    At these assumptions the flock compounds very fast — by cycle {finalCycle.cycle} the model projects {formatCompact(finalCycle.flockSize)} chicks, far beyond what land, labour, or market demand could realistically absorb. Treat large long-horizon numbers as directional, not literal — try a shorter horizon, a lower reinvestment %, or double-check your money-made and cost inputs.
                  </p>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">At the end of this period ({months} month{months !== 1 ? 's' : ''}, cycle {finalCycle.cycle})</h3>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <Kpi label="Flock size then" value={formatCompact(finalCycle.flockSize)} detail="chicks in that final cycle" icon={Bird} tone="green" />
                  <Kpi
                    label="Birds sold that cycle"
                    value={formatCompact(finalCycle.sold)}
                    detail={mode === 'detailed' ? `after ${toNum(mortalityRate)}% mortality` : undefined}
                    icon={Layers}
                    tone="neutral"
                  />
                  <Kpi label="Profit that cycle" value={formatCompact(finalCycle.profit, 'R')} icon={TrendingUp} tone={finalCycle.profit >= 0 ? 'green' : 'red'} />
                  <Kpi label="Total cost that cycle" value={formatCompact(finalCycle.cost, 'R')} icon={Wallet} tone="neutral" />
                  {mode === 'weekly' && (
                    <Kpi label="Capital injected that cycle" value={formatCompact(finalCycle.injected ?? 0, 'R')} icon={PiggyBank} tone="neutral" />
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Totals across the whole period</h3>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <Kpi label="Total birds sold" value={formatCompact(finalCycle.cumulativeSold)} detail={`over ${finalCycle.cycle} cycles`} icon={Layers} tone="neutral" />
                  <Kpi label="Total profit earned" value={formatCompact(finalCycle.cumulativeProfit, 'R')} icon={PiggyBank} tone={finalCycle.cumulativeProfit >= 0 ? 'green' : 'red'} />
                  <Kpi label="Total cost spent" value={formatCompact(finalCycle.cumulativeCost, 'R')} icon={Wallet} tone="neutral" />
                  <Kpi label="Total money made" value={formatCompact(finalCycle.cumulativeMoneyMade, 'R')} icon={TrendingUp} tone="green" />
                  {mode === 'weekly' && (
                    <>
                      <Kpi label="Total capital injected" value={formatCompact(finalCycle.cumulativeInjected ?? 0, 'R')} detail="fresh outside money added in" icon={PiggyBank} tone="neutral" />
                      <Kpi
                        label="Net profit after injections"
                        value={formatCompact(finalCycle.cumulativeProfit - (finalCycle.cumulativeInjected ?? 0), 'R')}
                        detail="profit earned minus what you put in"
                        icon={TrendingUp}
                        tone={finalCycle.cumulativeProfit - (finalCycle.cumulativeInjected ?? 0) >= 0 ? 'green' : 'red'}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold">Flock size over time</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={cycles.map(c => ({ name: `C${c.cycle}`, flock: c.flockSize }))}>
                    <defs>
                      <linearGradient id="flockGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(151,48%,32%)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(151,48%,32%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.65} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatCompact(v)} width={60} />
                    <RechartsTooltip formatter={(v: number) => formatCompact(v)} />
                    <Area type="monotone" dataKey="flock" stroke="hsl(151,48%,32%)" fill="url(#flockGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{useYearlyView ? 'Year-by-year breakdown' : 'Cycle-by-cycle breakdown'}</h3>
                  {cycles.length > 24 && (
                    <Button variant="ghost" size="sm" onClick={() => setShowAllCycles(v => !v)}>
                      {showAllCycles ? 'Show yearly summary' : 'Show every cycle'}
                    </Button>
                  )}
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{useYearlyView ? 'Year' : 'Cycle'}</TableHead>
                        <TableHead className="text-right">Flock size</TableHead>
                        <TableHead className="text-right">Sold</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        {mode === 'weekly' && <TableHead className="text-right">Injected</TableHead>}
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="text-right">Cumulative profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {useYearlyView
                        ? yearlySnapshots.map(({ year, cycle }) => (
                          <TableRow key={year}>
                            <TableCell className="font-medium">Year {year}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCompact(cycle.flockSize)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCompact(cycle.cumulativeSold)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCompact(cycle.cumulativeCost, 'R')}</TableCell>
                            {mode === 'weekly' && <TableCell className="text-right tabular-nums">{formatCompact(cycle.cumulativeInjected ?? 0, 'R')}</TableCell>}
                            <TableCell className="text-right tabular-nums">{formatCompact(cycle.profit, 'R')}</TableCell>
                            <TableCell className={`text-right tabular-nums font-semibold ${cycle.cumulativeProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCompact(cycle.cumulativeProfit, 'R')}</TableCell>
                          </TableRow>
                        ))
                        : visibleCycles.map(c => (
                          <TableRow key={c.cycle}>
                            <TableCell className="font-medium">#{c.cycle}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCompact(c.flockSize)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCompact(c.sold)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCompact(c.cost, 'R')}</TableCell>
                            {mode === 'weekly' && <TableCell className="text-right tabular-nums">{formatCompact(c.injected ?? 0, 'R')}</TableCell>}
                            <TableCell className="text-right tabular-nums">{formatCompact(c.profit, 'R')}</TableCell>
                            <TableCell className={`text-right tabular-nums font-semibold ${c.cumulativeProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCompact(c.cumulativeProfit, 'R')}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  {showAllCycles && cycles.length > 300 && (
                    <p className="p-3 text-center text-xs text-muted-foreground">Showing the first 300 of {cycles.length} cycles.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
