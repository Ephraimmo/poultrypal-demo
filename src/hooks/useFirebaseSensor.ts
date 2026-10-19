import { useEffect, useState } from 'react';
import { db, ref, onValue } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import environmentSnapshot from '@/data/firebase-environment-snapshot.json';

export interface SensorReading {
  temperature: number | null;
  humidity: number | null;
  updatedAt: number | null;
}

/** Firebase RTDB keys cannot contain . # $ [ ] /. Replace them with `_`. */
export function sanitizeSensorSegment(v: string): string {
  return v.trim().replace(/[.#$\[\]/]/g, '_');
}

export function defaultSensorPathFor(name: string): string {
  return `${sanitizeSensorSegment(name)}/sensors/current`;
}

/**
 * Subscribe to a Firebase RTDB node returning `{ temperature, humidity }`.
 * Emits live updates whenever the sensor node changes.
 */
export function useFirebaseSensor(path: string | null | undefined): SensorReading {
  const { user } = useAuth();
  const isDemo = user?.email?.toLowerCase() === 'demo@farm.com';
  const snapshotReading = path
    ? (environmentSnapshot.sensors as Record<string, { temperature?: number; humidity?: number }>)[path]
    : undefined;
  const [reading, setReading] = useState<SensorReading>(() => snapshotReading
    ? {
        temperature: Number(snapshotReading.temperature),
        humidity: Number(snapshotReading.humidity),
        updatedAt: Date.now(),
      }
    : { temperature: null, humidity: null, updatedAt: null });

  useEffect(() => {
    if (!path) {
      setReading({ temperature: null, humidity: null, updatedAt: null });
      return;
    }

    // The downloadable demo uses the freshly captured Firebase snapshot so an
    // embedded viewer cannot leave sensor cards empty when RTDB streams are blocked.
    if (isDemo) {
      const saved = (environmentSnapshot.sensors as Record<string, { temperature?: number; humidity?: number }>)[path];
      setReading(saved
        ? {
            temperature: Number.isFinite(Number(saved.temperature)) ? Number(saved.temperature) : null,
            humidity: Number.isFinite(Number(saved.humidity)) ? Number(saved.humidity) : null,
            updatedAt: Date.now(),
          }
        : { temperature: null, humidity: null, updatedAt: null });
      return;
    }

    const r = ref(db, path);
    const unsub = onValue(r, snap => {
      const data = snap.val();
      if (!data || typeof data !== 'object') {
        setReading({ temperature: null, humidity: null, updatedAt: Date.now() });
        return;
      }
      const t = Number(data.temperature);
      const h = Number(data.humidity);
      setReading({
        temperature: Number.isFinite(t) ? t : null,
        humidity: Number.isFinite(h) ? h : null,
        updatedAt: Date.now(),
      });
    }, () => {
      setReading({ temperature: null, humidity: null, updatedAt: Date.now() });
    });
    return () => unsub();
  }, [path, isDemo]);

  return reading;
}
