import { useCallback, useEffect, useState } from 'react';

type Primitive = string | number;

/**
 * Table UI state (search / sort / filter / pagination) persisted in the URL
 * query string so links are shareable and refreshes keep your place.
 * Params are namespaced with `<prefix>_` to avoid clashing with other state.
 */
export function useUrlTableState<T extends Record<string, Primitive>>(prefix: string, defaults: T) {
  const key = (k: string) => `${prefix}_${k}`;

  const read = useCallback((): T => {
    if (typeof window === 'undefined') return defaults;
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    (Object.keys(defaults) as (keyof T)[]).forEach(k => {
      const raw = params.get(key(String(k)));
      if (raw === null) return;
      (next as Record<string, Primitive>)[String(k)] =
        typeof defaults[k] === 'number' ? (Number(raw) || 0) : raw;
    });
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix]);

  const [state, setState] = useState<T>(read);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    (Object.keys(defaults) as (keyof T)[]).forEach(k => {
      const name = key(String(k));
      const v = state[k];
      if (v === '' || v === defaults[k]) params.delete(name);
      else params.set(name, String(v));
    });
    const qs = params.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState(window.history.state, '', url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, prefix]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setState(read());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [read]);

  const patch = useCallback((p: Partial<T>) => setState(s => ({ ...s, ...p })), []);

  return [state, patch] as const;
}