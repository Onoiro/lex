import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  addWord,
  deleteWord,
  getAllWords,
  getWord,
  getWordCount,
  updateWord,
} from "./wordRepository";

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
