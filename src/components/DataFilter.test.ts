import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyDataFilter,
  defaultFilterValue,
  deserializeFilter,
  hasFilterParams,
  isCustomRangeInvalid,
  resolveDateRange,
  serializeFilter,
  type FilterValue,
} from './DataFilter';

type Row = { id: string; date: string; batchId: string; note: string; category: string };

const today = new Date().toISOString().slice(0, 10);
const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

const rows: Row[] = [
  { id: '1', date: today, batchId: 'b1', note: 'Vaccine A', category: 'vaccination' },
  { id: '2', date: '2000-01-01', batchId: 'b2', note: 'Disease outbreak', category: 'disease' },
  { id: '3', date: twoDaysAgo, batchId: 'b1', note: 'Treatment B', category: 'treatment' },
];

describe('applyDataFilter', () => {
  it('returns all items with default filter', () => {
    expect(applyDataFilter(rows, defaultFilterValue, { dateField: r => r.date }).length).toBe(3);
  });

  it('filters by search across multiple fields', () => {
    const out = applyDataFilter(rows, { ...defaultFilterValue, search: 'vaccine' }, {
      searchFields: r => [r.note, r.category],
    });
    expect(out.map(r => r.id)).toEqual(['1']);
  });

  it('filters by date preset (last 7 days excludes old)', () => {
    const out = applyDataFilter(rows, { ...defaultFilterValue, datePreset: 'week' }, {
      dateField: r => r.date,
    });
    expect(out.map(r => r.id).sort()).toEqual(['1', '3']);
  });

  it('filters by select field', () => {
    const out = applyDataFilter(rows, { ...defaultFilterValue, selects: { batch: 'b1' } }, {
      selectFields: { batch: r => r.batchId },
    });
    expect(out.map(r => r.id).sort()).toEqual(['1', '3']);
  });

  it('treats "all" as no constraint', () => {
    const out = applyDataFilter(rows, { ...defaultFilterValue, selects: { batch: 'all' } }, {
      selectFields: { batch: r => r.batchId },
    });
    expect(out.length).toBe(3);
  });

  it('combines search, date, and select', () => {
    const out = applyDataFilter(rows, {
      ...defaultFilterValue,
      datePreset: 'week',
      search: 'treatment',
      selects: { batch: 'b1', cat: 'treatment' },
    }, {
      dateField: r => r.date,
      searchFields: r => [r.note],
      selectFields: { batch: r => r.batchId, cat: r => r.category },
    });
    expect(out.map(r => r.id)).toEqual(['3']);
  });

  it('custom range respects from/to', () => {
    const out = applyDataFilter(rows, {
      ...defaultFilterValue,
      datePreset: 'custom',
      dateFrom: '1999-01-01',
      dateTo: '2001-01-01',
    }, { dateField: r => r.date });
    expect(out.map(r => r.id)).toEqual(['2']);
  });

  it('invalid custom range (from > to) is ignored — does not apply date filter', () => {
    const out = applyDataFilter(rows, {
      ...defaultFilterValue,
      datePreset: 'custom',
      dateFrom: '2025-12-31',
      dateTo: '2025-01-01',
    }, { dateField: r => r.date });
    expect(out.length).toBe(3);
  });
});

describe('resolveDateRange', () => {
  it('returns nulls for "all"', () => {
    const { from, to } = resolveDateRange(defaultFilterValue);
    expect(from).toBeNull();
    expect(to).toBeNull();
  });
  it('returns a window for "today"', () => {
    const { from, to } = resolveDateRange({ ...defaultFilterValue, datePreset: 'today' });
    expect(from).toBeInstanceOf(Date);
    expect(to).toBeInstanceOf(Date);
    expect(to!.getTime()).toBeGreaterThan(from!.getTime());
  });
  it('returns nulls for invalid custom range', () => {
    const { from, to } = resolveDateRange({
      ...defaultFilterValue, datePreset: 'custom',
      dateFrom: '2025-06-01', dateTo: '2025-05-01',
    });
    expect(from).toBeNull();
    expect(to).toBeNull();
  });
});

describe('isCustomRangeInvalid', () => {
  it('false when preset is not custom', () => {
    expect(isCustomRangeInvalid(defaultFilterValue)).toBe(false);
  });
  it('false when either bound is missing', () => {
    expect(isCustomRangeInvalid({ ...defaultFilterValue, datePreset: 'custom', dateFrom: '2025-01-01' })).toBe(false);
  });
  it('true when from > to', () => {
    expect(isCustomRangeInvalid({
      ...defaultFilterValue, datePreset: 'custom',
      dateFrom: '2025-12-31', dateTo: '2025-01-01',
    })).toBe(true);
  });
});

describe('URL serialization', () => {
  const value: FilterValue = {
    search: 'cough',
    datePreset: 'custom',
    dateFrom: '2025-01-01',
    dateTo: '2025-01-31',
    selects: { batch: 'b1', cause: 'Disease' },
  };

  it('round-trips through URLSearchParams', () => {
    const params = serializeFilter(value);
    expect(hasFilterParams(params)).toBe(true);
    const restored = deserializeFilter(params);
    expect(restored).toEqual(value);
  });

  it('omits default fields from query string', () => {
    const params = serializeFilter(defaultFilterValue);
    expect(params.toString()).toBe('');
    expect(hasFilterParams(params)).toBe(false);
  });

  it('preserves non-filter query params', () => {
    const params = new URLSearchParams('tab=overview');
    serializeFilter({ ...defaultFilterValue, search: 'hen' }, params);
    expect(params.get('tab')).toBe('overview');
    expect(params.get('f_q')).toBe('hen');
  });

  it('strips stale filter params on re-serialize', () => {
    const params = new URLSearchParams('f_q=old&f_s_batch=bx');
    serializeFilter({ ...defaultFilterValue, search: 'new' }, params);
    expect(params.get('f_q')).toBe('new');
    expect(params.get('f_s_batch')).toBeNull();
  });
});

/* ---- Cross-page filter consistency: same filter, multiple datasets ---- */

describe('cross-page consistency', () => {
  const datasets = {
    health: rows.map(r => ({ ...r, _kind: 'health' })),
    expenses: rows.map(r => ({ ...r, _kind: 'expense', amount: 10 })),
    sales: rows.map(r => ({ ...r, _kind: 'sale' })),
    feed: rows.map(r => ({ ...r, _kind: 'feed' })),
    mortality: rows.map(r => ({ ...r, _kind: 'mortality' })),
    environment: rows.map(r => ({ ...r, _kind: 'env' })),
    growth: rows.map(r => ({ ...r, _kind: 'growth' })),
  };

  it('applies the same week-window filter consistently across every page', () => {
    const filter = { ...defaultFilterValue, datePreset: 'week' as const };
    const counts = Object.values(datasets).map(ds =>
      applyDataFilter(ds, filter, { dateField: r => r.date }).length,
    );
    // Every page sees the same 2 in-window rows
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(2);
  });

  it('batch filter narrows every page identically', () => {
    const filter = { ...defaultFilterValue, selects: { batch: 'b1' } };
    const counts = Object.values(datasets).map(ds =>
      applyDataFilter(ds, filter, { selectFields: { batch: r => r.batchId } }).length,
    );
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(2);
  });
});

describe('useFilterState (URL hydration)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/test');
    window.localStorage.clear();
  });

  it('hydrates from URL on mount via deserializeFilter', async () => {
    window.history.replaceState(null, '', '/test?f_q=abc&f_s_batch=b1');
    const { useFilterState } = await import('@/hooks/useFilterState');
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useFilterState('xpage'));
    expect(result.current[0].search).toBe('abc');
    expect(result.current[0].selects.batch).toBe('b1');
    act(() => {
      result.current[1]({ ...result.current[0], search: 'xyz' });
    });
    expect(window.location.search).toContain('f_q=xyz');
    expect(window.localStorage.getItem('filter:xpage')).toContain('xyz');
  });

  it('falls back to localStorage when URL has no filter params', async () => {
    window.localStorage.setItem('filter:ypage', JSON.stringify({ ...defaultFilterValue, search: 'persisted' }));
    const { useFilterState } = await import('@/hooks/useFilterState');
    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => useFilterState('ypage'));
    expect(result.current[0].search).toBe('persisted');
  });
});
