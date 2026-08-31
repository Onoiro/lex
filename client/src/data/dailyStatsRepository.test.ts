import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "./db";
import {
  todayKey,
  getTodayStats,
  recordAnswer,
  incrementNewWords,
  getRecentDays,
  getStreak,
} from "./dailyStatsRepository";
import { emptyDailyStats } from "@/types/dailyStats";

/** Build a Date from a local "YYYY-MM-DD" key at noon. */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

beforeEach(async () => {
  await db.dailyStats.clear();
});

describe("todayKey", () => {
  it("formats local date as YYYY-MM-DD", () => {
    expect(todayKey(new Date(2026, 7, 30, 23, 59))).toBe("2026-08-30");
    expect(todayKey(new Date(2026, 0, 5, 1, 0))).toBe("2026-01-05");
  });
});

describe("getTodayStats", () => {
  it("returns zeroed stub when no record exists", async () => {
    const stats = await getTodayStats();
    expect(stats).toEqual(emptyDailyStats(todayKey()));
    // Must not create a record
    expect(await db.dailyStats.count()).toBe(0);
  });

  it("returns stored record for today", async () => {
    const key = todayKey();
    await db.dailyStats.put({ ...emptyDailyStats(key), reviewed: 3, known: 2 });
    const stats = await getTodayStats();
    expect(stats.reviewed).toBe(3);
    expect(stats.known).toBe(2);
  });
});

describe("recordAnswer", () => {
  it("creates today's record on first answer", async () => {
    await recordAnswer(true, 2.5);
    const stats = await getTodayStats();
    expect(stats.reviewed).toBe(1);
    expect(stats.known).toBe(1);
    expect(stats.forgotten).toBe(0);
    expect(stats.total_time).toBeCloseTo(2.5);
    expect(stats.best_time).toBeCloseTo(2.5);
  });

  it("increments counters and tracks best_time", async () => {
    await recordAnswer(true, 3.0);
    await recordAnswer(false, 5.0);
    await recordAnswer(true, 1.2);
    const stats = await getTodayStats();
    expect(stats.reviewed).toBe(3);
    expect(stats.known).toBe(2);
    expect(stats.forgotten).toBe(1);
    expect(stats.total_time).toBeCloseTo(9.2);
    expect(stats.best_time).toBeCloseTo(1.2);
  });

  it("writes into the record for the current day only", async () => {
    const yesterday = todayKey(dateFromKey(todayKey()));
    void yesterday; // sanity: helper works
    await db.dailyStats.put({ ...emptyDailyStats("2000-01-01"), reviewed: 7 });
    await recordAnswer(true, 1.0);
    const old = await db.dailyStats.get("2000-01-01");
    expect(old?.reviewed).toBe(7);
    expect((await getTodayStats()).reviewed).toBe(1);
  });
});

describe("incrementNewWords", () => {
  it("creates record and increments", async () => {
    await incrementNewWords();
    await incrementNewWords();
    const stats = await getTodayStats();
    expect(stats.new_words).toBe(2);
    expect(stats.reviewed).toBe(0);
  });
});

describe("getRecentDays", () => {
  it("returns only active days, newest first, limited", async () => {
    await db.dailyStats.bulkPut([
      emptyDailyStats("2026-08-01"), // inactive (all zeros)
      { ...emptyDailyStats("2026-08-02"), reviewed: 5 },
      { ...emptyDailyStats("2026-08-03"), new_words: 2 },
      { ...emptyDailyStats("2026-08-04"), reviewed: 1 },
    ]);
    const days = await getRecentDays(2);
    expect(days.map((d) => d.date)).toEqual(["2026-08-04", "2026-08-03"]);
  });
});

describe("getStreak", () => {
  it("returns 0 when no activity", async () => {
    expect(await getStreak()).toBe(0);
  });

  it("counts consecutive days ending today", async () => {
    const today = todayKey();
    const yesterday = todayKey(dateFromKey(today));
    void yesterday;
    // Build yesterday/today keys via Date math
    const now = new Date();
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yKey = todayKey(y);

    await db.dailyStats.bulkPut([
      { ...emptyDailyStats(yKey), reviewed: 3 },
      { ...emptyDailyStats(today), reviewed: 1 },
    ]);
    expect(await getStreak()).toBe(2);
  });

  it("counts streak from yesterday when today is empty", async () => {
    const now = new Date();
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yKey = todayKey(y);

    await db.dailyStats.put({ ...emptyDailyStats(yKey), reviewed: 3 });
    expect(await getStreak()).toBe(1);
  });

  it("breaks streak on a gap day", async () => {
    const now = new Date();
    const d2 = new Date(now);
    d2.setDate(d2.getDate() - 2);
    const d3 = new Date(now);
    d3.setDate(d3.getDate() - 3);

    await db.dailyStats.bulkPut([
      { ...emptyDailyStats(todayKey(d2)), reviewed: 3 },
      { ...emptyDailyStats(todayKey(d3)), reviewed: 3 },
    ]);
    // Today and yesterday are empty -> streak 0
    expect(await getStreak()).toBe(0);
  });
});

describe("midnight rollover", () => {
  it("recordAnswer after date change writes to the new day", async () => {
    // Fake only Date so fake-indexeddb timers keep working
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 7, 30, 23, 59, 50));
      await recordAnswer(true, 1.0);
      expect((await getTodayStats()).reviewed).toBe(1);

      vi.setSystemTime(new Date(2026, 7, 31, 0, 0, 10));
      await recordAnswer(false, 2.0);
      const newDay = await db.dailyStats.get("2026-08-31");
      expect(newDay?.reviewed).toBe(1);
      expect(newDay?.forgotten).toBe(1);
      const oldDay = await db.dailyStats.get("2026-08-30");
      expect(oldDay?.reviewed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
