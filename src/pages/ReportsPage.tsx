import { useEffect, useMemo } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import { DataFilter, resolveDateRange, type SelectFilterConfig } from '@/components/DataFilter';
import { useFilterState } from '@/hooks/useFilterState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  exportDetailedCsv,
  exportDetailedExcel,
  exportDetailedJson,
  exportDetailedPdf,
  type DetailedExportSection,
} from '@/lib/export';
import {
  BarChart3, Bird, CalendarRange, CheckCircle2, ChevronDown, DollarSign,
  FileJson, FileSpreadsheet, FileText, Filter, PackageOpen, ReceiptText, Skull,
} from 'lucide-react';
import { toast } from 'sonner';

interface InternalRow extends Record<string, string | number | boolean | null | undefined> {
  __date?: string;
  __batchId?: string;
}

interface InternalSection extends Omit<DetailedExportSection, 'rows'> {
  key: string;
  rows: InternalRow[];
}

const REPORT_TYPES = [
  { value: 'full', label: 'Full detailed report' },
  { value: 'executive', label: 'Executive & profitability' },
  { value: 'flock', label: 'Flock performance' },
  { value: 'sales', label: 'Sales & revenue' },
  { value: 'payments', label: 'Collections & advances' },
  { value: 'mortality', label: 'Mortality & recovery' },
  { value: 'feed', label: 'Feed usage & stock' },
  { value: 'health', label: 'Health records' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'harvest', label: 'Harvests' },
  { value: 'customers', label: 'Customers' },
  { value: 'environment', label: 'Environment & alerts' },
] as const;

const GROUPS: Record<string, string[]> = {
  full: ['summary', 'batchPerformance', 'batches', 'sales', 'collections', 'advances', 'expenses', 'mortality', 'mortalityResells', 'feed', 'feedStock', 'health', 'harvests', 'weights', 'buyers', 'environmentRecords', 'environments', 'environmentAlerts'],
  executive: ['summary', 'batchPerformance'],
  flock: ['batchPerformance', 'batches', 'mortality', 'mortalityResells', 'harvests', 'weights', 'health'],
  sales: ['summary', 'sales', 'buyers'],
  payments: ['summary', 'collections', 'advances'],
  mortality: ['mortality', 'mortalityResells', 'batchPerformance'],
  feed: ['feed', 'feedStock', 'batchPerformance'],
  health: ['health', 'batches'],
  expenses: ['summary', 'expenses', 'feed'],
  harvest: ['harvests', 'sales', 'batches'],
  customers: ['buyers', 'sales', 'collections', 'advances'],
  environment: ['environments', 'environmentRecords', 'environmentAlerts', 'batches'],
};

const money = (value: number) => `R${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (value: unknown) => Number(value) || 0;
const batchName = (id: string | undefined, batches: Array<{ id: string; name: string }>) => batches.find(batch => batch.id === id)?.name || id || '—';

export default function ReportsPage() {
  const farm = useFarm();
  const [filter, setFilter] = useFilterState('reports-v2');
  const reportType = !filter.selects.reportType || filter.selects.reportType === 'all' ? 'full' : filter.selects.reportType;
  const batchId = filter.selects.batch || 'all';

  useEffect(() => {
    if (!filter.selects.reportType || filter.selects.reportType === 'all') {
      setFilter(current => ({ ...current, selects: { ...current.selects, reportType: 'full' } }));
    }
  }, [filter.selects.reportType, setFilter]);

  const selectFilters = useMemo<SelectFilterConfig[]>(() => [
    { key: 'reportType', label: 'Report type', options: REPORT_TYPES.map(type => ({ ...type })) },
    { key: 'batch', label: 'Batch', options: farm.batches.map(batch => ({ value: batch.id, label: batch.name })) },
  ], [farm.batches]);

  const recordMatches = (row: InternalRow) => {
    const { from, to } = resolveDateRange(filter);
    if ((from || to) && row.__date) {
      const date = new Date(row.__date);
      if (Number.isNaN(date.getTime())) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
    }
    if (batchId !== 'all' && row.__batchId && row.__batchId !== batchId) return false;
    const search = filter.search.trim().toLowerCase();
    if (search) {
      const haystack = Object.entries(row)
        .filter(([key]) => !key.startsWith('__'))
        .map(([, value]) => String(value ?? '').toLowerCase())
        .join(' ');
      if (!haystack.includes(search)) return false;
    }
    return true;
  };

  const sections = useMemo<InternalSection[]>(() => {
    const filteredSales = farm.sales.filter(sale => recordMatches({ __date: sale.date, __batchId: sale.batchId, buyer: sale.buyer, invoice: sale.invoiceNumber }));
    const filteredCollections = farm.collections.filter(item => recordMatches({ __date: item.date, __batchId: item.batchId, notes: item.notes }));
    const filteredAdvances = farm.advances.filter(item => recordMatches({ __date: item.date, buyer: item.buyerName }));
    const filteredFeed = farm.feed.filter(item => recordMatches({ __date: item.date, __batchId: item.batchId, type: item.feedType }));
    const filteredExpenses = farm.expenses.filter(item => recordMatches({ __date: item.date, __batchId: item.batchId, description: item.description, category: item.category }));
    const filteredMortality = farm.mortality.filter(item => recordMatches({ __date: item.date, __batchId: item.batchId, cause: item.cause }));

    const revenue = filteredSales.reduce((sum, sale) => sum + num(sale.quantity) * num(sale.pricePerUnit), 0);
    const collected = filteredCollections.reduce((sum, item) => sum + num(item.amount), 0);
    const feedCost = filteredFeed.reduce((sum, item) => sum + num(item.bags) * num(item.costPerBag), 0);
    const otherExpenses = filteredExpenses.reduce((sum, item) => sum + num(item.amount), 0);
    const mortalityCost = filteredMortality.reduce((sum, item) => sum + num(item.totalCost), 0);
    const totalCosts = feedCost + otherExpenses;
    const profit = revenue - totalCosts;

    const summary: InternalRow[] = [
      { Metric: 'Batches', Value: batchId === 'all' ? farm.batches.length : farm.batches.filter(batch => batch.id === batchId).length },
      { Metric: 'Birds currently in flock', Value: farm.batches.filter(batch => batchId === 'all' || batch.id === batchId).reduce((sum, batch) => sum + num(batch.currentCount), 0) },
      { Metric: 'Sales revenue (R)', Value: revenue },
      { Metric: 'Payment collections (R)', Value: collected },
      { Metric: 'Feed cost (R)', Value: feedCost },
      { Metric: 'Other expenses (R)', Value: otherExpenses },
      { Metric: 'Total operating costs (R)', Value: totalCosts },
      { Metric: 'Net profit (R)', Value: profit },
      { Metric: 'Profit margin (%)', Value: revenue ? Number(((profit / revenue) * 100).toFixed(2)) : 0 },
      { Metric: 'Mortality count', Value: filteredMortality.reduce((sum, item) => sum + num(item.count), 0) },
      { Metric: 'Mortality cost impact (R)', Value: mortalityCost },
    ];

    const performance = farm.batches
      .filter(batch => batchId === 'all' || batch.id === batchId)
      .map(batch => {
        const sales = filteredSales.filter(item => item.batchId === batch.id);
        const feed = filteredFeed.filter(item => item.batchId === batch.id);
        const expenses = filteredExpenses.filter(item => item.batchId === batch.id);
        const deaths = filteredMortality.filter(item => item.batchId === batch.id).reduce((sum, item) => sum + num(item.count), 0);
        const batchRevenue = sales.reduce((sum, item) => sum + num(item.quantity) * num(item.pricePerUnit), 0);
        const batchCosts = feed.reduce((sum, item) => sum + num(item.bags) * num(item.costPerBag), 0) + expenses.reduce((sum, item) => sum + num(item.amount), 0);
        return {
          Batch: batch.name, Status: batch.status, 'Initial birds': batch.initialCount, 'Current birds': batch.currentCount,
          'Birds sold': sales.reduce((sum, item) => sum + num(item.quantity), 0), Deaths: deaths,
          'Mortality (%)': batch.initialCount ? Number(((deaths / batch.initialCount) * 100).toFixed(2)) : 0,
          'Revenue (R)': batchRevenue, 'Costs (R)': batchCosts, 'Profit (R)': batchRevenue - batchCosts,
          __batchId: batch.id, __date: batch.startDate,
        };
      });

    return [
      { key: 'summary', title: 'Executive Summary', columns: ['Metric', 'Value'], rows: summary },
      { key: 'batchPerformance', title: 'Batch Performance & Profitability', columns: ['Batch', 'Status', 'Initial birds', 'Current birds', 'Birds sold', 'Deaths', 'Mortality (%)', 'Revenue (R)', 'Costs (R)', 'Profit (R)'], rows: performance },
      { key: 'batches', title: 'Batches / Flocks', columns: ['Batch', 'Breed', 'Start date', 'Status', 'Initial count', 'Current count', 'Purchase cost/chick (R)', 'Selling price/unit (R)', 'Feed strategy'], rows: farm.batches.map(batch => ({ Batch: batch.name, Breed: batch.breed, 'Start date': batch.startDate, Status: batch.status, 'Initial count': batch.initialCount, 'Current count': batch.currentCount, 'Purchase cost/chick (R)': batch.purchaseCostPerChick, 'Selling price/unit (R)': batch.sellingPricePerUnit, 'Feed strategy': batch.feedStrategy || '', __date: batch.startDate, __batchId: batch.id })) },
      { key: 'sales', title: 'Sales', columns: ['Date', 'Invoice', 'Batch', 'Buyer', 'Phone', 'Quantity', 'Price/unit (R)', 'Total (R)', 'Payment status', 'Collected (R)'], rows: farm.sales.map(sale => ({ Date: sale.date, Invoice: sale.invoiceNumber || '', Batch: batchName(sale.batchId, farm.batches), Buyer: sale.buyer, Phone: sale.buyerPhone || '', Quantity: sale.quantity, 'Price/unit (R)': sale.pricePerUnit, 'Total (R)': num(sale.quantity) * num(sale.pricePerUnit), 'Payment status': sale.paymentStatus || 'paid', 'Collected (R)': sale.amountCollected || 0, __date: sale.date, __batchId: sale.batchId })) },
      { key: 'collections', title: 'Payment Collections', columns: ['Date', 'Batch', 'Sale ID', 'Amount (R)', 'Method', 'Captured by', 'Notes'], rows: farm.collections.map(item => ({ Date: item.date, Batch: batchName(item.batchId, farm.batches), 'Sale ID': item.saleId, 'Amount (R)': item.amount, Method: item.method, 'Captured by': item.capturedBy || '', Notes: item.notes || '', __date: item.date, __batchId: item.batchId })) },
      { key: 'advances', title: 'Advance Payments', columns: ['Date', 'Buyer', 'Amount (R)', 'Applied (R)', 'Remaining (R)', 'Method', 'Notes'], rows: farm.advances.map(item => ({ Date: item.date, Buyer: item.buyerName, 'Amount (R)': item.amount, 'Applied (R)': item.applied, 'Remaining (R)': num(item.amount) - num(item.applied), Method: item.method, Notes: item.notes || '', __date: item.date })) },
      { key: 'expenses', title: 'Expenses', columns: ['Date', 'Batch', 'Category', 'Description', 'Amount (R)'], rows: farm.expenses.map(item => ({ Date: item.date, Batch: batchName(item.batchId, farm.batches), Category: item.category, Description: item.description, 'Amount (R)': item.amount, __date: item.date, __batchId: item.batchId })) },
      { key: 'mortality', title: 'Mortality Records', columns: ['Date', 'Batch', 'Count', 'Cause', 'Cost/bird (R)', 'Total cost (R)'], rows: farm.mortality.map(item => ({ Date: item.date, Batch: item.batchName || batchName(item.batchId, farm.batches), Count: item.count, Cause: item.cause, 'Cost/bird (R)': item.costPerBird || 0, 'Total cost (R)': item.totalCost || 0, __date: item.date, __batchId: item.batchId })) },
      { key: 'mortalityResells', title: 'Mortality Recovery / Resells', columns: ['Date', 'Batch', 'Quantity', 'Price/unit (R)', 'Recovered (R)', 'Buyer', 'Notes'], rows: farm.mortalityResells.map(item => ({ Date: item.date, Batch: batchName(item.batchId, farm.batches), Quantity: item.quantity, 'Price/unit (R)': item.pricePerUnit, 'Recovered (R)': item.totalAmount, Buyer: item.buyer || '', Notes: item.notes || '', __date: item.date, __batchId: item.batchId })) },
      { key: 'feed', title: 'Feed Usage', columns: ['Date', 'Batch', 'Feed type', 'Bags', 'Cost/bag (R)', 'Total cost (R)', 'Feed setting ID'], rows: farm.feed.map(item => ({ Date: item.date, Batch: batchName(item.batchId, farm.batches), 'Feed type': item.feedType, Bags: item.bags, 'Cost/bag (R)': item.costPerBag, 'Total cost (R)': num(item.bags) * num(item.costPerBag), 'Feed setting ID': item.feedSettingId || '', __date: item.date, __batchId: item.batchId })) },
      { key: 'feedStock', title: 'Feed Stock & Settings', columns: ['Brand', 'Feed type', 'Price/bag (R)', 'Stock bags', 'Bags/100 chicks'], rows: farm.feedSettings.map(item => ({ Brand: item.brand, 'Feed type': item.feedType, 'Price/bag (R)': item.pricePerBag, 'Stock bags': item.stockBags, 'Bags/100 chicks': item.bagsPerHundredChickens })) },
      { key: 'health', title: 'Health Records', columns: ['Date', 'Batch', 'Type', 'Description', 'Medication', 'Notes'], rows: farm.health.map(item => ({ Date: item.date, Batch: batchName(item.batchId, farm.batches), Type: item.type, Description: item.description, Medication: item.medication, Notes: item.notes, __date: item.date, __batchId: item.batchId })) },
      { key: 'harvests', title: 'Harvests', columns: ['Date', 'Batch', 'Quantity', 'Average weight (kg)', 'Total weight (kg)', 'Created by', 'Notes'], rows: farm.harvests.map(item => ({ Date: item.date, Batch: batchName(item.batchId, farm.batches), Quantity: item.quantity, 'Average weight (kg)': item.averageWeightKg || 0, 'Total weight (kg)': item.totalWeightKg || 0, 'Created by': item.createdBy || '', Notes: item.notes || '', __date: item.date, __batchId: item.batchId })) },
      { key: 'weights', title: 'Growth & Weight Tracking', columns: ['Date', 'Batch', 'Weight (g)', 'Notes'], rows: farm.weightRecords.map(item => ({ Date: item.date, Batch: batchName(item.batchId, farm.batches), 'Weight (g)': item.weightGrams, Notes: item.notes, __date: item.date, __batchId: item.batchId })) },
      { key: 'buyers', title: 'Customers / Buyers', columns: ['Name', 'Phone', 'Created', 'Notes'], rows: farm.buyers.map(item => ({ Name: item.name, Phone: item.phone || '', Created: item.createdAt, Notes: item.notes || '', __date: item.createdAt })) },
      { key: 'environmentRecords', title: 'Environment History', columns: ['Date', 'Environment', 'Batch', 'Temperature (°C)', 'Humidity (%)', 'Notes'], rows: farm.environment.map(item => ({ Date: item.date, Environment: item.name || '', Batch: batchName(item.batchId, farm.batches), 'Temperature (°C)': item.temperature, 'Humidity (%)': item.humidity, Notes: item.notes, __date: item.date, __batchId: item.batchId })) },
      { key: 'environments', title: 'Monitored Environments', columns: ['Name', 'Sensor path', 'Linked batches', 'Created'], rows: farm.environments.map(item => ({ Name: item.name, 'Sensor path': item.sensorPath || `${item.name}/sensors/current`, 'Linked batches': item.batchIds.map(id => batchName(id, farm.batches)).join(', '), Created: item.createdAt, __date: item.createdAt, __batchId: item.batchIds.length === 1 ? item.batchIds[0] : undefined })) },
      { key: 'environmentAlerts', title: 'Environment Alerts', columns: ['Triggered', 'Resolved', 'Environment', 'Batches', 'Temperature (°C)', 'Humidity (%)', 'Severity', 'Temperature status', 'Humidity status', 'Active'], rows: farm.envAlerts.map(item => ({ Triggered: item.triggeredAt, Resolved: item.resolvedAt || '', Environment: item.environmentName, Batches: item.batchNames.join(', '), 'Temperature (°C)': item.temperature ?? '', 'Humidity (%)': item.humidity ?? '', Severity: item.severity, 'Temperature status': item.tempStatus, 'Humidity status': item.humidityStatus, Active: item.active ? 'Yes' : 'No', __date: item.triggeredAt, __batchId: item.batchIds.length === 1 ? item.batchIds[0] : undefined })) },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm, filter, batchId]);

  const selectedSections = useMemo(() => {
    const keys = GROUPS[reportType] || GROUPS.full;
    return sections
      .filter(section => keys.includes(section.key))
      .map(section => ({
        ...section,
        rows: section.key === 'summary'
          ? section.rows
          : section.rows.filter(recordMatches),
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, reportType, filter]);

  const exportSections: DetailedExportSection[] = selectedSections.map(section => ({
    title: section.title,
    columns: section.columns,
    rows: section.rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('__')))),
  }));
  const totalRecords = selectedSections.filter(section => section.key !== 'summary').reduce((sum, section) => sum + section.rows.length, 0);
  const reportLabel = REPORT_TYPES.find(type => type.value === reportType)?.label || 'Full detailed report';
  const selectedBatchName = batchId === 'all' ? 'All batches' : batchName(batchId, farm.batches);
  const { from, to } = resolveDateRange(filter);
  const dateLabel = from || to
    ? `${from ? from.toLocaleDateString() : 'Beginning'} – ${to ? to.toLocaleDateString() : 'Today'}`
    : 'All time';
  const filterSummary = `${reportLabel} • ${selectedBatchName} • ${dateLabel}${filter.search ? ` • Search: ${filter.search}` : ''}`;
  const filename = `PoultryPro-${reportType}-${new Date().toISOString().slice(0, 10)}`;

  const runExport = (format: string, action: () => void) => {
    if (!exportSections.some(section => section.rows.length)) {
      toast.error('No records match the selected filters');
      return;
    }
    action();
    toast.success(`${format} report download started`);
  };

  const summaryValues = Object.fromEntries((sections.find(section => section.key === 'summary')?.rows || []).map(row => [String(row.Metric), num(row.Value)]));

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] via-card to-secondary/[0.08] p-5 md:p-6">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/[0.06]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3"><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Report centre</Badge>
            <h2 className="font-display text-2xl font-extrabold">Detailed farm reporting</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Build a focused report or export a complete operational record across every farm module.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={() => runExport('PDF', () => exportDetailedPdf(filename, `PoultryPro — ${reportLabel}`, exportSections, filterSummary))}><FileText className="h-4 w-4" />PDF</Button>
            <Button variant="outline" onClick={() => runExport('Excel', () => exportDetailedExcel(filename, exportSections))}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
            <Button variant="outline" onClick={() => runExport('CSV', () => exportDetailedCsv(filename, exportSections))}><ReceiptText className="h-4 w-4" />CSV</Button>
            <Button onClick={() => runExport('JSON', () => exportDetailedJson(filename, reportLabel, exportSections, filterSummary))}><FileJson className="h-4 w-4" />JSON</Button>
          </div>
        </div>
      </section>

      <DataFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search names, invoices, causes, notes…"
        selects={selectFilters}
        resultCount={totalRecords}
        totalCount={totalRecords}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard icon={DollarSign} label="Revenue" value={money(summaryValues['Sales revenue (R)'])} tone="green" />
        <SummaryCard icon={ReceiptText} label="Operating costs" value={money(summaryValues['Total operating costs (R)'])} tone="red" />
        <SummaryCard icon={CheckCircle2} label="Net profit" value={money(summaryValues['Net profit (R)'])} tone={summaryValues['Net profit (R)'] >= 0 ? 'green' : 'red'} />
        <SummaryCard icon={Bird} label="Current birds" value={summaryValues['Birds currently in flock']?.toLocaleString() || '0'} tone="green" />
        <SummaryCard icon={Skull} label="Mortality" value={summaryValues['Mortality count']?.toLocaleString() || '0'} tone="amber" />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-primary" />
          <span className="font-semibold">{reportLabel}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{selectedBatchName}</span>
          <span className="text-muted-foreground">•</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" />{dateLabel}</span>
        </div>
        <span className="text-xs text-muted-foreground">{selectedSections.length} sections • {totalRecords.toLocaleString()} detailed records</span>
      </div>

      {selectedSections.map((section, index) => (
        <details key={section.key} open={reportType !== 'full' || index < 3} className="group overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-accent/30">
            <div>
              <h3 className="font-display font-bold">{section.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{section.rows.length.toLocaleString()} matching record{section.rows.length === 1 ? '' : 's'}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t">
            {section.rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-muted-foreground">
                <PackageOpen className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">No records match the current filters.</p>
              </div>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                    <TableRow>{section.columns.map(column => <TableHead key={column} className="whitespace-nowrap">{column}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {section.rows.slice(0, 500).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {section.columns.map(column => <TableCell key={column} className="whitespace-nowrap text-xs">{formatCell(column, row[column])}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {section.rows.length > 500 && <p className="border-t p-3 text-center text-xs text-muted-foreground">Showing the first 500 rows. Downloads include all {section.rows.length.toLocaleString()} rows.</p>}
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function formatCell(column: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (column.includes('(R)')) return money(num(value));
  if (column.includes('(%)')) return `${value}%`;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof DollarSign; label: string; value: string; tone: 'green' | 'red' | 'amber' }) {
  const styles = tone === 'red'
    ? 'bg-destructive/10 text-destructive'
    : tone === 'amber'
      ? 'bg-secondary/15 text-secondary'
      : 'bg-primary/10 text-primary';
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${styles}`}><Icon className="h-4 w-4" /></div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
