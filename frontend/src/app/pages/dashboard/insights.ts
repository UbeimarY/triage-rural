import { Priority } from '../../core/db/models';

export interface DailyCount {
  day: string;
  high: number;
  medium: number;
  low: number;
  unclassified: number;
}

export interface Insights {
  days: number;
  daily: DailyCount[];
  agreement: {
    reviewed: number;
    kept: number;
    raised: number;
    lowered: number;
    cells: { suggested: Priority; final: Priority; visits: number }[];
  };
  syncDelay: { visits: number; medianMinutes: number | null; p90Minutes: number | null };
  byPromoter: { promoterName: string; visits: number; high: number }[];
}

export const SERIES = ['high', 'medium', 'low', 'unclassified'] as const;
export type Series = (typeof SERIES)[number];

export const SERIES_LABEL: Record<Series, string> = {
  high: 'Alta',
  medium: 'Intermedia',
  low: 'Baja',
  unclassified: 'Sin clasificar',
};

export interface Segment {
  series: Series;
  y: number;
  height: number;
}

export interface Column {
  day: string;
  total: number;
  x: number;
  segments: Segment[];
}

/**
 * Stacked columns, most urgent at the base so "alta" always starts at zero and
 * can be compared day to day. A 2-unit gap in the surface colour separates segments.
 */
export function stackColumns(
  daily: readonly DailyCount[],
  width: number,
  height: number,
  gap = 2,
): { columns: Column[]; barWidth: number; max: number } {
  const max = Math.max(1, ...daily.map(total));
  const slot = width / Math.max(1, daily.length);
  const barWidth = Math.min(24, slot * 0.6);
  const columns = daily.map((day, i) => {
    let y = height;
    const segments: Segment[] = [];
    for (const series of SERIES) {
      if (day[series] === 0) continue;
      const h = (day[series] / max) * height;
      const drawn = Math.max(1, h - (segments.length ? gap : 0));
      y -= h;
      segments.push({ series, y, height: drawn });
    }
    return { day: day.day, total: total(day), x: i * slot + (slot - barWidth) / 2, segments };
  });
  return { columns, barWidth, max };
}

export function total(day: DailyCount): number {
  return day.high + day.medium + day.low + day.unclassified;
}

/** "La mitad llega en 12 min": minutes as a promoter would say them. */
export function readableMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 36 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} días`;
}
