import { db } from "./db";
import { emptyDailyStats } from "@/types/dailyStats";
import type { DailyStats } from "@/types/dailyStats";

/** Get today's local date as "YYYY-MM-DD". */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Get yesterday's local date as "YYYY-MM-DD". */
function yesterdayKey(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

/** Get today's stats without creating a record. Returns a zeroed stub if absent. */
export async function getTodayStats(): Promise<DailyStats> {
  const key = todayKey();
  const row = await db.dailyStats.get(key);
  return row ?? emptyDailyStats(key);
}

/** Record a single review answer into today's stats (upsert). */
export async function recordAnswer(
  correct: boolean,
  elapsedSec: number,
): Promise<void> {
  const key = todayKey();
  await db.transaction("rw", db.dailyStats, async () => {
    const row = await db.dailyStats.get(key);
    const base = row ?? emptyDailyStats(key);
    const best =
      base.best_time === null || elapsedSec < base.best_time
        ? elapsedSec
        : base.best_time;
    await db.dailyStats.put({
      ...base,
      reviewed: base.reviewed + 1,
      known: base.known + (correct ? 1 : 0),
      forgotten: base.forgotten + (correct ? 0 : 1),
      total_time: base.total_time + elapsedSec,
      best_time: best,
    });
  });
}

/** Increment the new-words counter for today (upsert). */
export async function incrementNewWords(): Promise<void> {
  const key = todayKey();
  await db.transaction("rw", db.dailyStats, async () => {
    const row = await db.dailyStats.get(key);
    const base = row ?? emptyDailyStats(key);
    await db.dailyStats.put({ ...base, new_words: base.new_words + 1 });
  });
}

/** Get the last `days` days with recorded activity, newest first. */
export async function getRecentDays(days: number): Promise<DailyStats[]> {
  const rows = await db.dailyStats.toArray();
  return rows
    .filter((r) => r.reviewed > 0 || r.new_words > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, days);
}

/** Count consecutive active days ending today (or yesterday if today is empty). */
export async function getStreak(): Promise<number> {
  const rows = await db.dailyStats.toArray();
  const active = new Set(
    rows.filter((r) => r.reviewed > 0 || r.new_words > 0).map((r) => r.date),
  );

  const now = new Date();
  const cursor = active.has(todayKey(now)) ? new Date(now) : new Date(yesterdayKey(now));

  // If neither today nor yesterday is active, streak is 0
  if (!active.has(todayKey(cursor))) {
    return 0;
  }

  let streak = 0;
  while (active.has(todayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
