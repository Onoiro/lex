import { describe, it, expect } from "vitest";
import type { Word } from "@/types";
import { sortWords, loadSortState, saveSortState, nextSortDir, DEFAULT_SORT } from "./dictionarySort";

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

describe("sortWords", () => {
  it("returns original array when sortBy is none", () => {
    const words = [makeWord({ id: 1, word: "b" }), makeWord({ id: 2, word: "a" })];
    const result = sortWords(words, "none", "asc");
    expect(result).toBe(words);
  });

  it("sorts by word alphabetically (asc)", () => {
    const words = [makeWord({ id: 1, word: "banana" }), makeWord({ id: 2, word: "apple" })];
    const result = sortWords(words, "word", "asc");
    expect(result[0].word).toBe("apple");
    expect(result[1].word).toBe("banana");
  });

  it("sorts by word alphabetically (desc)", () => {
    const words = [makeWord({ id: 1, word: "apple" }), makeWord({ id: 2, word: "banana" })];
    const result = sortWords(words, "word", "desc");
    expect(result[0].word).toBe("banana");
    expect(result[1].word).toBe("apple");
  });

  it("sorts by known_no (sum of know_count + forgot_count)", () => {
    const words = [
      makeWord({ id: 1, word: "a", know_count: 1, forgot_count: 0 }),
      makeWord({ id: 2, word: "b", know_count: 3, forgot_count: 2 }),
      makeWord({ id: 3, word: "c", know_count: 0, forgot_count: 0 }),
    ];
    const result = sortWords(words, "known_no", "desc");
    expect(result[0].word).toBe("b");
    expect(result[1].word).toBe("a");
    expect(result[2].word).toBe("c");
  });

  it("sorts by best_time (asc), nulls last", () => {
    const words = [
      makeWord({ id: 1, word: "a", best_time: null }),
      makeWord({ id: 2, word: "b", best_time: 3.5 }),
      makeWord({ id: 3, word: "c", best_time: 1.2 }),
    ];
    const result = sortWords(words, "best_time", "asc");
    expect(result[0].word).toBe("c");
    expect(result[1].word).toBe("b");
    expect(result[2].word).toBe("a");
  });

  it("sorts by best_time (desc), nulls still last", () => {
    const words = [
      makeWord({ id: 1, word: "a", best_time: null }),
      makeWord({ id: 2, word: "b", best_time: 3.5 }),
      makeWord({ id: 3, word: "c", best_time: 1.2 }),
    ];
    const result = sortWords(words, "best_time", "desc");
    expect(result[0].word).toBe("b");
    expect(result[1].word).toBe("c");
    expect(result[2].word).toBe("a");
  });

  it("sorts by avg_time, nulls last", () => {
    const words = [
      makeWord({ id: 1, word: "a", avg_time: null }),
      makeWord({ id: 2, word: "b", avg_time: 2.0 }),
      makeWord({ id: 3, word: "c", avg_time: 5.0 }),
    ];
    const result = sortWords(words, "avg_time", "asc");
    expect(result[0].word).toBe("b");
    expect(result[1].word).toBe("c");
    expect(result[2].word).toBe("a");
  });

  it("sorts by rank (desc)", () => {
    const words = [
      makeWord({ id: 1, word: "a", interval: 10, avg_time: 5.0 }),
      makeWord({ id: 2, word: "b", interval: 0, avg_time: null }),
    ];
    const result = sortWords(words, "rank", "desc");
    // Word b has interval=0, avg_time=null (normAvgTime=1.0) → higher weight → higher rank
    expect(result[0].word).toBe("b");
    expect(result[1].word).toBe("a");
  });

  it("sorts by pct (desc), nulls last", () => {
    const words = [
      makeWord({ id: 1, word: "a", know_count: 0, forgot_count: 0 }),
      makeWord({ id: 2, word: "b", know_count: 3, forgot_count: 1 }),
      makeWord({ id: 3, word: "c", know_count: 1, forgot_count: 3 }),
    ];
    const result = sortWords(words, "pct", "desc");
    expect(result[0].word).toBe("b");
    expect(result[1].word).toBe("c");
    expect(result[2].word).toBe("a");
  });

  it("uses stable secondary sort by id when values are equal", () => {
    const words = [
      makeWord({ id: 3, word: "c", best_time: 1.0 }),
      makeWord({ id: 1, word: "a", best_time: 1.0 }),
      makeWord({ id: 2, word: "b", best_time: 1.0 }),
    ];
    const result = sortWords(words, "best_time", "asc");
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
    expect(result[2].id).toBe(3);
  });

  it("does not mutate original array", () => {
    const words = [makeWord({ id: 1, word: "b" }), makeWord({ id: 2, word: "a" })];
    const original = [...words];
    sortWords(words, "word", "asc");
    expect(words).toEqual(original);
  });
});

describe("nextSortDir", () => {
  it("returns asc for word when switching to it", () => {
    expect(nextSortDir("word", DEFAULT_SORT)).toBe("asc");
  });

  it("returns desc for rank when switching to it", () => {
    expect(nextSortDir("rank", DEFAULT_SORT)).toBe("desc");
  });

  it("toggles direction when clicking same column", () => {
    expect(nextSortDir("word", { sortBy: "word", sortDir: "asc" })).toBe("desc");
    expect(nextSortDir("word", { sortBy: "word", sortDir: "desc" })).toBe("asc");
  });
});

describe("localStorage persistence", () => {
  it("returns default when nothing stored", () => {
    localStorage.removeItem("lex-dict-sort");
    expect(loadSortState()).toEqual(DEFAULT_SORT);
  });

  it("saves and loads sort state", () => {
    saveSortState({ sortBy: "rank", sortDir: "desc" });
    expect(loadSortState()).toEqual({ sortBy: "rank", sortDir: "desc" });
  });

  it("returns default for invalid data", () => {
    localStorage.setItem("lex-dict-sort", "garbage");
    expect(loadSortState()).toEqual(DEFAULT_SORT);
  });
});
