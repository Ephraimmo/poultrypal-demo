/**
 * Sentinel value used for optional / "empty" filter or select options.
 *
 * Radix Select forbids `<SelectItem value="">` because the empty string is
 * reserved for clearing the selection. Use this sentinel anywhere you would
 * otherwise have passed `""` as a meaningful option value, and translate
 * to/from the underlying empty string at the data layer.
 */
export const NONE_SENTINEL = '__none__';

/** Convert a possibly-empty string into a sentinel-safe Select value. */
export function toSentinel(value: string | null | undefined): string {
  return value && value.length > 0 ? value : NONE_SENTINEL;
}

/** Convert a sentinel-safe Select value back to the underlying empty string. */
export function fromSentinel(value: string | null | undefined): string {
  if (!value || value === NONE_SENTINEL) return '';
  return value;
}

/** True when a value represents the "none" / empty selection. */
export function isNoneSentinel(value: string | null | undefined): boolean {
  return !value || value === NONE_SENTINEL;
}
