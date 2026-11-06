import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type Listener = (snap: { val: () => unknown }) => void;
type ErrorListener = (err: Error) => void;

const listeners = new Map<string, { onData: Listener; onError: ErrorListener }>();
const set = vi.fn((_path: string, _value: unknown) => Promise.resolve());

vi.mock('@/lib/firebase', () => ({
  db: {},
  ref: (_db: unknown, path: string) => path,
  set: (path: string, value: unknown) => set(path, value),
  onValue: (path: string, onData: Listener, onError: ErrorListener) => {
    listeners.set(path, { onData, onError });
    return () => listeners.delete(path);
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { useFirebaseSync } from './useFirebaseSync';

// In-memory browser storage, so the test does not depend on how the Node or
// jsdom version in use exposes localStorage.
const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
vi.stubGlobal('localStorage', storage);

const emit = (path: string, value: unknown) =>
  act(() => listeners.get(path)!.onData({ val: () => value }));

beforeEach(() => {
  listeners.clear();
  set.mockClear();
  storage.clear();
});

describe('useFirebaseSync', () => {
  it('shows only what Firebase sends, ignoring anything saved in the browser', () => {
    storage.setItem('farm-batches', JSON.stringify([{ id: 'stale-browser-copy' }]));
    const { result } = renderHook(() => useFirebaseSync<{ id: string }[]>('batches', []));

    expect(result.current[2]).toBe(false); // not loaded until Firebase answers
    expect(result.current[0]).toEqual([]);

    emit('batches', { 0: { id: 'a' }, 1: { id: 'b' } });
    expect(result.current[0]).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.current[2]).toBe(true);
  });

  it('follows changes made from another browser', () => {
    const { result } = renderHook(() => useFirebaseSync<{ id: string }[]>('sales', []));
    emit('sales', [{ id: 'a' }]);
    act(() => result.current[1](prev => [...prev, { id: 'mine' }]));
    emit('sales', [{ id: 'a' }, { id: 'mine' }]); // echo of our own write
    emit('sales', [{ id: 'a' }, { id: 'mine' }, { id: 'other-browser' }]);
    expect(result.current[0].map(r => r.id)).toEqual(['a', 'mine', 'other-browser']);
  });

  it('writes every change to Firebase and never to localStorage', () => {
    const { result } = renderHook(() => useFirebaseSync<{ id: string; note?: string }[]>('feed', []));
    emit('feed', []);
    act(() => {
      result.current[1](prev => [...prev, { id: 'x', note: undefined }]);
      result.current[1](prev => [...prev, { id: 'y' }]);
    });
    expect(set).toHaveBeenLastCalledWith('feed', [{ id: 'x', note: null }, { id: 'y' }]);
    expect(result.current[0].map(r => r.id)).toEqual(['x', 'y']);
    expect(storage.length).toBe(0);
  });

  it('reports a refused read instead of falling back to browser data', () => {
    storage.setItem('farm-health', JSON.stringify([{ id: 'stale' }]));
    const { result } = renderHook(() => useFirebaseSync<{ id: string }[]>('health', []));
    act(() => listeners.get('health')!.onError(new Error('permission_denied')));
    expect(result.current[3]).toBe('permission_denied');
    expect(result.current[2]).toBe(false);
    expect(result.current[0]).toEqual([]);
  });
});
