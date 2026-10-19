import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { Environment, EnvironmentAlert } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Thermometer, AlertTriangle, Pencil, Trash2, Bell, CheckCircle2, Wifi, WifiOff,
  Droplets, LayoutGrid, Rows3, Eye, Settings2, RefreshCw, ChevronDown, ChevronUp,
  ArrowUpDown, ArrowUp, ArrowDown, Search, Download, X, ChevronLeft, ChevronRight, Radio,
} from 'lucide-react';
import { useFirebaseSensor, defaultSensorPathFor } from '@/hooks/useFirebaseSensor';
import { evaluateEnvironment, environmentOverallStatus, isOutOfRange, buildAlert, type BatchStatus, type ParamStatus } from '@/lib/environment-status';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { cn } from '@/lib/utils';
import { exportToCsv } from '@/lib/export';
import { BROODING_TARGETS } from '@/lib/brooding';

type ViewMode = 'cards' | 'table';
type SortKey = 'name' | 'week' | 'severity' | 'temperature' | 'humidity';
type SortDir = 'asc' | 'desc';

interface EnvFilters {
  showOutOfRangeOnly: boolean;
  search: string;
  sortBy: SortKey;
  sortDir: SortDir;
  pageSize: number;
}

const DEFAULT_FILTERS: EnvFilters = {
  showOutOfRangeOnly: false,
  search: '',
  sortBy: 'name',
  sortDir: 'asc',
  pageSize: 10,
};

interface EnvSnapshot {
  overall: 'ok' | 'warning' | 'critical' | 'unknown';
  outOfRange: boolean;
  temperature: number | null;
  humidity: number | null;
  week: number | null;
  age: number | null;
  perBatch: BatchStatus[];
  online: boolean;
}

const SEVERITY_RANK: Record<EnvSnapshot['overall'], number> = { critical: 3, warning: 2, unknown: 1, ok: 0 };

/* ---------------- badges & helpers ---------------- */

function StatusBadge({ status, kind }: { status: ParamStatus; kind: 'temp' | 'humidity' }) {
  if (status === 'unknown') return <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">No signal</span>;
  if (status === 'ok') return <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2 py-0.5 text-xs font-medium">✅ In range</span>;
  if (kind === 'temp' && status === 'low') return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-500 px-2 py-0.5 text-xs font-medium">🔵 Too Low</span>;
  if (kind === 'temp' && status === 'high') return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-500 px-2 py-0.5 text-xs font-medium">🔴 Too High</span>;
  if (kind === 'humidity' && status === 'low') return <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 text-yellow-600 px-2 py-0.5 text-xs font-medium">🟡 Too Low</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 text-purple-500 px-2 py-0.5 text-xs font-medium">🟣 Too High</span>;
}

function overallBadge(status: EnvSnapshot['overall']) {
  if (status === 'ok') return <span className="inline-flex items-center rounded-full bg-success/10 text-success px-2 py-0.5 text-xs font-medium">✅ Normal</span>;
  if (status === 'warning') return <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning px-2 py-0.5 text-xs font-medium">⚠ Warning</span>;
  if (status === 'critical') return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">🔴 Critical</span>;
  return <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">No data</span>;
}

const tempCls = (s: ParamStatus | undefined) =>
  s === 'low' ? 'text-blue-500' : s === 'high' ? 'text-red-500' : s === 'ok' ? 'text-success' : 'text-muted-foreground';
const humCls = (s: ParamStatus | undefined) =>
  s === 'low' ? 'text-yellow-600' : s === 'high' ? 'text-purple-500' : s === 'ok' ? 'text-success' : 'text-muted-foreground';

function useEnvLive(env: Environment, refreshKey: number) {
  const path = env.sensorPath || defaultSensorPathFor(env.name);
  // refreshKey included in path memo to force re-subscribe on manual refresh
  const subPath = useMemo(() => path, [path, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const reading = useFirebaseSensor(subPath);
  return { reading, path };
}

/* ---------------- live subscriber (headless) ---------------- */

/** Subscribes to a single environment's sensor and reports snapshot to parent. Renders nothing. */
function EnvironmentSubscriber({
  env, today, refreshKey, onSnapshot,
}: {
  env: Environment;
  today: Date;
  refreshKey: number;
  onSnapshot: (envId: string, snap: EnvSnapshot) => void;
}) {
  const { batches } = useFarm();
  const { reading } = useEnvLive(env, refreshKey);
  const perBatch = useMemo(
    () => evaluateEnvironment(env, batches, reading.temperature, reading.humidity, today),
    [env, batches, reading.temperature, reading.humidity, today],
  );
  const overall = environmentOverallStatus(perBatch);
  const oor = isOutOfRange(perBatch);
  const primary = perBatch.length ? perBatch.reduce((min, s) => (min && min.age < s.age ? min : s), perBatch[0]) : null;
  const online = reading.updatedAt != null && (reading.temperature != null || reading.humidity != null);

  useEffect(() => {
    onSnapshot(env.id, {
      overall, outOfRange: oor,
      temperature: reading.temperature, humidity: reading.humidity,
      week: primary?.target.week ?? null, age: primary?.age ?? null,
      perBatch, online,
    });
  }, [env.id, overall, oor, reading.temperature, reading.humidity, primary?.target.week, primary?.age, perBatch, online, onSnapshot]);

  return null;
}

/* ---------------- card ---------------- */

function EnvironmentCard({
  env, snap, onEdit, onDelete, onView,
}: {
  env: Environment;
  snap: EnvSnapshot | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const overall = snap?.overall ?? 'unknown';
  const path = env.sensorPath || defaultSensorPathFor(env.name);
  const primary = snap?.perBatch.length ? snap.perBatch.reduce((min, s) => (min && min.age < s.age ? min : s), snap.perBatch[0]) : null;
  const online = snap?.online ?? false;

  return (
    <div className={cn(
      "bg-card rounded-xl border p-5 space-y-4 transition-colors",
      overall === 'critical' ? 'border-destructive/40' : overall === 'warning' ? 'border-warning/40' : 'border-border',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold truncate">{env.name}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            {online ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3 text-muted-foreground" />}
            <span className="truncate">{path}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {overallBadge(overall)}
          <button onClick={onView} className="p-1.5 rounded-md text-muted-foreground/70 hover:text-primary hover:bg-muted transition-colors" aria-label="View"><Eye className="h-4 w-4" /></button>
          <button onClick={onEdit} className="p-1.5 rounded-md text-muted-foreground/70 hover:text-primary hover:bg-muted transition-colors" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="p-1.5 rounded-md text-muted-foreground/70 hover:text-destructive hover:bg-muted transition-colors" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={cn("rounded-lg border p-3 transition-colors", primary && primary.temp !== 'ok' && primary.temp !== 'unknown' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-background/50')}>
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Thermometer className="h-3.5 w-3.5" />Temperature</div>
          <div className={cn("text-2xl font-bold font-display mt-1", primary ? tempCls(primary.temp) : '')}>
            {snap?.temperature != null ? `${snap.temperature.toFixed(1)}°C` : '—'}
          </div>
          {primary && <div className="text-xs text-muted-foreground mt-1">Recommended: {primary.target.tempMin}–{primary.target.tempMax}°C</div>}
          <div className="mt-2">{primary ? <StatusBadge status={primary.temp} kind="temp" /> : null}</div>
        </div>
        <div className={cn("rounded-lg border p-3 transition-colors", primary && primary.humidity !== 'ok' && primary.humidity !== 'unknown' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-background/50')}>
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Droplets className="h-3.5 w-3.5" />Humidity</div>
          <div className={cn("text-2xl font-bold font-display mt-1", primary ? humCls(primary.humidity) : '')}>
            {snap?.humidity != null ? `${snap.humidity.toFixed(1)}%` : '—'}
          </div>
          {primary && <div className="text-xs text-muted-foreground mt-1">Recommended: {primary.target.humidityMin}–{primary.target.humidityMax}%</div>}
          <div className="mt-2">{primary ? <StatusBadge status={primary.humidity} kind="humidity" /> : null}</div>
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-1">Assigned batches ({snap?.perBatch.length ?? 0})</div>
        {(!snap || snap.perBatch.length === 0) ? (
          <p className="text-sm text-muted-foreground">No active batches assigned.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {snap.perBatch.map(s => (
              <span key={s.batch.id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 text-xs">
                <span className="font-medium">{s.batch.name}</span>
                <span className="text-muted-foreground">· {s.age}d</span>
                <span className="text-muted-foreground">· {s.target.week >= 5 ? 'W5+' : `W${s.target.week}`}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- table row ---------------- */

function EnvironmentRow({
  env, snap, onEdit, onDelete, onView,
}: {
  env: Environment;
  snap: EnvSnapshot | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const overall = snap?.overall ?? 'unknown';
  const path = env.sensorPath || defaultSensorPathFor(env.name);
  const primary = snap?.perBatch.length ? snap.perBatch.reduce((min, s) => (min && min.age < s.age ? min : s), snap.perBatch[0]) : null;
  const online = snap?.online ?? false;
  const rowTint = snap?.outOfRange ? (overall === 'critical' ? 'bg-destructive/5' : 'bg-warning/5') : '';

  return (
    <TableRow className={rowTint}>
      <TableCell>
        <div className="font-medium">{env.name}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
          {online ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3" />}
          <span className="truncate max-w-[220px]">{path}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className={cn("font-semibold tabular-nums", tempCls(primary?.temp))}>
          {snap?.temperature != null ? `${snap.temperature.toFixed(1)}°C` : '—'}
        </div>
        {primary && <div className="text-[11px] text-muted-foreground">rec {primary.target.tempMin}–{primary.target.tempMax}°C</div>}
      </TableCell>
      <TableCell>
        <div className={cn("font-semibold tabular-nums", humCls(primary?.humidity))}>
          {snap?.humidity != null ? `${snap.humidity.toFixed(1)}%` : '—'}
        </div>
        {primary && <div className="text-[11px] text-muted-foreground">rec {primary.target.humidityMin}–{primary.target.humidityMax}%</div>}
      </TableCell>
      <TableCell>
        <div className="text-sm">{snap?.perBatch.length ?? 0}</div>
        <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
          {snap?.perBatch.map(s => s.batch.name).join(', ') || '—'}
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {primary ? (primary.target.week >= 5 ? 'Week 5+' : `Week ${primary.target.week}`) : '—'}
        {primary && <div className="text-[11px] text-muted-foreground">{primary.age}d</div>}
      </TableCell>
      <TableCell>{overallBadge(overall)}</TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <button onClick={onView} className="p-1.5 rounded-md text-muted-foreground/70 hover:text-primary hover:bg-muted transition-colors" aria-label="View"><Eye className="h-4 w-4" /></button>
          <button onClick={onEdit} className="p-1.5 rounded-md text-muted-foreground/70 hover:text-primary hover:bg-muted transition-colors" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="p-1.5 rounded-md text-muted-foreground/70 hover:text-destructive hover:bg-muted transition-colors" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ---------------- sortable header ---------------- */

function SortableHead({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: SortDir; onClick: () => void; className?: string }) {
  return (
    <TableHead className={className}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        {active ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}
      </button>
    </TableHead>
  );
}

/* ---------------- main page ---------------- */

export default function EnvironmentPage() {
  const { environments, setEnvironments, batches, envAlerts, setEnvAlerts, loaded } = useFarm();
  const activeBatches = useMemo(() => batches.filter(b => b.status === 'active'), [batches]);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('env.viewMode', 'cards');
  const [filters, setFilters] = useLocalStorage<EnvFilters>('env.filters', DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<number>(() => Date.now());
  const [form, setForm] = useState({ name: '', sensorPath: '', batchIds: [] as string[] });

  const [snapshots, setSnapshots] = useState<Record<string, EnvSnapshot>>({});
  const handleSnapshot = useCallback((envId: string, snap: EnvSnapshot) => {
    setSnapshots(prev => {
      const cur = prev[envId];
      if (cur && cur.overall === snap.overall && cur.outOfRange === snap.outOfRange
          && cur.temperature === snap.temperature && cur.humidity === snap.humidity
          && cur.week === snap.week && cur.age === snap.age && cur.online === snap.online
          && cur.perBatch === snap.perBatch) return prev;
      return { ...prev, [envId]: snap };
    });
  }, []);

  // Daily tick so recommendations follow age.
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const resetForm = () => setForm({ name: '', sensorPath: '', batchIds: [] });
  const openCreate = () => { resetForm(); setEditId(null); setOpen(true); };
  const openEdit = (env: Environment) => {
    setEditId(env.id);
    setForm({ name: env.name, sensorPath: env.sensorPath ?? '', batchIds: [...env.batchIds] });
    setOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) return;
    if (editId) {
      setEnvironments(prev => prev.map(e => e.id !== editId ? e : {
        ...e, name: form.name.trim(), sensorPath: form.sensorPath.trim() || undefined, batchIds: form.batchIds,
      }));
    } else {
      const env: Environment = {
        id: crypto.randomUUID(), name: form.name.trim(),
        sensorPath: form.sensorPath.trim() || undefined,
        batchIds: form.batchIds, createdAt: new Date().toISOString(),
      };
      setEnvironments(prev => [...prev, env]);
    }
    resetForm(); setEditId(null); setOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    setEnvironments(prev => prev.filter(e => e.id !== deleteId));
    setEnvAlerts(prev => prev.filter(a => a.environmentId !== deleteId));
    setSnapshots(prev => { const n = { ...prev }; delete n[deleteId]; return n; });
    setDeleteId(null);
  };

  // Alert transitions: fire when a snapshot changes OOR state.
  const lastOor = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    for (const env of environments) {
      const snap = snapshots[env.id];
      if (!snap || snap.perBatch.length === 0) continue;
      const prev = lastOor.current.get(env.id);
      const cur = snap.outOfRange;
      lastOor.current.set(env.id, cur);
      if (prev === undefined) continue;
      if (!prev && cur) {
        const alert = buildAlert(env, snap.perBatch, snap.temperature, snap.humidity);
        setEnvAlerts(list => [...list, alert]);
      } else if (prev && !cur) {
        setEnvAlerts(list => list.map(a => a.environmentId === env.id && a.active
          ? { ...a, active: false, resolvedAt: new Date().toISOString() } : a));
      }
    }
  }, [snapshots, environments, setEnvAlerts]);

  const acknowledgeAlert = (id: string) => {
    const now = new Date().toISOString();
    setEnvAlerts(list => list.map(a => a.id === id ? { ...a, acknowledgedAt: now } : a));
  };
  const acknowledgeAll = () => {
    const now = new Date().toISOString();
    setEnvAlerts(list => list.map(a => a.active && !a.acknowledgedAt ? { ...a, acknowledgedAt: now } : a));
  };

  const setFilterPatch = (p: Partial<EnvFilters>) => setFilters(f => ({ ...f, ...p }));
  const clearSearch = () => setFilterPatch({ search: '' });
  const toggleSort = (key: SortKey) => {
    setFilters(f => f.sortBy === key ? { ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' } : { ...f, sortBy: key, sortDir: 'asc' });
  };

  const currentEnv = editId ? environments.find(e => e.id === editId) : null;
  const previewPath = form.sensorPath.trim() || (form.name.trim() ? defaultSensorPathFor(form.name.trim()) : '');

  const activeAlerts = envAlerts.filter(a => a.active);
  const unackActiveCount = activeAlerts.filter(a => !a.acknowledgedAt).length;

  // Filtered + sorted environment list.
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return environments.filter(e => {
      if (q) {
        const path = (e.sensorPath || defaultSensorPathFor(e.name)).toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !path.includes(q)) return false;
      }
      if (filters.showOutOfRangeOnly) {
        const s = snapshots[e.id];
        if (!s?.outOfRange) return false;
      }
      return true;
    });
  }, [environments, snapshots, filters.search, filters.showOutOfRangeOnly]);

  const sorted = useMemo(() => {
    const dir = filters.sortDir === 'asc' ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const sa = snapshots[a.id], sb = snapshots[b.id];
      switch (filters.sortBy) {
        case 'name': return a.name.localeCompare(b.name) * dir;
        case 'week': return ((sa?.week ?? 99) - (sb?.week ?? 99)) * dir;
        case 'severity': return (SEVERITY_RANK[sa?.overall ?? 'unknown'] - SEVERITY_RANK[sb?.overall ?? 'unknown']) * dir;
        case 'temperature': return ((sa?.temperature ?? -Infinity) - (sb?.temperature ?? -Infinity)) * dir;
        case 'humidity': return ((sa?.humidity ?? -Infinity) - (sb?.humidity ?? -Infinity)) * dir;
        default: return 0;
      }
    });
    return arr;
  }, [filtered, snapshots, filters.sortBy, filters.sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / filters.pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);
  const paged = sorted.slice((page - 1) * filters.pageSize, page * filters.pageSize);

  const doRefresh = () => { setRefreshKey(k => k + 1); setLastRefresh(Date.now()); };

  const viewEnv = viewId ? environments.find(e => e.id === viewId) : null;

  if (!loaded) return <EnvironmentSkeleton />;

  return (
    <div className="space-y-6">
      {/* Headless subscribers — one per environment. */}
      {environments.map(env => (
        <EnvironmentSubscriber key={`sub-${env.id}-${refreshKey}`} env={env} today={today} refreshKey={refreshKey} onSnapshot={handleSnapshot} />
      ))}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display">Environments</h1>
          <p className="text-muted-foreground text-sm">Live sensor monitoring with age-based recommendations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5" role="group" aria-label="View mode">
            <button type="button" onClick={() => setViewMode('cards')} aria-pressed={viewMode === 'cards'} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors", viewMode === 'cards' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button type="button" onClick={() => setViewMode('table')} aria-pressed={viewMode === 'table'} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors", viewMode === 'table' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <Rows3 className="h-3.5 w-3.5" /> Table
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Switch id="oor-toggle" checked={filters.showOutOfRangeOnly} onCheckedChange={v => setFilterPatch({ showOutOfRangeOnly: v })} />
            <Label htmlFor="oor-toggle" className="text-sm cursor-pointer">Out-of-Range Only</Label>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Settings2 className="h-4 w-4 mr-1.5" />Live settings</Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-success animate-pulse" />
                    <h4 className="font-semibold text-sm">Real-time streaming</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Firebase RTDB pushes updates immediately — no polling interval to configure. Readings render as soon as the sensor publishes.</p>
                </div>
                <div className="rounded-md bg-muted/50 p-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Last manual refresh</span><span className="font-medium tabular-nums">{new Date(lastRefresh).toLocaleTimeString()}</span></div>
                  <div className="flex justify-between mt-0.5"><span className="text-muted-foreground">Active subscriptions</span><span className="font-medium tabular-nums">{environments.length}</span></div>
                </div>
                <Button size="sm" className="w-full" onClick={doRefresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh all readings</Button>
              </div>
            </PopoverContent>
          </Popover>

          <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Include Environment</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? 'Edit Environment' : 'Include Environment'}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Environment Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Brooder House A" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Firebase Sensor</Label>
                  </div>
                  <div>
                    <Label className="text-xs">Sensor path</Label>
                    <Input placeholder={form.name.trim() ? defaultSensorPathFor(form.name.trim()) : 'e.g. HouseA/sensors/current'}
                      value={form.sensorPath} onChange={e => setForm(f => ({ ...f, sensorPath: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground mt-1">Defaults to <code>&lt;name&gt;/sensors/current</code> with fields <code>temperature</code> and <code>humidity</code>.</p>
                  </div>
                  <SensorPreview path={previewPath} />
                </div>

                <div>
                  <Label>Assign Batches</Label>
                  {activeBatches.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">No active batches available.</p>
                  ) : (
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-auto rounded-lg border border-border p-2">
                      {activeBatches.map(b => {
                        const checked = form.batchIds.includes(b.id);
                        return (
                          <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1 rounded hover:bg-muted/50">
                            <input type="checkbox" checked={checked}
                              onChange={e => setForm(f => ({ ...f, batchIds: e.target.checked ? [...f.batchIds, b.id] : f.batchIds.filter(id => id !== b.id) }))} />
                            <span>{b.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Button className="w-full" onClick={submit} disabled={!form.name.trim()}>
                  {editId ? 'Save changes' : 'Add environment'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this environment?</AlertDialogTitle><AlertDialogDescription>All linked alert history will also be removed.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EnvironmentSummary environments={environments} snapshots={snapshots} activeAlerts={activeAlerts} />

      {/* Search + sort controls */}
      {environments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filters.search} onChange={e => { setFilterPatch({ search: e.target.value }); setPage(1); }}
              placeholder="Search by name or sensor path…" className="pl-8 pr-8 h-9" />
            {filters.search && (
              <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Sort</Label>
            <Select value={filters.sortBy} onValueChange={v => setFilterPatch({ sortBy: v as SortKey })}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="severity">Severity</SelectItem>
                <SelectItem value="week">Production week</SelectItem>
                <SelectItem value="temperature">Temperature</SelectItem>
                <SelectItem value="humidity">Humidity</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 px-2" onClick={() => setFilterPatch({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}>
              {filters.sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Show</Label>
            <Select value={String(filters.pageSize)} onValueChange={v => { setFilterPatch({ pageSize: Number(v) }); setPage(1); }}>
              <SelectTrigger className="h-9 w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground ml-auto">{sorted.length} of {environments.length}</div>
        </div>
      )}

      {/* Content */}
      {environments.length === 0 ? (
        <EmptyState kind="none" onAdd={openCreate} />
      ) : sorted.length === 0 ? (
        <EmptyState kind="filtered" onClear={() => setFilters(DEFAULT_FILTERS)} />
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {paged.map(env => (
            <EnvironmentCard key={env.id} env={env} snap={snapshots[env.id]}
              onEdit={() => openEdit(env)} onDelete={() => setDeleteId(env.id)} onView={() => setViewId(env.id)} />
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Environment" active={filters.sortBy === 'name'} dir={filters.sortDir} onClick={() => toggleSort('name')} />
                  <SortableHead label="Temperature" active={filters.sortBy === 'temperature'} dir={filters.sortDir} onClick={() => toggleSort('temperature')} />
                  <SortableHead label="Humidity" active={filters.sortBy === 'humidity'} dir={filters.sortDir} onClick={() => toggleSort('humidity')} />
                  <TableHead>Batches</TableHead>
                  <SortableHead label="Week" active={filters.sortBy === 'week'} dir={filters.sortDir} onClick={() => toggleSort('week')} />
                  <SortableHead label="Status" active={filters.sortBy === 'severity'} dir={filters.sortDir} onClick={() => toggleSort('severity')} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map(env => (
                  <EnvironmentRow key={env.id} env={env} snap={snapshots[env.id]}
                    onEdit={() => openEdit(env)} onDelete={() => setDeleteId(env.id)} onView={() => setViewId(env.id)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {sorted.length > filters.pageSize && (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} total={sorted.length} pageSize={filters.pageSize} />
      )}

      <NotificationCenter alerts={activeAlerts} unackCount={unackActiveCount} onAck={acknowledgeAlert} onAckAll={acknowledgeAll} />
      <AlertHistory alerts={envAlerts} environments={environments} onAck={acknowledgeAlert} />

      {/* Details dialog */}
      <Dialog open={!!viewId} onOpenChange={o => { if (!o) setViewId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewEnv && <EnvironmentDetails env={viewEnv} snap={snapshots[viewEnv.id]} alerts={envAlerts.filter(a => a.environmentId === viewEnv.id)} onEdit={() => { setViewId(null); openEdit(viewEnv); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- pagination ---------------- */

function Pagination({ page, totalPages, onChange, total, pageSize }: { page: number; totalPages: number; onChange: (n: number) => void; total: number; pageSize: number }) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-1">
      <div>Showing <span className="font-medium text-foreground">{from}–{to}</span> of {total}</div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-8 px-2" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="px-2 tabular-nums">Page {page} / {totalPages}</span>
        <Button variant="outline" size="sm" className="h-8 px-2" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* ---------------- details ---------------- */

function EnvironmentDetails({ env, snap, alerts, onEdit }: { env: Environment; snap?: EnvSnapshot; alerts: EnvironmentAlert[]; onEdit: () => void }) {
  const path = env.sensorPath || defaultSensorPathFor(env.name);
  const primary = snap?.perBatch.length ? snap.perBatch.reduce((min, s) => (min && min.age < s.age ? min : s), snap.perBatch[0]) : null;
  const online = snap?.online ?? false;
  const sortedAlerts = [...alerts].sort((a, b) => (b.triggeredAt.localeCompare(a.triggeredAt))).slice(0, 20);

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {env.name} {overallBadge(snap?.overall ?? 'unknown')}
        </DialogTitle>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          {online ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5" />}
          <code className="truncate">{path}</code>
        </div>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Thermometer className="h-3.5 w-3.5" />Live temperature</div>
          <div className={cn("text-2xl font-bold font-display mt-1", tempCls(primary?.temp))}>
            {snap?.temperature != null ? `${snap.temperature.toFixed(1)}°C` : '—'}
          </div>
          {primary && <div className="text-xs text-muted-foreground mt-1">Recommended: {primary.target.tempMin}–{primary.target.tempMax}°C</div>}
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Droplets className="h-3.5 w-3.5" />Live humidity</div>
          <div className={cn("text-2xl font-bold font-display mt-1", humCls(primary?.humidity))}>
            {snap?.humidity != null ? `${snap.humidity.toFixed(1)}%` : '—'}
          </div>
          {primary && <div className="text-xs text-muted-foreground mt-1">Recommended: {primary.target.humidityMin}–{primary.target.humidityMax}%</div>}
        </div>
      </div>

      <div>
        <h4 className="font-display font-semibold text-sm mb-2">Assigned batches</h4>
        {!snap || snap.perBatch.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active batches assigned to this environment.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Batch</TableHead><TableHead>Age</TableHead><TableHead>Week</TableHead>
                <TableHead>Temp target</TableHead><TableHead>Humidity target</TableHead>
                <TableHead>Temp</TableHead><TableHead>Humidity</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {snap.perBatch.map(s => (
                  <TableRow key={s.batch.id}>
                    <TableCell className="font-medium">{s.batch.name}</TableCell>
                    <TableCell>{s.age}d</TableCell>
                    <TableCell>{s.target.week >= 5 ? 'Week 5+' : `Week ${s.target.week}`}</TableCell>
                    <TableCell className="text-xs">{s.target.tempMin}–{s.target.tempMax}°C</TableCell>
                    <TableCell className="text-xs">{s.target.humidityMin}–{s.target.humidityMax}%</TableCell>
                    <TableCell><StatusBadge status={s.temp} kind="temp" /></TableCell>
                    <TableCell><StatusBadge status={s.humidity} kind="humidity" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <h4 className="font-display font-semibold text-sm mb-2">Brooding reference</h4>
        <div className="rounded-lg border border-border overflow-hidden text-xs">
          <Table>
            <TableHeader><TableRow><TableHead>Age</TableHead><TableHead>Temperature</TableHead><TableHead>Humidity</TableHead></TableRow></TableHeader>
            <TableBody>
              {BROODING_TARGETS.map(t => (
                <TableRow key={t.week} className={primary && primary.target.week === t.week ? 'bg-primary/5' : ''}>
                  <TableCell>{t.label}</TableCell>
                  <TableCell>{t.tempMin}–{t.tempMax}°C</TableCell>
                  <TableCell>{t.humidityMin}–{t.humidityMax}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h4 className="font-display font-semibold text-sm mb-2">Recent alerts ({alerts.length})</h4>
        {sortedAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts recorded for this environment.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {sortedAlerts.map(a => (
              <div key={a.id} className="rounded-md border border-border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className={cn("font-medium", a.severity === 'critical' ? 'text-destructive' : 'text-warning')}>{a.severity}</span>
                  <span className="text-muted-foreground">{new Date(a.triggeredAt).toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {a.temperature != null ? `${a.temperature.toFixed(1)}°C` : '—'} / {a.humidity != null ? `${a.humidity.toFixed(1)}%` : '—'} · {a.active ? (a.acknowledgedAt ? 'Active (acknowledged)' : 'Active') : 'Resolved'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onEdit}><Pencil className="h-4 w-4 mr-1.5" />Edit environment</Button>
      </div>
    </div>
  );
}

/* ---------------- summary ---------------- */

function EnvironmentSummary({ environments, snapshots, activeAlerts }: { environments: Environment[]; snapshots: Record<string, EnvSnapshot>; activeAlerts: EnvironmentAlert[] }) {
  const total = environments.length;
  if (total === 0) return null;
  const critical = activeAlerts.filter(a => a.severity === 'critical').length;
  const warning = activeAlerts.filter(a => a.severity === 'warning').length;
  const affectedBatchIds = new Set(activeAlerts.flatMap(a => a.batchIds));
  const oorEnvIds = new Set(environments.filter(e => snapshots[e.id]?.outOfRange).map(e => e.id));
  const inRange = Math.max(0, total - oorEnvIds.size);
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <SummaryTile label="Total" value={total} />
      <SummaryTile label="In Range" value={inRange} tone="success" />
      <SummaryTile label="Out of Range" value={oorEnvIds.size} tone={oorEnvIds.size ? 'warning' : undefined} />
      <SummaryTile label="Critical" value={critical} tone={critical ? 'destructive' : undefined} />
      <SummaryTile label="Warnings" value={warning} tone={warning ? 'warning' : undefined} />
      <SummaryTile label="Batches Attention" value={affectedBatchIds.size} tone={affectedBatchIds.size ? 'warning' : undefined} />
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' | 'destructive' }) {
  const toneCls = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'destructive' ? 'text-destructive' : '';
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-bold font-display mt-0.5", toneCls)}>{value}</div>
    </div>
  );
}

/* ---------------- sensor preview ---------------- */

function SensorPreview({ path }: { path: string }) {
  const reading = useFirebaseSensor(path || null);
  if (!path) return <p className="text-xs text-muted-foreground">Provide a name or path to preview the sensor.</p>;
  const online = reading.updatedAt != null && (reading.temperature != null || reading.humidity != null);
  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      <div className="rounded-md bg-background border border-border p-2">
        <div className="text-[10px] uppercase text-muted-foreground">Live Temp</div>
        <div className="text-lg font-semibold">{reading.temperature != null ? `${reading.temperature.toFixed(1)}°C` : '—'}</div>
      </div>
      <div className="rounded-md bg-background border border-border p-2">
        <div className="text-[10px] uppercase text-muted-foreground">Live Humidity</div>
        <div className="text-lg font-semibold">{reading.humidity != null ? `${reading.humidity.toFixed(1)}%` : '—'}</div>
      </div>
      <div className="col-span-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        {online ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3" />} {online ? 'Live' : 'Waiting for data…'}
      </div>
    </div>
  );
}

/* ---------------- notification center ---------------- */

function NotificationCenter({ alerts, unackCount, onAck, onAckAll }: { alerts: EnvironmentAlert[]; unackCount: number; onAck: (id: string) => void; onAckAll: () => void }) {
  if (alerts.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-5 w-5 text-success" />
        No active environment alerts. All monitored environments are within range.
      </div>
    );
  }
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-warning" />
          <h3 className="font-display font-semibold">Environment Notifications</h3>
          <span className="text-xs text-muted-foreground">{alerts.length} active · {unackCount} unacknowledged</span>
        </div>
        {unackCount > 0 && <Button size="sm" variant="outline" onClick={onAckAll}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Mark all read</Button>}
      </div>
      <div className="divide-y divide-border">
        {[...alerts].reverse().map(a => (
          <div key={a.id} className={cn("p-4 flex items-start gap-3", a.acknowledgedAt && 'opacity-60')}>
            <AlertTriangle className={cn("h-4 w-4 mt-0.5 shrink-0", a.severity === 'critical' ? 'text-destructive' : 'text-warning')} />
            <div className="flex-1 min-w-0 text-sm space-y-0.5">
              <div className="font-medium">
                {a.environmentName}
                <span className="text-muted-foreground font-normal"> · {a.batchNames.join(', ') || '—'}</span>
              </div>
              <div className="text-muted-foreground text-xs">
                Temp <span className="text-foreground">{a.temperature != null ? `${a.temperature.toFixed(1)}°C` : '—'}</span> (rec {a.tempRange[0]}–{a.tempRange[1]}°C · {a.tempStatus}) ·{' '}
                Humidity <span className="text-foreground">{a.humidity != null ? `${a.humidity.toFixed(1)}%` : '—'}</span> (rec {a.humidityRange[0]}–{a.humidityRange[1]}% · {a.humidityStatus})
              </div>
              <div className="text-[11px] text-muted-foreground">{new Date(a.triggeredAt).toLocaleString()}{a.acknowledgedAt && ` · acknowledged ${new Date(a.acknowledgedAt).toLocaleString()}`}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn("text-[11px] rounded-full px-2 py-0.5 font-medium", a.severity === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>{a.severity}</span>
              {!a.acknowledgedAt && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAck(a.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Acknowledge</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- alert history ---------------- */

interface HistoryFilters {
  search: string;
  severity: 'all' | 'warning' | 'critical';
  status: 'all' | 'active' | 'resolved' | 'acknowledged' | 'unacknowledged';
  from: string;
  to: string;
  pageSize: number;
}

const DEFAULT_HISTORY: HistoryFilters = { search: '', severity: 'all', status: 'all', from: '', to: '', pageSize: 10 };

function outOfRangeParam(a: EnvironmentAlert): string {
  const parts: string[] = [];
  if (a.tempStatus !== 'ok' && a.tempStatus !== 'unknown') parts.push(`Temperature (${a.tempStatus})`);
  if (a.humidityStatus !== 'ok' && a.humidityStatus !== 'unknown') parts.push(`Humidity (${a.humidityStatus})`);
  return parts.join(' + ') || '—';
}

function AlertHistory({ alerts, environments, onAck }: { alerts: EnvironmentAlert[]; environments: Environment[]; onAck: (id: string) => void }) {
  const [open, setOpen] = useLocalStorage<boolean>('env.history.open', true);
  const [filters, setFilters] = useLocalStorage<HistoryFilters>('env.history.filters', DEFAULT_HISTORY);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const from = filters.from ? new Date(filters.from + 'T00:00:00').getTime() : null;
    const to = filters.to ? new Date(filters.to + 'T23:59:59').getTime() : null;
    return alerts.filter(a => {
      if (q && !a.environmentName.toLowerCase().includes(q) && !a.batchNames.join(' ').toLowerCase().includes(q)) return false;
      if (filters.severity !== 'all' && a.severity !== filters.severity) return false;
      if (filters.status === 'active' && !a.active) return false;
      if (filters.status === 'resolved' && a.active) return false;
      if (filters.status === 'acknowledged' && !a.acknowledgedAt) return false;
      if (filters.status === 'unacknowledged' && a.acknowledgedAt) return false;
      const t = new Date(a.triggeredAt).getTime();
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    }).sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
  }, [alerts, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);
  const paged = filtered.slice((page - 1) * filters.pageSize, page * filters.pageSize);

  const setPatch = (p: Partial<HistoryFilters>) => { setFilters(f => ({ ...f, ...p })); setPage(1); };

  const doExport = () => {
    exportToCsv('environment-alerts', [
      { header: 'Triggered', value: (a: EnvironmentAlert) => new Date(a.triggeredAt).toLocaleString() },
      { header: 'Resolved', value: a => a.resolvedAt ? new Date(a.resolvedAt).toLocaleString() : '' },
      { header: 'Acknowledged', value: a => a.acknowledgedAt ? new Date(a.acknowledgedAt).toLocaleString() : '' },
      { header: 'Environment', value: a => a.environmentName },
      { header: 'Batches', value: a => a.batchNames.join('; ') },
      { header: 'Severity', value: a => a.severity },
      { header: 'Status', value: a => a.active ? 'Active' : 'Resolved' },
      { header: 'Temperature', value: a => a.temperature != null ? `${a.temperature.toFixed(1)}°C` : '' },
      { header: 'Temp Range', value: a => `${a.tempRange[0]}-${a.tempRange[1]}°C` },
      { header: 'Humidity', value: a => a.humidity != null ? `${a.humidity.toFixed(1)}%` : '' },
      { header: 'Humidity Range', value: a => `${a.humidityRange[0]}-${a.humidityRange[1]}%` },
      { header: 'Out of Range', value: a => outOfRangeParam(a) },
    ], filtered);
  };

  if (alerts.length === 0) return null;

  const resolvedCount = alerts.filter(a => !a.active).length;
  const activeCount = alerts.length - resolvedCount;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <CollapsibleTrigger className="flex items-center gap-2 hover:text-primary transition-colors">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <div className="text-left">
            <h3 className="font-display font-semibold">Alert History</h3>
            <p className="text-xs text-muted-foreground">{alerts.length} total · {activeCount} active · {resolvedCount} resolved</p>
          </div>
        </CollapsibleTrigger>
        <Button size="sm" variant="outline" onClick={doExport} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
        </Button>
      </div>
      <CollapsibleContent>
        <div className="p-4 space-y-3 border-b border-border bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={filters.search} onChange={e => setPatch({ search: e.target.value })} placeholder="Search environment or batch…" className="pl-8 h-9" />
            </div>
            <Select value={filters.severity} onValueChange={v => setPatch({ severity: v as HistoryFilters['severity'] })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severity</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={v => setPatch({ status: v as HistoryFilters['status'] })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="unacknowledged">Unacknowledged</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(filters.pageSize)} onValueChange={v => setPatch({ pageSize: Number(v) })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="25">25 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={filters.from} onChange={e => setPatch({ from: e.target.value })} className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={filters.to} onChange={e => setPatch({ to: e.target.value })} className="h-9" />
            </div>
            <div className="md:col-span-2 flex items-end justify-end">
              <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_HISTORY)}>Reset filters</Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">Showing {filtered.length} of {alerts.length}</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No alerts match your filters.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Triggered</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Batches</TableHead>
                    <TableHead>Reading</TableHead>
                    <TableHead>Out of range</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Resolved</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(a.triggeredAt).toLocaleString()}</TableCell>
                      <TableCell className="font-medium text-sm">{a.environmentName}</TableCell>
                      <TableCell className="text-sm">{a.batchNames.join(', ') || '—'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {a.temperature != null ? `${a.temperature.toFixed(1)}°C` : '—'} · {a.humidity != null ? `${a.humidity.toFixed(1)}%` : '—'}
                        <div className="text-[10px] text-muted-foreground">rec {a.tempRange[0]}–{a.tempRange[1]}°C / {a.humidityRange[0]}–{a.humidityRange[1]}%</div>
                      </TableCell>
                      <TableCell className="text-xs">{outOfRangeParam(a)}</TableCell>
                      <TableCell>
                        <span className={cn("text-[11px] rounded-full px-2 py-0.5 font-medium", a.severity === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>{a.severity}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {a.active ? (
                          a.acknowledgedAt
                            ? <span className="text-warning">Active · acknowledged</span>
                            : <span className="text-warning">Active</span>
                        ) : (
                          a.acknowledgedAt
                            ? <span className="text-muted-foreground">Resolved · acknowledged</span>
                            : <span className="text-muted-foreground">Resolved</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{a.resolvedAt ? new Date(a.resolvedAt).toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-right">
                        {!a.acknowledgedAt && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAck(a.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark read
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filtered.length > filters.pageSize && (
              <div className="p-3 border-t border-border">
                <Pagination page={page} totalPages={totalPages} onChange={setPage} total={filtered.length} pageSize={filters.pageSize} />
              </div>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ---------------- empty states + skeleton ---------------- */

function EmptyState({ kind, onAdd, onClear }: { kind: 'none' | 'filtered'; onAdd?: () => void; onClear?: () => void }) {
  if (kind === 'none') {
    return (
      <div className="bg-card rounded-xl border border-dashed border-border p-12 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-4">
          <Thermometer className="h-7 w-7 text-primary" />
        </div>
        <h3 className="font-display font-semibold text-lg">No environments yet</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
          Create an environment to link a Firebase temperature/humidity sensor to your active batches. You'll get live monitoring, age-based recommendations, and automatic alerts.
        </p>
        <Button onClick={onAdd}><Plus className="h-4 w-4 mr-2" />Include Environment</Button>
      </div>
    );
  }
  return (
    <div className="bg-card rounded-xl border border-dashed border-border p-10 text-center">
      <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
      <h3 className="font-display font-semibold">No environments match</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-4">Try clearing filters or the search term.</p>
      <Button variant="outline" onClick={onClear}><X className="h-4 w-4 mr-2" />Reset filters</Button>
    </div>
  );
}

function EnvironmentSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-40" /><Skeleton className="h-9 w-44" /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
      </div>
    </div>
  );
}
