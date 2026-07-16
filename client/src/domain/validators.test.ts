import { describe, expect, it } from "vitest";
import { validateWord, validateTranslation, MAX_WORD_LENGTH, MAX_TRANSLATION_LENGTH } from "./validators";

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
