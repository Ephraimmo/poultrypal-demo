/**
 * Shared numeric coercion utilities. Use these instead of inline `n = ...`
 * helpers so that null/undefined/NaN never leak into totals and cause "RNaN".
 */

/** Coerce any value to a finite number. undefined/null/NaN/Infinity/'' → 0. */
export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const x = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

/** Sum a list by extractor, safe against null/undefined values. */
export function sumBy<T>(items: readonly T[], fn: (t: T) => unknown): number {
  return items.reduce<number>((s, t) => s + toNum(fn(t)), 0);
}

/**
 * Percentage of `part / whole`, clamped to [0, 100].
 * Divide-by-zero, negatives, and non-finite inputs return 0.
 */
export function pct(part: unknown, whole: unknown): number {
  const p = toNum(part);
  const w = toNum(whole);
  if (w <= 0) return 0;
  const raw = (p / w) * 100;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, raw));
}
