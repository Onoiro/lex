import type { Word } from "@/types";

export const MAX_WORD_LENGTH = 100;
export const MAX_TRANSLATION_LENGTH = 500;
export const MAX_NOTE_LENGTH = 500;

/** Import limits: reject oversized files before reading, cap entry count. */
export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_IMPORT_ENTRIES = 10_000;

const MAX_INTERVAL_DAYS = 3650; // 10 years
const MAX_COUNTER = 1_000_000;
const MAX_TIME_SECONDS = 3600;

const ALLOWED_SPECIAL_CHARS = new Set([" ", "-", "'", "."]);

/**
 * Check if a character is valid: letters, digits, spaces, hyphen, apostrophe, dot.
 */
function isValidChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;

  // ASCII letters (A-Z, a-z)
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return true;
  // ASCII digits (0-9)
  if (code >= 48 && code <= 57) return true;
  // ASCII space
  if (code === 32) return true;

  // Non-ASCII: check if it's a letter in any language
  // Unicode letter ranges (simplified: check common ranges)
  if (code >= 0x00C0) {
    // Most non-ASCII characters above U+00C0 in letter categories
    // are letters in various scripts. We allow them.
    // Excluded: punctuation, symbols, control chars (below 0x00C0 for non-ASCII)
    if (ALLOWED_SPECIAL_CHARS.has(char)) return true;

    // Check for common letter ranges
    // This is a permissive check: we allow anything above U+00C0
    // except known punctuation/symbol ranges
    if (isUnicodeLetter(char)) return true;
  }

  if (ALLOWED_SPECIAL_CHARS.has(char)) return true;

  return false;
}

/**
 * Check if a character is a Unicode letter using regex.
 */
function isUnicodeLetter(char: string): boolean {
  // \p{L} matches any Unicode letter
  return /^\p{L}$/u.test(char);
}

/**
 * Validate and normalize a word.
 * Returns the normalized word, or null if invalid.
 */
export function validateWord(word: string): string | null {
  if (!word || !word.trim()) {
    return null;
  }

  const trimmed = word.trim();

  if (trimmed.length > MAX_WORD_LENGTH) {
    return null;
  }

  for (const char of trimmed) {
    if (!isValidChar(char)) {
      return null;
    }
  }

  // NFC normalization
  return trimmed.normalize("NFC");
}

/**
 * Validate and normalize a translation.
 * Returns the normalized translation, or null if invalid.
 */
export function validateTranslation(translation: string): string | null {
  if (!translation || !translation.trim()) {
    return null;
  }

  const trimmed = translation.trim();

  if (trimmed.length > MAX_TRANSLATION_LENGTH) {
    return null;
  }

  return trimmed.normalize("NFC");
}

/**
 * Validate and normalize a note / association.
 * Notes are optional, so empty or whitespace-only returns empty string.
 * Returns the normalized note, or null if too long.
 */
export function validateNote(note: string): string | null {
  if (!note || !note.trim()) {
    return "";
  }

  const trimmed = note.trim();

  if (trimmed.length > MAX_NOTE_LENGTH) {
    return null;
  }

  return trimmed.normalize("NFC");
}

/** Sanitize a non-negative integer field: finite and >= 0 → truncated, otherwise 0. */
function sanitizeInt(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(Math.trunc(value), max);
}

/** Sanitize a time field: finite and > 0 → clamped value, otherwise null. */
function sanitizeTime(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(value, MAX_TIME_SECONDS);
}

/** Sanitize a language code: non-empty string → as is, otherwise the default. */
function sanitizeLang(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/**
 * Sanitize a single import entry (untrusted JSON from an imported file).
 * Returns a complete Word object (without id) safe to insert, or null when
 * the entry is invalid (bad word/translation/note) and must be skipped.
 */
export function sanitizeImportEntry(entry: unknown): Word | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const raw = entry as Record<string, unknown>;

  const word = typeof raw.word === "string" ? validateWord(raw.word) : null;
  if (word === null) return null;

  const translation =
    typeof raw.translation === "string" ? validateTranslation(raw.translation) : null;
  if (translation === null) return null;

  let note: string | undefined;
  if (typeof raw.note === "string") {
    const sanitized = validateNote(raw.note);
    if (sanitized === null) return null;
    if (sanitized) note = sanitized;
  }

  return {
    word,
    translation,
    word_lang: sanitizeLang(raw.word_lang, "en"),
    translation_lang: sanitizeLang(raw.translation_lang, "ru"),
    ...(note ? { note } : {}),
    interval: sanitizeInt(raw.interval, MAX_INTERVAL_DAYS),
    repetitions: sanitizeInt(raw.repetitions, MAX_COUNTER),
    next_review: sanitizeInt(raw.next_review, Number.MAX_SAFE_INTEGER),
    last_direction: raw.last_direction === "ru_en" ? "ru_en" : "en_ru",
    best_time: sanitizeTime(raw.best_time),
    avg_time: sanitizeTime(raw.avg_time),
    know_count: sanitizeInt(raw.know_count, MAX_COUNTER),
    forgot_count: sanitizeInt(raw.forgot_count, MAX_COUNTER),
    hint_count: sanitizeInt(raw.hint_count, MAX_COUNTER),
  };
}
