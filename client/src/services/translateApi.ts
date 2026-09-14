import { PROXY_URL, proxyHeaders } from "./proxyClient";
import { notifyUpdateRequired } from "./updateGate";

export interface TranslateResult {
  translation: string;
  detectedLanguage: string;
  /** True when served from the server cache (no quota consumed). */
  cached?: boolean;
}

/** Error codes returned by the proxy for limit violations. */
export type LimitErrorCode = "text_too_long" | "daily_quota_exceeded";

/** Error with a machine-readable code from the proxy (limits, etc.). */
export class LimitError extends Error {
  code: LimitErrorCode;
  maxLength?: number;

  constructor(code: LimitErrorCode, maxLength?: number) {
    super(code);
    this.code = code;
    this.maxLength = maxLength;
  }
}

/** Max text length accepted by the proxy per request. */
export const MAX_TEXT_LENGTH = 500;

/**
 * Daily character quota per device (translation and TTS are separate).
 * Mirrors the proxy default (DEVICE_DAILY_CHAR_LIMIT); the actual value
 * is always taken from GET /quota — this constant is only for static
 * texts where the live value is not available.
 */
export const DAILY_CHAR_LIMIT = 500;

function toLimitError(body: { error?: string; max_length?: number }, status: number): Error {
  if (body.error === "text_too_long") {
    return new LimitError("text_too_long", body.max_length);
  }
  if (body.error === "daily_quota_exceeded") {
    return new LimitError("daily_quota_exceeded");
  }
  return new Error(body.error ?? `HTTP ${status}`);
}

export interface LanguageInfo {
  code: string;
  name: string;
}

/**
 * Translate a word via the proxy.
 * Falls back to empty result on error.
 */
export async function translateWord(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<TranslateResult> {
  const response = await fetch(`${PROXY_URL}/translate`, {
    method: "POST",
    headers: proxyHeaders(),
    body: JSON.stringify({
      word,
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
  });

  if (!response.ok) {
    if (response.status === 426) {
      notifyUpdateRequired();
      throw new Error("update_required");
    }
    const body = await response.json().catch(() => ({}));
    throw toLimitError(body, response.status);
  }

  const data = await response.json();
  return {
    translation: data.translation ?? "",
    detectedLanguage: data.detected_language ?? "",
    cached: data.cached ?? false,
  };
}

/**
 * Fetch supported languages from the proxy.
 */
export async function getLanguages(): Promise<LanguageInfo[]> {
  const response = await fetch(`${PROXY_URL}/languages`, {
    headers: proxyHeaders(),
  });

  if (!response.ok) {
    if (response.status === 426) {
      notifyUpdateRequired();
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.languages as LanguageInfo[];
}
