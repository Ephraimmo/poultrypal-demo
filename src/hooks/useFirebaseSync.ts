import { useState, useEffect, useCallback, useRef } from 'react';
import { db, ref, set, onValue } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import firebaseFarmSnapshot from '@/data/firebase-farm-snapshot.json';

function snapshotValue<T>(path: string, fallback: T): T {
  const value = (firebaseFarmSnapshot as Record<string, unknown>)[path];
  return (value === undefined || value === null ? fallback : value) as T;
}

function readLocal<T>(path: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`farm-${path}`);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(path: string, value: T): void {
  try {
    localStorage.setItem(`farm-${path}`, JSON.stringify(value));
  } catch {
    // Storage can be disabled in an embedded preview; in-memory state still works.
  }
}

export function useFirebaseSync<T>(path: string, initialValue: T) {
  const { user } = useAuth();
  // The demo is intentionally local-first. Some live-preview sandboxes allow
  // Firebase Auth's HTTPS call but block RTDB's streaming connection forever.
  const localOnly = user?.email?.toLowerCase() === 'demo@farm.com';
  const firebaseFallback = snapshotValue(path, initialValue);
  const [value, setValue] = useState<T>(() => localOnly ? readLocal(path, firebaseFallback) : initialValue);
  const [loaded, setLoaded] = useState(localOnly);
  const skipNextSync = useRef(false);

  useEffect(() => {
    if (localOnly) {
      setValue(readLocal(path, firebaseFallback));
      setLoaded(true);
      return;
    }

    setLoaded(false);
    const dbRef = ref(db, path);
    // RTDB normally responds immediately, including for an empty node. If its
    // connection is blocked, switch to local data instead of loading forever.
    const fallbackTimer = window.setTimeout(() => {
      setValue(readLocal(path, initialValue));
      setLoaded(true);
    }, 4000);

    const unsubscribe = onValue(dbRef, (snapshot) => {
      window.clearTimeout(fallbackTimer);
      if (skipNextSync.current) {
        skipNextSync.current = false;
        setLoaded(true);
        return;
      }
      const data = snapshot.val();
      if (data !== null) {
        // Firebase stores arrays as objects with numeric keys if sparse.
        if (Array.isArray(initialValue)) {
          const arr = Array.isArray(data) ? data : Object.values(data);
          setValue(arr as T);
        } else {
          setValue(data as T);
        }
      } else {
        setValue(initialValue);
      }
      setLoaded(true);
    }, (error) => {
      window.clearTimeout(fallbackTimer);
      console.error(`Firebase sync error for ${path}:`, error);
      setValue(readLocal(path, initialValue));
      setLoaded(true);
    });

    return () => {
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [path, localOnly]);

  const setValueAndSync = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = newValue instanceof Function ? newValue(prev) : newValue;
      writeLocal(path, resolved);

      if (!localOnly) {
        // Firebase RTDB rejects `undefined` — strip it recursively before writing.
        const sanitized = JSON.parse(JSON.stringify(resolved, (_k, v) => v === undefined ? null : v));
        set(ref(db, path), sanitized).catch(err => {
          console.error(`Firebase write error for ${path}:`, err);
        });
        skipNextSync.current = true;
      }
      return resolved;
    });
  }, [path, localOnly]);

  return [value, setValueAndSync, loaded] as const;
}
