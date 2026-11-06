import { useEffect, useState } from 'react';
import { db, ref, onValue } from '@/lib/firebase';

export interface SensorReading {
  temperature: number | null;
  humidity: number | null;
  updatedAt: number | null;
}

const EMPTY_READING: SensorReading = { temperature: null, humidity: null, updatedAt: null };

/** Firebase RTDB keys cannot contain . # $ [ ] /. Replace them with `_`. */
export function sanitizeSensorSegment(v: string): string {
  return v.trim().replace(/[.#$[\]/]/g, '_');
}

export function defaultSensorPathFor(name: string): string {
  return `${sanitizeSensorSegment(name)}/sensors/current`;
}

/**
 * Subscribe to a Firebase RTDB node returning `{ temperature, humidity }`.
 * Emits live updates whenever the sensor node changes. Readings always come
 * from Firebase, never from data bundled with the app.
 */
export function useFirebaseSensor(path: string | null | undefined): SensorReading {
  const [reading, setReading] = useState<SensorReading>(EMPTY_READING);

  useEffect(() => {
    setReading(EMPTY_READING);
    if (!path) return;

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
  }, [path]);

  return reading;
}
