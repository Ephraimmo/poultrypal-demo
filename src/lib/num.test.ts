import { describe, it, expect } from 'vitest';
import { toNum, pct, sumBy } from './num';

describe('toNum', () => {
  it('passes through finite numbers', () => {
    expect(toNum(0)).toBe(0);
    expect(toNum(42)).toBe(42);
    expect(toNum(-3.5)).toBe(-3.5);
  });
  it('parses numeric strings', () => {
    expect(toNum('12.5')).toBe(12.5);
    expect(toNum('  7 ')).toBe(7);
  });
  it('returns 0 for undefined, null, empty, NaN, Infinity, garbage', () => {
    expect(toNum(undefined)).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum('')).toBe(0);
    expect(toNum(NaN)).toBe(0);
    expect(toNum(Infinity)).toBe(0);
    expect(toNum(-Infinity)).toBe(0);
    expect(toNum('abc')).toBe(0);
    expect(toNum({})).toBe(0);
  });
});

describe('pct', () => {
  it('computes percentage', () => {
    expect(pct(400, 1000)).toBe(40);
    expect(pct(600, 1000)).toBe(60);
  });
  it('returns 0 for zero/negative whole or nullish inputs', () => {
    expect(pct(50, 0)).toBe(0);
    expect(pct(50, -10)).toBe(0);
    expect(pct(undefined, 100)).toBe(0);
    expect(pct(50, null)).toBe(0);
  });
  it('clamps to [0,100]', () => {
    expect(pct(1500, 1000)).toBe(100);
    expect(pct(-50, 1000)).toBe(0);
  });
});

describe('sumBy', () => {
  it('sums with null/undefined-safe extraction', () => {
    expect(sumBy([{ a: 1 }, { a: undefined }, { a: '2' }, { a: null }], x => x.a)).toBe(3);
  });
});
