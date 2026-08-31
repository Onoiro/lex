import { describe, it, expect } from "vitest";
import { computeDayAccuracy, computeDayAvgTime } from "./dailyStats";
import { emptyDailyStats } from "@/types/dailyStats";

describe("computeDayAccuracy", () => {
  it("returns null for zero answers", () => {
    expect(computeDayAccuracy(emptyDailyStats("2026-08-30"))).toBeNull();
  });

  it("computes percent of known answers", () => {
    const stats = { ...emptyDailyStats("2026-08-30"), reviewed: 4, known: 3 };
    expect(computeDayAccuracy(stats)).toBe(75);
  });

  it("returns 0 when all forgotten", () => {
    const stats = { ...emptyDailyStats("2026-08-30"), reviewed: 2, forgotten: 2 };
    expect(computeDayAccuracy(stats)).toBe(0);
  });

  it("returns 100 when all known", () => {
    const stats = { ...emptyDailyStats("2026-08-30"), reviewed: 5, known: 5 };
    expect(computeDayAccuracy(stats)).toBe(100);
  });
});

describe("computeDayAvgTime", () => {
  it("returns null for zero answers", () => {
    expect(computeDayAvgTime(emptyDailyStats("2026-08-30"))).toBeNull();
  });

  it("divides total_time by reviewed", () => {
    const stats = { ...emptyDailyStats("2026-08-30"), reviewed: 4, total_time: 10 };
    expect(computeDayAvgTime(stats)).toBe(2.5);
  });
});
