import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { db, ref, set, onValue } from '@/lib/firebase';

/**
 * Keeps one Firebase Realtime Database node in React state.
 *
 * Firebase is the only source of truth: every account, in every browser, reads
 * the same node and sees the same data. Nothing is read from or written to the
 * browser's localStorage, so two browsers can never drift apart.
 */
function normalize<T>(data: unknown, initialValue: T): T {
  if (data === null || data === undefined) return initialValue;
  if (Array.isArray(initialValue)) {
    // RTDB returns arrays as objects with numeric keys when they are sparse.
    const list = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);
    return list.filter(item => item !== null && item !== undefined) as T;
  }
  return data as T;
}

export function useFirebaseSync<T>(path: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Latest value, so consecutive functional updates in one tick compose correctly
  // and the database write never runs inside a React state updater.
  const valueRef = useRef<T>(initialValue);
  const initialRef = useRef<T>(initialValue);

  useEffect(() => {
    setLoaded(false);
    setError(null);
    const unsubscribe = onValue(
      ref(db, path),
      (snapshot) => {
        const next = normalize(snapshot.val(), initialRef.current);
        valueRef.current = next;
        setValue(next);
        setError(null);
        setLoaded(true);
      },
      (err) => {
        console.error(`Firebase read error for ${path}:`, err);
        setError(err.message || 'The database refused the request.');
      },
    );
    return () => unsubscribe();
  }, [path]);

  const setValueAndSync = useCallback((newValue: T | ((prev: T) => T)) => {
    const resolved = newValue instanceof Function ? newValue(valueRef.current) : newValue;
    valueRef.current = resolved;
    setValue(resolved);
    // Firebase RTDB rejects `undefined` — strip it recursively before writing.
    const sanitized = JSON.parse(JSON.stringify(resolved, (_k, v) => v === undefined ? null : v));
    // If the server rejects the write, RTDB reverts its cache and the listener
    // above restores the saved data, so the screen always matches Firebase.
    set(ref(db, path), sanitized).catch((err: Error) => {
      console.error(`Firebase write error for ${path}:`, err);
      toast.error('Could not save to the database', { description: err.message });
    });
  }, [path]);

  return [value, setValueAndSync, loaded, error] as const;
}
