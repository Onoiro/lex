import { describe, expect, it } from "vitest";
import { updateResponseTime, formatTime } from "./stats";
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

describe("updateResponseTime", () => {
  it("sets best_time and avg_time on first review", () => {
    const word = makeWord();
    const result = updateResponseTime(word, 2.5);

    expect(result.best_time).toBe(2.5);
    expect(result.avg_time).toBe(2.5);
  });

  it("updates best_time when elapsed is lower", () => {
    const word = makeWord({ best_time: 3.0, avg_time: 3.0 });
    const result = updateResponseTime(word, 1.5);

    expect(result.best_time).toBe(1.5);
  });

  it("does not update best_time when elapsed is higher", () => {
    const word = makeWord({ best_time: 1.0, avg_time: 1.0 });
    const result = updateResponseTime(word, 2.0);

    expect(result.best_time).toBeUndefined();
  });

  it("calculates running average for avg_time", () => {
    const word = makeWord({ best_time: 2.0, avg_time: 2.0 });
    const result = updateResponseTime(word, 4.0);

    expect(result.avg_time).toBe(3.0);
  });

  it("ignores elapsed <= 0", () => {
    const word = makeWord({ best_time: 1.0, avg_time: 1.0 });
    const result = updateResponseTime(word, 0);

    expect(result).toEqual({});
  });

  it("ignores negative elapsed", () => {
    const word = makeWord();
    const result = updateResponseTime(word, -1);

    expect(result).toEqual({});
  });

  it("does not mutate the original word", () => {
    const word = makeWord({ best_time: 2.0, avg_time: 2.0 });
    updateResponseTime(word, 1.0);

    expect(word.best_time).toBe(2.0);
    expect(word.avg_time).toBe(2.0);
  });
});

describe("formatTime", () => {
  it("formats seconds with 2 decimal places", () => {
    expect(formatTime(1.5)).toBe("1.50s");
  });

  it("formats zero", () => {
    expect(formatTime(0)).toBe("0.00s");
  });

  it("formats large numbers", () => {
    expect(formatTime(123.456)).toBe("123.46s");
  });
});
