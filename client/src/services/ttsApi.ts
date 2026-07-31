const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

/** In-memory cache for synthesized audio blobs (keyed by "lang:text"). */
const audioCache = new Map<string, Blob>();

/** Monotonic token to invalidate stale fetch/playback requests. */
let generationToken = 0;

/** Currently playing audio element, or null if nothing is playing. */
let currentAudio: HTMLAudioElement | null = null;

// ── Audio unlock (mobile & desktop browsers) ───────────────────
//
// Browsers block programmatic audio playback unless it originates
// from a user gesture. We unlock audio on the first touch/click
// by creating an AudioContext and resuming it — this is the
// standard cross-browser mechanism that doesn't require decoding
// any audio file.

let audioUnlocked = false;

function unlockAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const AnyAudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AnyAudioContext) {
      const ctx = new AnyAudioContext();
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
    }
  } catch {
    // AudioContext not available — fallback: nothing to do
  }
}

/** Register global listeners to unlock audio on first user gesture. */
export function initTtsUnlock(): void {
  const opts: AddEventListenerOptions = { once: true, passive: true };
  document.addEventListener("touchstart", unlockAudio, opts);
  document.addEventListener("click", unlockAudio, opts);
}

// ── Playback helpers ───────────────────────────────────────────

/** Stop any currently playing audio and invalidate all pending requests. */
export function stopTts(): void {
  generationToken++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Play audio from a Blob via HTMLAudioElement. */
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

  // Stop any currently playing audio (this increments generationToken)
  stopTts();

  // Allocate a fresh token AFTER stopTts so the token is not invalidated
  const token = ++generationToken;

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

    // Discard stale results
    if (token !== generationToken) return;

    audioCache.set(cacheKey, blob);
    playBlob(blob, token);
  } catch {
    // Silent fail
  }
}

/** Clear the audio cache (useful for testing). */
export function clearTtsCache(): void {
  audioCache.clear();
}