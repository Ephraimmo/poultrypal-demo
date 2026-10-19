/**
 * Age-based brooding recommendations derived from a batch's placement date.
 */

export interface BroodingTarget {
  week: number;
  label: string;
  tempMin: number;
  tempMax: number;
  humidityMin: number;
  humidityMax: number;
  note?: string;
}

const TARGETS: BroodingTarget[] = [
  { week: 1, label: 'Week 1 (Day 1–7)', tempMin: 32, tempMax: 35, humidityMin: 60, humidityMax: 70 },
  { week: 2, label: 'Week 2 (Day 8–14)', tempMin: 29, tempMax: 32, humidityMin: 55, humidityMax: 65 },
  { week: 3, label: 'Week 3 (Day 15–21)', tempMin: 26, tempMax: 29, humidityMin: 50, humidityMax: 60 },
  { week: 4, label: 'Week 4 (Day 22–28)', tempMin: 24, tempMax: 26, humidityMin: 50, humidityMax: 60 },
  {
    week: 5,
    label: 'Week 5+ (Day 29+)',
    tempMin: 21,
    tempMax: 24,
    humidityMin: 50,
    humidityMax: 70,
    note: 'Ambient temperature is acceptable once birds are fully feathered and conditions are suitable.',
  },
];

/** Age in days where the placement date itself is Day 1. */
export function ageInDays(placementDate: string, onDate: Date | string = new Date()): number {
  const start = new Date(placementDate);
  const end = typeof onDate === 'string' ? new Date(onDate) : onDate;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endDay - startDay) / 86400000) + 1;
}

export function weekFromAge(days: number): number {
  if (days <= 7) return 1;
  if (days <= 14) return 2;
  if (days <= 21) return 3;
  if (days <= 28) return 4;
  return 5;
}

export function targetForAge(days: number): BroodingTarget {
  return TARGETS[weekFromAge(days) - 1];
}

export function broodingWarnings(
  target: BroodingTarget,
  temperature?: number | null,
  humidity?: number | null,
): string[] {
  const out: string[] = [];
  const weekLabel = target.week >= 5 ? 'Week 5+' : `Week ${target.week}`;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    if (temperature < target.tempMin) out.push(`Temperature ${temperature}°C is below the recommended range for ${weekLabel} (${target.tempMin}–${target.tempMax}°C).`);
    else if (temperature > target.tempMax) out.push(`Temperature ${temperature}°C is above the recommended range for ${weekLabel} (${target.tempMin}–${target.tempMax}°C).`);
  }
  if (typeof humidity === 'number' && Number.isFinite(humidity)) {
    if (humidity < target.humidityMin) out.push(`Humidity ${humidity}% is below the recommended range for ${weekLabel} (${target.humidityMin}–${target.humidityMax}%).`);
    else if (humidity > target.humidityMax) out.push(`Humidity ${humidity}% is above the recommended range for ${weekLabel} (${target.humidityMin}–${target.humidityMax}%).`);
  }
  return out;
}

export const BROODING_TARGETS = TARGETS;
