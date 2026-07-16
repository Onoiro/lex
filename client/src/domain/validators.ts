export const MAX_WORD_LENGTH = 100;
export const MAX_TRANSLATION_LENGTH = 500;

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

  // NFC normalization
  return trimmed.normalize("NFC");
}
