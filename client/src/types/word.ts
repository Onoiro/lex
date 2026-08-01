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
  /** Detected language of the word (e.g. "en", "ru"). Used for TTS. */
  word_lang: string;
  /** Optional user note / association / mnemonic hint. */
  note?: string;
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

/** Theme preference: "auto" follows the system color scheme. */
export type Theme = "light" | "dark" | "auto";

/** Full color skin (coordinated background, text, and accent palette). */
export type Skin = "default" | "ocean" | "forest" | "sunset" | "midnight" | "rose" | "mono";

/** User language settings (stored locally, replaces server cookies). */
export interface LanguageSettings {
  /** Source language code, or "auto" for auto-detection. */
  source_lang: string;
  /** Target language code. */
  target_lang: string;
  /** UI locale code (e.g. "en", "ru"). */
  locale: string;
  /** Cached number of supported languages (from proxy /languages). */
  lang_count?: number;
  /** When lang_count was last updated (Unix ms). */
  lang_count_updated_at?: number;
  /** Cached language list from proxy (JSON array of {code, name}). */
  lang_list?: string;
  /** When lang_list was last updated (Unix ms). */
  lang_list_updated_at?: number;
  /** Whether TTS (text-to-speech) is enabled in review mode. */
  tts_enabled: boolean;
  /** Color theme preference. */
  theme: Theme;
  /** Color skin preference. */
  skin: Skin;
}

/** Default language settings. */
export const DEFAULT_LANGUAGE_SETTINGS: LanguageSettings = {
  source_lang: "auto",
  target_lang: "ru",
  locale: "en",
  tts_enabled: false,
  theme: "auto",
  skin: "default",
};

/** How long to cache the language count before refetching (24 hours). */
export const LANG_COUNT_TTL_MS = 24 * 60 * 60 * 1000;

/** How long to cache the language list before refetching (24 hours). */
export const LANG_LIST_TTL_MS = 24 * 60 * 60 * 1000;