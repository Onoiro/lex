import { describe, expect, it, vi } from "vitest";
import { applyReviewResult, pickWeightedWord, pickRandomDirection, normalizeAvgTime, computeWeight, computeRank } from "./srs";
import type { Word } from "@/types";

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 1,
    word: "test",
    translation: "тест",
    word_lang: "en",
    interval: 0,
    repetitions: 0,
    next_review: 0,
    last_direction: "en_ru",
    best_time: null,
    avg_time: null,
    know_count: 0,
    forgot_count: 0,
    ...overrides,
  };
}

describe("applyReviewResult", () => {
  it("sets interval to 1 on first correct answer", () => {
    const word = makeWord({ repetitions: 0 });
    const result = applyReviewResult(word, true, "en_ru");

    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.know_count).toBe(1);
  });

  it("sets interval to 6 on second correct answer", () => {
    const word = makeWord({ repetitions: 1, interval: 1 });
    const result = applyReviewResult(word, true, "ru_en");

    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it("multiplies interval by 2.5 on subsequent correct answers", () => {
    const word = makeWord({ repetitions: 2, interval: 6 });
    const result = applyReviewResult(word, true, "en_ru");

    expect(result.interval).toBe(15);
    expect(result.repetitions).toBe(3);
  });

  it("caps interval at 30 days", () => {
    const word = makeWord({ repetitions: 3, interval: 30 });
    const result = applyReviewResult(word, true, "en_ru");

    expect(result.interval).toBe(30);
  });

  it("resets interval and repetitions on incorrect answer", () => {
    const word = makeWord({ repetitions: 5, interval: 15, know_count: 3 });
    const result = applyReviewResult(word, false, "ru_en");

    expect(result.interval).toBe(0);
    expect(result.repetitions).toBe(0);
    expect(result.forgot_count).toBe(1);
    expect(result.know_count).toBeUndefined();
  });

  it("sets next_review to now + interval days", () => {
    const now = 1000000;
    vi.spyOn(Date, "now").mockReturnValue(now * 1000);

    const word = makeWord({ repetitions: 0 });
    const result = applyReviewResult(word, true, "en_ru");

    expect(result.next_review).toBe(now + 1 * 86400);

    vi.restoreAllMocks();
  });

  it("updates last_direction", () => {
    const word = makeWord({ last_direction: "en_ru" });
    const result = applyReviewResult(word, true, "ru_en");

    expect(result.last_direction).toBe("ru_en");
  });

  it("does not mutate the original word", () => {
    const word = makeWord({ repetitions: 2, interval: 6 });
    applyReviewResult(word, true, "en_ru");

    expect(word.repetitions).toBe(2);
    expect(word.interval).toBe(6);
  });
});

describe("pickWeightedWord", () => {
  it("returns null for empty array", () => {
    expect(pickWeightedWord([])).toBeNull();
  });

  it("returns the only word", () => {
    const word = makeWord();
    expect(pickWeightedWord([word])).toBe(word);
  });

  it("returns a word from the array", () => {
    const words = [
      makeWord({ id: 1, word: "a", interval: 0 }),
      makeWord({ id: 2, word: "b", interval: 6 }),
      makeWord({ id: 3, word: "c", interval: 30 }),
    ];

    const picked = pickWeightedWord(words);
    expect(picked).not.toBeNull();
    expect(words).toContain(picked);
  });

  it("favors words with lower intervals", () => {
    const lowInterval = makeWord({ id: 1, word: "low", interval: 0 });
    const highInterval = makeWord({ id: 2, word: "high", interval: 30 });

    // Weight ratio: low = 1/1 = 1.0, high = 1/31 ≈ 0.032
    // Low should be picked ~97% of the time
    let lowPicks = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const picked = pickWeightedWord([lowInterval, highInterval]);
      if (picked?.id === 1) lowPicks++;
    }

    expect(lowPicks).toBeGreaterThan(trials * 0.9);
  });

  it("favors words with slower response times at same interval", () => {
    const fast = makeWord({ id: 1, word: "fast", interval: 6, avg_time: 0.5 });
    const slow = makeWord({ id: 2, word: "slow", interval: 6, avg_time: 9 });

    // Both have interval 6, but slow has higher avg_time
    // fast weight: 1/7 × (1 + 1.0 × 0.05) ≈ 0.150
    // slow weight: 1/7 × (1 + 1.0 × 0.9)  ≈ 0.271
    // slow should be picked ~64% of the time
    let slowPicks = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const picked = pickWeightedWord([fast, slow]);
      if (picked?.id === 2) slowPicks++;
    }

    expect(slowPicks).toBeGreaterThan(trials * 0.55);
  });

  it("treats unreviewed words (null avg_time) as highest priority", () => {
    const reviewed = makeWord({ id: 1, word: "reviewed", interval: 0, avg_time: 0.5 });
    const unreviewed = makeWord({ id: 2, word: "new", interval: 0, avg_time: null });

    // Both interval 0, but unreviewed gets normAvgTime = 1.0
    // reviewed weight: 1/1 × (1 + 1.0 × 0.05) = 1.05
    // unreviewed weight: 1/1 × (1 + 1.0 × 1.0) = 2.0
    // unreviewed should be picked ~66% of the time
    let newPicks = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const picked = pickWeightedWord([reviewed, unreviewed]);
      if (picked?.id === 2) newPicks++;
    }

    expect(newPicks).toBeGreaterThan(trials * 0.6);
  });
});

describe("normalizeAvgTime", () => {
  it("returns 1.0 for null (unreviewed)", () => {
    expect(normalizeAvgTime(null)).toBe(1.0);
  });

  it("returns 0.0 for zero time", () => {
    expect(normalizeAvgTime(0)).toBe(0.0);
  });

  it("returns 0.5 for 5 seconds (half of ceiling)", () => {
    expect(normalizeAvgTime(5)).toBe(0.5);
  });

  it("returns 1.0 for 10 seconds (ceiling)", () => {
    expect(normalizeAvgTime(10)).toBe(1.0);
  });

  it("clamps values above 10 to 1.0", () => {
    expect(normalizeAvgTime(15)).toBe(1.0);
    expect(normalizeAvgTime(100)).toBe(1.0);
  });
});

describe("computeWeight", () => {
  it("returns max weight (2.0) for new word with null avg_time", () => {
    const word = makeWord({ interval: 0, avg_time: null });
    expect(computeWeight(word)).toBeCloseTo(2.0, 5);
  });

  it("returns lower weight for well-known word (high interval, fast response)", () => {
    const word = makeWord({ interval: 30, avg_time: 0.5 });
    // 1/31 × (1 + 1.0 × 0.05) ≈ 0.0339
    expect(computeWeight(word)).toBeCloseTo(0.0339, 3);
  });

  it("returns higher weight for forgotten word (low interval, slow response)", () => {
    const word = makeWord({ interval: 0, avg_time: 9 });
    // 1/1 × (1 + 1.0 × 0.9) = 1.9
    expect(computeWeight(word)).toBeCloseTo(1.9, 5);
  });
});

describe("computeRank", () => {
  it("returns 100 for new word (max weight)", () => {
    const word = makeWord({ interval: 0, avg_time: null });
    expect(computeRank(word)).toBe(100);
  });

  it("returns 1 for well-known word (min weight)", () => {
    const word = makeWord({ interval: 30, avg_time: 0.5 });
    expect(computeRank(word)).toBeGreaterThanOrEqual(1);
    expect(computeRank(word)).toBeLessThanOrEqual(5);
  });

  it("returns mid-range rank for moderately known word", () => {
    const word = makeWord({ interval: 6, avg_time: 5 });
    // weight = 1/7 × (1 + 1.0 × 0.5) = 0.2143
    // rank = round(0.2143 / 2.0 × 100) = round(10.7) = 11
    expect(computeRank(word)).toBe(11);
  });

  it("always returns value in [1, 100]", () => {
    const words = [
      makeWord({ interval: 0, avg_time: null }),
      makeWord({ interval: 30, avg_time: 0.1 }),
      makeWord({ interval: 6, avg_time: 5 }),
      makeWord({ interval: 1, avg_time: 10 }),
      makeWord({ interval: 15, avg_time: 3 }),
    ];
    for (const w of words) {
      const rank = computeRank(w);
      expect(rank).toBeGreaterThanOrEqual(1);
      expect(rank).toBeLessThanOrEqual(100);
    }
  });
});

describe("pickRandomDirection", () => {
  it("returns a valid direction", () => {
    const dir = pickRandomDirection();
    expect(["en_ru", "ru_en"]).toContain(dir);
  });

  it("returns both directions over many calls", () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(pickRandomDirection());
    }
    expect(results.size).toBe(2);
  });
});
