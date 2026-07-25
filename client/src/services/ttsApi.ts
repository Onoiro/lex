const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

/** In-memory cache for synthesized audio blobs (keyed by "lang:text"). */
const audioCache = new Map<string, Blob>();

/** Play audio from a Blob, cleaning up the object URL after playback. */
function playBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  audio.addEventListener("error", () => URL.revokeObjectURL(url));
  void audio.play().catch(() => URL.revokeObjectURL(url));
}

/**
 * Synthesize speech via the proxy and play it.
 * Uses an in-memory cache to avoid redundant requests.
 * Fails silently — never throws.
 */
export async function synthesizeSpeech(text: string, lang: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const cacheKey = `${lang}:${trimmed}`;

  // Check cache first
  const cached = audioCache.get(cacheKey);
  if (cached) {
    playBlob(cached);
    return;
  }

  try {
    const response = await fetch(`${PROXY_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, lang }),
    });

    if (!response.ok) return;

    const blob = await response.blob();
    audioCache.set(cacheKey, blob);
    playBlob(blob);
  } catch {
    // Silent fail — TTS errors should never crash the UI
  }
}

/** Clear the audio cache (useful for testing). */
export function clearTtsCache(): void {
  audioCache.clear();
}
