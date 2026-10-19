import type { Batch, Environment, EnvironmentAlert } from '@/types/farm';
import { ageInDays, targetForAge, type BroodingTarget } from '@/lib/brooding';

export type ParamStatus = 'ok' | 'low' | 'high' | 'unknown';

export function tempStatus(t: number | null, target: BroodingTarget): ParamStatus {
  if (t == null || !Number.isFinite(t)) return 'unknown';
  if (t < target.tempMin) return 'low';
  if (t > target.tempMax) return 'high';
  return 'ok';
}

export function humidityStatus(h: number | null, target: BroodingTarget): ParamStatus {
  if (h == null || !Number.isFinite(h)) return 'unknown';
  if (h < target.humidityMin) return 'low';
  if (h > target.humidityMax) return 'high';
  return 'ok';
}

export interface BatchStatus {
  batch: Batch;
  age: number;
  target: BroodingTarget;
  temp: ParamStatus;
  humidity: ParamStatus;
}

/** Combine per-batch evaluations into an overall environment status. */
export function environmentOverallStatus(perBatch: BatchStatus[]): 'ok' | 'warning' | 'critical' | 'unknown' {
  if (!perBatch.length) return 'unknown';
  const hasUnknown = perBatch.some(s => s.temp === 'unknown' || s.humidity === 'unknown');
  const oorCount = perBatch.reduce((n, s) => n + (s.temp !== 'ok' && s.temp !== 'unknown' ? 1 : 0) + (s.humidity !== 'ok' && s.humidity !== 'unknown' ? 1 : 0), 0);
  if (oorCount >= 2) return 'critical';
  if (oorCount === 1) return 'warning';
  return hasUnknown ? 'unknown' : 'ok';
}

export function evaluateEnvironment(
  env: Environment,
  batches: Batch[],
  temperature: number | null,
  humidity: number | null,
  today: Date = new Date(),
): BatchStatus[] {
  const linked = env.batchIds
    .map(id => batches.find(b => b.id === id))
    .filter((b): b is Batch => !!b);
  return linked.map(b => {
    const age = ageInDays(b.startDate, today);
    const target = targetForAge(age);
    return {
      batch: b,
      age,
      target,
      temp: tempStatus(temperature, target),
      humidity: humidityStatus(humidity, target),
    };
  });
}

/** True if any batch is out of range for temperature or humidity. */
export function isOutOfRange(perBatch: BatchStatus[]): boolean {
  return perBatch.some(s => (s.temp !== 'ok' && s.temp !== 'unknown') || (s.humidity !== 'ok' && s.humidity !== 'unknown'));
}

export function severityFor(perBatch: BatchStatus[]): 'warning' | 'critical' {
  const overall = environmentOverallStatus(perBatch);
  return overall === 'critical' ? 'critical' : 'warning';
}

export function buildAlert(
  env: Environment,
  perBatch: BatchStatus[],
  temperature: number | null,
  humidity: number | null,
): EnvironmentAlert {
  // Use the youngest batch's target range as the representative range (tightest).
  const primary = perBatch.reduce((min, s) => (min && min.age < s.age ? min : s), perBatch[0]);
  return {
    id: crypto.randomUUID(),
    environmentId: env.id,
    environmentName: env.name,
    batchIds: perBatch.map(s => s.batch.id),
    batchNames: perBatch.map(s => s.batch.name),
    temperature,
    humidity,
    tempRange: [primary.target.tempMin, primary.target.tempMax],
    humidityRange: [primary.target.humidityMin, primary.target.humidityMax],
    tempStatus: primary.temp,
    humidityStatus: primary.humidity,
    severity: severityFor(perBatch),
    triggeredAt: new Date().toISOString(),
    active: true,
  };
}
