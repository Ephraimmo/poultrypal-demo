import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataFilter, defaultFilterValue, type FilterValue } from '@/components/DataFilter';
import { NONE_SENTINEL, fromSentinel, toSentinel } from '@/lib/filter-sentinel';

describe('SelectItem dev guardrail', () => {
  it('throws a clear error when value is an empty string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Suppress React's error boundary noise as well
    expect(() =>
      render(
        <Select>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={'' as string}>Bad</SelectItem>
          </SelectContent>
        </Select>,
      ),
    ).toThrow(/non-empty `value`/);
    spy.mockRestore();
  });

  it('accepts the shared NONE sentinel', () => {
    expect(() =>
      render(
        <Select defaultValue={NONE_SENTINEL}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_SENTINEL}>General</SelectItem>
          </SelectContent>
        </Select>,
      ),
    ).not.toThrow();
  });
});

describe('filter sentinel helpers', () => {
  it('round-trips empty values through the sentinel', () => {
    expect(toSentinel('')).toBe(NONE_SENTINEL);
    expect(toSentinel(undefined)).toBe(NONE_SENTINEL);
    expect(toSentinel('abc')).toBe('abc');
    expect(fromSentinel(NONE_SENTINEL)).toBe('');
    expect(fromSentinel('abc')).toBe('abc');
  });
});

function Harness() {
  const [value, setValue] = useState<FilterValue>(defaultFilterValue);
  return (
    <DataFilter
      value={value}
      onChange={setValue}
      showDate={false}
      selects={[{
        key: 'batch', label: 'Batch', options: [
          { value: NONE_SENTINEL, label: 'General' },
          { value: 'b1', label: 'Batch 1' },
        ],
      }]}
      totalCount={10}
      resultCount={10}
    />
  );
}

describe('DataFilter dropdowns (e2e-style)', () => {
  it('renders all configured select options without crashing', () => {
    render(<Harness />);
    const triggers = screen.getAllByRole('combobox');
    fireEvent.click(triggers[0]);
    // Both options must render — proves no empty-value crash
    expect(screen.getAllByText(/General/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Batch 1/).length).toBeGreaterThan(0);
  });
});
