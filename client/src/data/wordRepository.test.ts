import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  addWord,
  deleteWord,
  getAllWords,
  getWord,
  getWordCount,
  updateWord,
  exportWords,
  importWords,
} from "./wordRepository";
import type { Word } from "@/types";

beforeEach(async () => {
  await db.words.clear();
});

describe("addWord", () => {
  it("creates a word with default SRS fields", async () => {
    const id = await addWord("hello", "привет");

    const word = await getWord(id);
    expect(word).toBeDefined();
    expect(word!.word).toBe("hello");
    expect(word!.translation).toBe("привет");
    expect(word!.interval).toBe(0);
    expect(word!.repetitions).toBe(0);
    expect(word!.next_review).toBe(0);
    expect(word!.last_direction).toBe("en_ru");
    expect(word!.best_time).toBeNull();
    expect(word!.avg_time).toBeNull();
    expect(word!.know_count).toBe(0);
    expect(word!.forgot_count).toBe(0);
  });

  it("throws on duplicate word", async () => {
    await addWord("hello", "привет");

    await expect(addWord("hello", "other translation")).rejects.toThrow(
      'Word "hello" already exists',
    );
  });
});

describe("deleteWord", () => {
  it("removes a word by id", async () => {
    const id = await addWord("test", "тест");
    await deleteWord(id);

    const word = await getWord(id);
    expect(word).toBeUndefined();
  });
});

describe("getWord", () => {
  it("returns undefined for non-existent id", async () => {
    const word = await getWord(9999);
    expect(word).toBeUndefined();
  });
});

describe("getAllWords", () => {
  it("returns words sorted alphabetically", async () => {
    await addWord("zebra", "зебра");
    await addWord("apple", "яблоко");
    await addWord("mango", "манго");

    const words = await getAllWords();
    expect(words.map((w) => w.word)).toEqual(["apple", "mango", "zebra"]);
  });

  it("returns empty array when no words", async () => {
    const words = await getAllWords();
    expect(words).toEqual([]);
  });
});

describe("updateWord", () => {
  it("partially updates a word", async () => {
    const id = await addWord("hello", "привет");

    await updateWord(id, {
      interval: 6,
      repetitions: 2,
      best_time: 1.5,
    });

    const word = await getWord(id);
    expect(word!.interval).toBe(6);
    expect(word!.repetitions).toBe(2);
    expect(word!.best_time).toBe(1.5);
    // Unchanged fields stay the same
    expect(word!.word).toBe("hello");
    expect(word!.translation).toBe("привет");
    expect(word!.know_count).toBe(0);
  });
});

describe("getWordCount", () => {
  it("returns total count", async () => {
    expect(await getWordCount()).toBe(0);

    await addWord("a", "а");
    await addWord("b", "б");

    expect(await getWordCount()).toBe(2);
  });
});

describe("exportWords", () => {
  it("returns all words sorted alphabetically", async () => {
    await addWord("zebra", "зебра");
    await addWord("apple", "яблоко");

    const words = await exportWords();
    expect(words).toHaveLength(2);
    expect(words[0].word).toBe("apple");
    expect(words[1].word).toBe("zebra");
  });

  it("returns empty array for empty dictionary", async () => {
    const words = await exportWords();
    expect(words).toEqual([]);
  });

  it("includes all SRS fields", async () => {
    const id = await addWord("hello", "привет");
    await updateWord(id, { interval: 6, best_time: 1.5, know_count: 3 });

    const words = await exportWords();
    expect(words[0].interval).toBe(6);
    expect(words[0].best_time).toBe(1.5);
    expect(words[0].know_count).toBe(3);
  });
});

describe("importWords", () => {
  it("imports new words", async () => {
    const data: Word[] = [
      {
        word: "hello",
        translation: "привет",
        interval: 0,
        repetitions: 0,
        next_review: 0,
        last_direction: "en_ru",
        best_time: null,
        avg_time: null,
        know_count: 0,
        forgot_count: 0,
      },
      {
        word: "world",
        translation: "мир",
        interval: 6,
        repetitions: 2,
        next_review: 1000,
        last_direction: "ru_en",
        best_time: 1.5,
        avg_time: 2.0,
        know_count: 3,
        forgot_count: 1,
      },
    ];

    const result = await importWords(data);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);

    const words = await getAllWords();
    expect(words).toHaveLength(2);
  });

  it("skips duplicates", async () => {
    await addWord("hello", "привет");

    const data: Word[] = [
      {
        word: "hello",
        translation: "other",
        interval: 0,
        repetitions: 0,
        next_review: 0,
        last_direction: "en_ru",
        best_time: null,
        avg_time: null,
        know_count: 0,
        forgot_count: 0,
      },
      {
        word: "world",
        translation: "мир",
        interval: 0,
        repetitions: 0,
        next_review: 0,
        last_direction: "en_ru",
        best_time: null,
        avg_time: null,
        know_count: 0,
        forgot_count: 0,
      },
    ];

    const result = await importWords(data);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);

    const words = await getAllWords();
    expect(words).toHaveLength(2);
    // Existing word should not be overwritten
    const hello = words.find((w) => w.word === "hello");
    expect(hello!.translation).toBe("привет");
  });

  it("handles empty array", async () => {
    const result = await importWords([]);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("applies defaults for missing fields", async () => {
    const data = [
      { word: "test", translation: "тест" },
    ] as unknown as Word[];

    const result = await importWords(data);
    expect(result.imported).toBe(1);

    const words = await getAllWords();
    const word = words.find((w) => w.word === "test");
    expect(word).toBeDefined();
    expect(word!.interval).toBe(0);
    expect(word!.repetitions).toBe(0);
    expect(word!.last_direction).toBe("en_ru");
    expect(word!.best_time).toBeNull();
    expect(word!.know_count).toBe(0);
  });
});
