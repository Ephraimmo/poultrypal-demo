import { useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, Filter, AlertTriangle } from 'lucide-react';

export type DatePreset = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

export interface FilterValue {
  search: string;
  datePreset: DatePreset;
  dateFrom?: string;
  dateTo?: string;
  selects: Record<string, string>;
}

export interface SelectFilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const defaultFilterValue: FilterValue = {
  search: '',
  datePreset: 'all',
  dateFrom: '',
  dateTo: '',
  selects: {},
};

export interface DataFilterProps {
  value: FilterValue;
  onChange: (v: FilterValue) => void;
  showSearch?: boolean;
  searchPlaceholder?: string;
  showDate?: boolean;
  selects?: SelectFilterConfig[];
  resultCount?: number;
  totalCount?: number;
  className?: string;
}

const PRESET_LABELS: Record<DatePreset, string> = {
  all: 'All time',
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
  year: 'Last year',
  custom: 'Custom range',
};

/** True when the custom range is set but dateFrom > dateTo. */
export function isCustomRangeInvalid(value: FilterValue): boolean {
  if (value.datePreset !== 'custom') return false;
  if (!value.dateFrom || !value.dateTo) return false;
  return new Date(value.dateFrom) > new Date(value.dateTo);
}

/**
 * Resolve the [from, to] date window (inclusive) for the given filter value.
 * Returns nulls when no filter is applied or when a custom range is invalid.
 */
export function resolveDateRange(value: FilterValue): { from: Date | null; to: Date | null } {
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  switch (value.datePreset) {
    case 'all': return { from: null, to: null };
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'week': { const f = startOfDay(now); f.setDate(f.getDate() - 6); return { from: f, to: endOfDay(now) }; }
    case 'month': { const f = startOfDay(now); f.setDate(f.getDate() - 29); return { from: f, to: endOfDay(now) }; }
    case 'year': { const f = startOfDay(now); f.setFullYear(f.getFullYear() - 1); return { from: f, to: endOfDay(now) }; }
    case 'custom':
      if (isCustomRangeInvalid(value)) return { from: null, to: null };
      return {
        from: value.dateFrom ? startOfDay(new Date(value.dateFrom)) : null,
        to: value.dateTo ? endOfDay(new Date(value.dateTo)) : null,
      };
  }
}

export interface ApplyFilterOptions<T> {
  dateField?: (item: T) => string | undefined;
  searchFields?: (item: T) => (string | undefined | number | null)[];
  selectFields?: Record<string, (item: T) => string | undefined>;
}

export function applyDataFilter<T>(items: T[], value: FilterValue, opts: ApplyFilterOptions<T> = {}): T[] {
  const { from, to } = resolveDateRange(value);
  const search = value.search.trim().toLowerCase();
  const activeSelects = Object.entries(value.selects).filter(([, v]) => v && v !== 'all');

  return items.filter(item => {
    if ((from || to) && opts.dateField) {
      const raw = opts.dateField(item);
      if (!raw) return false;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    if (search && opts.searchFields) {
      const fields = opts.searchFields(item).map(f => (f == null ? '' : String(f).toLowerCase()));
      if (!fields.some(f => f.includes(search))) return false;
    }
    for (const [key, selVal] of activeSelects) {
      const accessor = opts.selectFields?.[key];
      if (!accessor) continue;
      const itemVal = accessor(item);
      if ((itemVal ?? '') !== selVal) return false;
    }
    return true;
  });
}

/* ---------------- URL serialization ---------------- */

const URL_PREFIX = 'f_';

export function serializeFilter(value: FilterValue, target?: URLSearchParams): URLSearchParams {
  const params = target ?? new URLSearchParams();
  // Clear any prior filter keys
  [...params.keys()].filter(k => k.startsWith(URL_PREFIX)).forEach(k => params.delete(k));
  if (value.search.trim()) params.set(`${URL_PREFIX}q`, value.search.trim());
  if (value.datePreset && value.datePreset !== 'all') params.set(`${URL_PREFIX}dp`, value.datePreset);
  if (value.datePreset === 'custom') {
    if (value.dateFrom) params.set(`${URL_PREFIX}df`, value.dateFrom);
    if (value.dateTo) params.set(`${URL_PREFIX}dt`, value.dateTo);
  }
  for (const [k, v] of Object.entries(value.selects)) {
    if (v && v !== 'all') params.set(`${URL_PREFIX}s_${k}`, v);
  }
  return params;
}

export function deserializeFilter(params: URLSearchParams): FilterValue {
  const selects: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    if (k.startsWith(`${URL_PREFIX}s_`)) selects[k.slice(URL_PREFIX.length + 2)] = v;
  }
  const dp = params.get(`${URL_PREFIX}dp`) as DatePreset | null;
  return {
    search: params.get(`${URL_PREFIX}q`) ?? '',
    datePreset: dp && ['today','week','month','year','custom'].includes(dp) ? dp : 'all',
    dateFrom: params.get(`${URL_PREFIX}df`) ?? '',
    dateTo: params.get(`${URL_PREFIX}dt`) ?? '',
    selects,
  };
}

/** True when any filter param is present in a URLSearchParams. */
export function hasFilterParams(params: URLSearchParams): boolean {
  for (const k of params.keys()) if (k.startsWith(URL_PREFIX)) return true;
  return false;
}

/* ---------------- Chips ---------------- */

interface ChipDescriptor {
  id: string;
  label: string;
  clear: () => void;
}

function buildChips(value: FilterValue, selects: SelectFilterConfig[], onChange: (v: FilterValue) => void): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [];
  if (value.search.trim()) {
    chips.push({ id: 'search', label: `Search: "${value.search.trim()}"`, clear: () => onChange({ ...value, search: '' }) });
  }
  if (value.datePreset && value.datePreset !== 'all') {
    let label = `Date: ${PRESET_LABELS[value.datePreset]}`;
    if (value.datePreset === 'custom') {
      const parts: string[] = [];
      if (value.dateFrom) parts.push(`from ${value.dateFrom}`);
      if (value.dateTo) parts.push(`to ${value.dateTo}`);
      label = parts.length ? `Date: ${parts.join(' ')}` : 'Date: Custom';
    }
    chips.push({ id: 'date', label, clear: () => onChange({ ...value, datePreset: 'all', dateFrom: '', dateTo: '' }) });
  }
  for (const sel of selects) {
    const v = value.selects[sel.key];
    if (!v || v === 'all') continue;
    const opt = sel.options.find(o => o.value === v);
    chips.push({
      id: `sel_${sel.key}`,
      label: `${sel.label}: ${opt?.label ?? v}`,
      clear: () => onChange({ ...value, selects: { ...value.selects, [sel.key]: 'all' } }),
    });
  }
  return chips;
}

export function DataFilter({
  value, onChange,
  showSearch = true, searchPlaceholder = 'Search…',
  showDate = true, selects = [],
  resultCount, totalCount, className = '',
}: DataFilterProps) {
  const isDirty = useMemo(() => {
    if (value.search.trim()) return true;
    if (value.datePreset !== 'all') return true;
    if (Object.values(value.selects).some(v => v && v !== 'all')) return true;
    return false;
  }, [value]);

  const rangeInvalid = isCustomRangeInvalid(value);
  const chips = useMemo(() => buildChips(value, selects, onChange), [value, selects, onChange]);

  // Auto-prune select values that no longer match any configured option.
  // This avoids ghost filters (e.g., stale batch ids) hiding all records.
  useEffect(() => {
    const stale: string[] = [];
    for (const sel of selects) {
      const v = value.selects[sel.key];
      if (!v || v === 'all') continue;
      if (!sel.options.some(o => o.value === v)) stale.push(sel.key);
    }
    if (stale.length === 0) return;
    const nextSelects = { ...value.selects };
    for (const k of stale) delete nextSelects[k];
    onChange({ ...value, selects: nextSelects });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selects, value.selects]);

  const update = (patch: Partial<FilterValue>) => onChange({ ...value, ...patch });
  const setSelect = (key: string, v: string) => onChange({ ...value, selects: { ...value.selects, [key]: v } });
  const clear = () => onChange(defaultFilterValue);

  return (
    <div className={`space-y-3 rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:p-4 ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Filter className="h-3.5 w-3.5" /></span>Filter records</div>
        {(resultCount !== undefined || totalCount !== undefined) && <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{resultCount ?? totalCount ?? 0} results</span>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {showSearch && (
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Filter className="h-3 w-3" /> Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input value={value.search} onChange={e => update({ search: e.target.value })} placeholder={searchPlaceholder} className="pl-8" aria-label="Search records" />
            </div>
          </div>
        )}

        {showDate && (
          <div className="min-w-[140px]">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Select value={value.datePreset} onValueChange={v => update({ datePreset: v as DatePreset })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PRESET_LABELS) as DatePreset[]).map(p => (
                  <SelectItem key={p} value={p}>{PRESET_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selects.map(s => (
          <div key={s.key} className="min-w-[140px]">
            <Label className="text-xs text-muted-foreground">{s.label}</Label>
            <Select value={value.selects[s.key] || 'all'} onValueChange={v => setSelect(s.key, v)}>
              <SelectTrigger><SelectValue placeholder={s.placeholder || 'All'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {s.label.toLowerCase()}</SelectItem>
                {s.options.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {isDirty && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-9">
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {showDate && value.datePreset === 'custom' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={value.dateFrom || ''} onChange={e => update({ dateFrom: e.target.value })} aria-invalid={rangeInvalid} />
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={value.dateTo || ''} onChange={e => update({ dateTo: e.target.value })} aria-invalid={rangeInvalid} />
            </div>
          </div>
          {rangeInvalid && (
            <div role="alert" className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2.5 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>"From" must be on or before "To". Fix the range to apply the date filter.</span>
            </div>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Active filters">
          {chips.map(c => (
            <Badge key={c.id} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5 text-xs font-medium">
              {c.label}
              <button
                type="button"
                onClick={c.clear}
                aria-label={`Remove ${c.label}`}
                className="rounded hover:bg-foreground/10 p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {(resultCount !== undefined || totalCount !== undefined) && (
        <div className="text-xs text-muted-foreground">
          {isDirty
            ? <>Showing <span className="font-semibold text-foreground">{resultCount ?? 0}</span> of {totalCount ?? 0} record{(totalCount ?? 0) === 1 ? '' : 's'}</>
            : <>{totalCount ?? resultCount ?? 0} record{((totalCount ?? resultCount ?? 0)) === 1 ? '' : 's'}</>
          }
        </div>
      )}
    </div>
  );
}
