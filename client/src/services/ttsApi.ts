const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

/** In-memory cache for synthesized audio blobs (keyed by "lang:text"). */
const audioCache = new Map<string, Blob>();

/** Currently playing audio element, or null if nothing is playing. */
let currentAudio: HTMLAudioElement | null = null;

/** Monotonic token to invalidate stale fetch/playback requests. */
let generationToken = 0;

/** Stop any currently playing audio and invalidate all pending requests. */
export function stopTts(): void {
  generationToken++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Play audio from a Blob, cleaning up the object URL after playback. */
function playBlob(blob: Blob, token: number): void {
  if (token !== generationToken) return;

  // Stop any currently playing audio before starting new
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;

  audio.addEventListener("ended", () => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
  });
  audio.addEventListener("error", () => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
  });
  void audio.play().catch(() => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
  });
}

/**
 * Synthesize speech via the proxy and play it.
 * Uses an in-memory cache to avoid redundant requests.
 * Fails silently — never throws.
 * Any previously playing audio is stopped; stale fetch results are discarded.
 */
export async function synthesizeSpeech(text: string, lang: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const token = ++generationToken;

  // Stop any currently playing audio before starting new
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const cacheKey = `${lang}:${trimmed}`;

  // Check cache first
  const cached = audioCache.get(cacheKey);
  if (cached) {
    playBlob(cached, token);
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

    // Discard stale results (a newer request or stopTts has been called)
    if (token !== generationToken) return;

    audioCache.set(cacheKey, blob);
    playBlob(blob, token);
  } catch {
    // Silent fail — TTS errors should never crash the UI
  }
}

/** Clear the audio cache (useful for testing). */
export function clearTtsCache(): void {
  audioCache.clear();
}
