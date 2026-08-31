import type { DailyStats } from "@/types/dailyStats";

/** Accuracy in percent (0–100), or null if no answers. */
export function computeDayAccuracy(stats: DailyStats): number | null {
  if (stats.reviewed === 0) return null;
  return Math.round((stats.known / stats.reviewed) * 100);
}

/** Average answer time in seconds, or null if no answers. */
export function computeDayAvgTime(stats: DailyStats): number | null {
  if (stats.reviewed === 0) return null;
  return stats.total_time / stats.reviewed;
}
