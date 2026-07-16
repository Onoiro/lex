const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

export interface TranslateResult {
  translation: string;
  detectedLanguage: string;
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      word,
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    translation: data.translation ?? "",
    detectedLanguage: data.detected_language ?? "",
  };
}

/**
 * Fetch supported languages from the proxy.
 */
export async function getLanguages(): Promise<LanguageInfo[]> {
  const response = await fetch(`${PROXY_URL}/languages`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.languages as LanguageInfo[];
}
