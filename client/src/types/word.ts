/** Review direction: which side to show as the prompt. */
export type ReviewDirection = "en_ru" | "ru_en";

/** A word entry in the dictionary, mirroring the server-side Word model. */
export interface Word {
  /** Auto-incremented primary key. */
  id?: number;
  /** The word text (unique). */
  word: string;
  /** The translation text. */
  translation: string;
  /** Repetition interval in days (0 = new word). */
  interval: number;
  /** Number of successful reviews. */
  repetitions: number;
  /** Next review date as Unix timestamp (seconds). */
  next_review: number;
  /** Last review direction. */
  last_direction: ReviewDirection;
  /** Best response time in seconds (null if not reviewed yet). */
  best_time: number | null;
  /** Average response time in seconds (null if not reviewed yet). */
  avg_time: number | null;
  /** Number of "I know" clicks. */
  know_count: number;
  /** Number of "I forgot" clicks. */
  forgot_count: number;
}

/** Result of a single review attempt. */
export interface ReviewResult {
  word_id: number;
  correct: boolean;
  direction: ReviewDirection;
  /** Elapsed time in seconds from showing the word to answering. */
  elapsed: number;
}

/** User language settings (stored locally, replaces server cookies). */
export interface LanguageSettings {
  /** Source language code, or "auto" for auto-detection. */
  source_lang: string;
  /** Target language code. */
  target_lang: string;
  /** UI locale code (e.g. "en", "ru"). */
  locale: string;
}

/** Default language settings. */
export const DEFAULT_LANGUAGE_SETTINGS: LanguageSettings = {
  source_lang: "auto",
  target_lang: "ru",
  locale: "en",
};
