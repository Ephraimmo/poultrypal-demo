import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultFilterValue,
  deserializeFilter,
  hasFilterParams,
  serializeFilter,
  type FilterValue,
} from '@/components/DataFilter';

const storageKey = (key: string) => `filter:${key}`;

function readInitial(key: string): FilterValue {
  if (typeof window === 'undefined') return defaultFilterValue;
  try {
    const params = new URLSearchParams(window.location.search);
    if (hasFilterParams(params)) return { ...defaultFilterValue, ...deserializeFilter(params) };
  } catch { /* ignore */ }
  try {
    const stored = window.localStorage.getItem(storageKey(key));
    if (stored) return { ...defaultFilterValue, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return defaultFilterValue;
}

/**
 * Filter state synced to URL query string and localStorage. Filters survive
 * navigation away/back per-page, and the URL is always shareable.
 */
export function useFilterState(key: string) {
  const [value, setValueState] = useState<FilterValue>(() => readInitial(key));
  const mounted = useRef(false);

  // Sync URL + localStorage whenever value changes (after mount).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!mounted.current) { mounted.current = true; }
    try {
      const params = new URLSearchParams(window.location.search);
      serializeFilter(value, params);
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
      window.history.replaceState(window.history.state, '', url);
    } catch { /* ignore */ }
    try {
      window.localStorage.setItem(storageKey(key), JSON.stringify(value));
    } catch { /* ignore */ }
  }, [value, key]);

  // Re-hydrate when the route changes (popstate) so back/forward keeps the URL truthful.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setValueState(readInitial(key));
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [key]);

  const setValue = useCallback((v: FilterValue | ((prev: FilterValue) => FilterValue)) => {
    setValueState(prev => (typeof v === 'function' ? (v as (p: FilterValue) => FilterValue)(prev) : v));
  }, []);

  return [value, setValue] as const;
}
