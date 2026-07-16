import { describe, expect, it, vi } from "vitest";
import { applyReviewResult, pickWeightedWord, pickRandomDirection } from "./srs";
import type { Word } from "@/types";

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 1,
    word: "test",
    translation: "тест",
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
