import { describe, expect, it } from "vitest";
import {
  validateWord,
  validateTranslation,
  validateNote,
  sanitizeImportEntry,
  MAX_WORD_LENGTH,
  MAX_TRANSLATION_LENGTH,
  MAX_NOTE_LENGTH,
} from "./validators";

describe("validateWord", () => {
  it("returns normalized word for valid input", () => {
    expect(validateWord("hello")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(validateWord("  hello  ")).toBe("hello");
  });

  it("allows spaces within word", () => {
    expect(validateWord("hello world")).toBe("hello world");
  });

  it("allows hyphens and apostrophes", () => {
    expect(validateWord("it's")).toBe("it's");
    expect(validateWord("well-known")).toBe("well-known");
  });

  it("allows dots", () => {
    expect(validateWord("etc.")).toBe("etc.");
  });

  it("allows non-ASCII letters (Cyrillic)", () => {
    expect(validateWord("привет")).toBe("привет");
  });

  it("allows non-ASCII letters (Chinese)", () => {
    expect(validateWord("你好")).toBe("你好");
  });

  it("allows digits", () => {
    expect(validateWord("test123")).toBe("test123");
  });

  it("returns null for empty string", () => {
    expect(validateWord("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(validateWord("   ")).toBeNull();
  });

  it("returns null for word exceeding max length", () => {
    expect(validateWord("a".repeat(MAX_WORD_LENGTH + 1))).toBeNull();
  });

  it("returns null for special characters", () => {
    expect(validateWord("hello!")).toBeNull();
    expect(validateWord("hello@world")).toBeNull();
    expect(validateWord("hello#")).toBeNull();
  });
});

describe("validateTranslation", () => {
  it("returns normalized translation for valid input", () => {
    expect(validateTranslation("translation")).toBe("translation");
  });

  it("trims whitespace", () => {
    expect(validateTranslation("  translation  ")).toBe("translation");
  });

  it("returns null for empty string", () => {
    expect(validateTranslation("")).toBeNull();
  });

  it("returns null for translation exceeding max length", () => {
    expect(validateTranslation("a".repeat(MAX_TRANSLATION_LENGTH + 1))).toBeNull();
  });

  it("allows long translations within limit", () => {
    const long = "a".repeat(MAX_TRANSLATION_LENGTH);
    expect(validateTranslation(long)).toBe(long);
  });
});

describe("validateNote", () => {
  it("returns empty string for empty input", () => {
    expect(validateNote("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(validateNote("   ")).toBe("");
  });

  it("returns trimmed note for valid input", () => {
    expect(validateNote("  association  ")).toBe("association");
  });

  it("returns null for note exceeding max length", () => {
    expect(validateNote("a".repeat(MAX_NOTE_LENGTH + 1))).toBeNull();
  });

  it("allows note within max length", () => {
    const note = "a".repeat(MAX_NOTE_LENGTH);
    expect(validateNote(note)).toBe(note);
  });

  it("allows non-ASCII characters", () => {
    expect(validateNote("ассоциация")).toBe("ассоциация");
  });
});

describe("sanitizeImportEntry", () => {
  it("passes a valid entry through with all fields", () => {
    const result = sanitizeImportEntry({
      word: "hello",
      translation: "привет",
      word_lang: "en",
      translation_lang: "ru",
      note: "assoc",
      interval: 6,
      repetitions: 2,
      next_review: 1000,
      last_direction: "ru_en",
      best_time: 1.5,
      avg_time: 2.0,
      know_count: 3,
      forgot_count: 1,
      hint_count: 2,
    });

    expect(result).toEqual({
      word: "hello",
      translation: "привет",
      word_lang: "en",
      translation_lang: "ru",
      note: "assoc",
      interval: 6,
      repetitions: 2,
      next_review: 1000,
      last_direction: "ru_en",
      best_time: 1.5,
      avg_time: 2.0,
      know_count: 3,
      forgot_count: 1,
      hint_count: 2,
    });
  });

  it("returns null for non-object entries", () => {
    expect(sanitizeImportEntry("hello")).toBeNull();
    expect(sanitizeImportEntry(42)).toBeNull();
    expect(sanitizeImportEntry(null)).toBeNull();
    expect(sanitizeImportEntry(undefined)).toBeNull();
  });

  it("returns null for missing or invalid word", () => {
    expect(sanitizeImportEntry({ translation: "привет" })).toBeNull();
    expect(sanitizeImportEntry({ word: "", translation: "привет" })).toBeNull();
    expect(sanitizeImportEntry({ word: "   ", translation: "привет" })).toBeNull();
    expect(
      sanitizeImportEntry({ word: "a".repeat(MAX_WORD_LENGTH + 1), translation: "привет" }),
    ).toBeNull();
    expect(sanitizeImportEntry({ word: "hello!", translation: "привет" })).toBeNull();
    expect(sanitizeImportEntry({ word: 42, translation: "привет" })).toBeNull();
  });

  it("returns null for missing or invalid translation", () => {
    expect(sanitizeImportEntry({ word: "hello" })).toBeNull();
    expect(sanitizeImportEntry({ word: "hello", translation: "" })).toBeNull();
    expect(
      sanitizeImportEntry({ word: "hello", translation: "a".repeat(MAX_TRANSLATION_LENGTH + 1) }),
    ).toBeNull();
    expect(sanitizeImportEntry({ word: "hello", translation: { nested: true } })).toBeNull();
  });

  it("returns null for note exceeding max length", () => {
    expect(
      sanitizeImportEntry({
        word: "hello",
        translation: "привет",
        note: "a".repeat(MAX_NOTE_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it("omits note field for empty or missing note", () => {
    const withEmpty = sanitizeImportEntry({ word: "hello", translation: "привет", note: "   " });
    expect(withEmpty).not.toBeNull();
    expect(withEmpty!).not.toHaveProperty("note");

    const withoutNote = sanitizeImportEntry({ word: "hello", translation: "привет" });
    expect(withoutNote).not.toBeNull();
    expect(withoutNote!).not.toHaveProperty("note");
  });

  it("sanitizes numeric fields: negative, NaN, Infinity, fractional → defaults", () => {
    const result = sanitizeImportEntry({
      word: "hello",
      translation: "привет",
      interval: -5,
      repetitions: NaN,
      next_review: Infinity,
      know_count: 2.7,
      forgot_count: "3",
      hint_count: -1,
    });

    expect(result!.interval).toBe(0);
    expect(result!.repetitions).toBe(0);
    expect(result!.next_review).toBe(0);
    expect(result!.know_count).toBe(2);
    expect(result!.forgot_count).toBe(0);
    expect(result!.hint_count).toBe(0);
  });

  it("clamps numeric fields to upper bounds", () => {
    const result = sanitizeImportEntry({
      word: "hello",
      translation: "привет",
      interval: 999_999,
      know_count: 9_999_999,
      best_time: 100_000,
      avg_time: 100_000,
    });

    expect(result!.interval).toBe(3650);
    expect(result!.know_count).toBe(1_000_000);
    expect(result!.best_time).toBe(3600);
    expect(result!.avg_time).toBe(3600);
  });

  it("defaults last_direction for garbage values", () => {
    expect(sanitizeImportEntry({ word: "a", translation: "b", last_direction: "garbage" })!.last_direction).toBe("en_ru");
    expect(sanitizeImportEntry({ word: "a", translation: "b", last_direction: 42 })!.last_direction).toBe("en_ru");
    expect(sanitizeImportEntry({ word: "a", translation: "b", last_direction: "ru_en" })!.last_direction).toBe("ru_en");
  });

  it("defaults languages for garbage values", () => {
    const result = sanitizeImportEntry({
      word: "hello",
      translation: "привет",
      word_lang: "",
      translation_lang: 42,
    });
    expect(result!.word_lang).toBe("en");
    expect(result!.translation_lang).toBe("ru");
  });

  it("sanitizes times: 0, negative, NaN → null", () => {
    const result = sanitizeImportEntry({
      word: "hello",
      translation: "привет",
      best_time: 0,
      avg_time: -1,
    });
    expect(result!.best_time).toBeNull();
    expect(result!.avg_time).toBeNull();

    const nanResult = sanitizeImportEntry({
      word: "hello",
      translation: "привет",
      best_time: NaN,
      avg_time: "fast",
    });
    expect(nanResult!.best_time).toBeNull();
    expect(nanResult!.avg_time).toBeNull();
  });
});
