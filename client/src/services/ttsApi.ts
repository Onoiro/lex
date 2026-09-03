const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

// ── Persistent audio cache (Cache API) ─────────────────────────
//
// Synthesized audio is stored in the browser Cache API so it
// survives page reloads and works offline. Audio for a word never
// becomes stale, so there is no TTL — only an LRU size cap as a
// safety net against unbounded growth.

const TTS_CACHE_NAME = "lex-tts-audio";
const META_KEY = "tts:__meta__";
const MAX_CACHE_BYTES = 50 * 1024 * 1024; // ~50 MB

interface CacheMetaEntry {
  key: string;
  size: number;
  ts: number;
}

/** Cache API requires a valid URL as a request key. */
function cacheRequest(key: string): Request {
  return new Request(`https://tts.local/${key}`);
}

function isCacheAvailable(): boolean {
  return typeof caches !== "undefined";
}

async function openTtsCache(): Promise<Cache | null> {
  if (!isCacheAvailable()) return null;
  try {
    return await caches.open(TTS_CACHE_NAME);
  } catch {
    return null;
  }
}

async function readMeta(cache: Cache): Promise<CacheMetaEntry[]> {
  try {
    const res = await cache.match(META_KEY);
    if (!res) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as CacheMetaEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeMeta(cache: Cache, meta: CacheMetaEntry[]): Promise<void> {
  try {
    await cache.put(
      META_KEY,
      new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }),
    );
  } catch {
    // Meta is best-effort; losing it only resets LRU accounting
  }
}

async function cacheGetBlob(key: string): Promise<Blob | null> {
  const cache = await openTtsCache();
  if (!cache) return null;
  try {
    const res = await cache.match(cacheRequest(key));
    if (!res) return null;
    const blob = await res.blob();
    // Touch entry for LRU
    const meta = await readMeta(cache);
    const entry = meta.find((e) => e.key === key);
    if (entry) {
      entry.ts = Date.now();
      await writeMeta(cache, meta);
    }
    return blob;
  } catch {
    return null;
  }
}

async function cachePutBlob(key: string, blob: Blob): Promise<void> {
  const cache = await openTtsCache();
  if (!cache) return;
  try {
    await cache.put(cacheRequest(key), new Response(blob));

    const meta = (await readMeta(cache)).filter((e) => e.key !== key);
    meta.push({ key, size: blob.size, ts: Date.now() });

    // Evict least-recently-used entries when over the size cap
    let total = meta.reduce((sum, e) => sum + e.size, 0);
    while (total > MAX_CACHE_BYTES && meta.length > 1) {
      const oldestIdx = meta.reduce((min, e, i) => (e.ts < meta[min].ts ? i : min), 0);
      const [evicted] = meta.splice(oldestIdx, 1);
      await cache.delete(cacheRequest(evicted.key));
      total -= evicted.size;
    }

    await writeMeta(cache, meta);
  } catch {
    // Cache write failures are non-fatal
  }
}

/** Clear the persistent audio cache (useful for testing). */
export async function clearTtsCache(): Promise<void> {
  if (!isCacheAvailable()) return;
  try {
    await caches.delete(TTS_CACHE_NAME);
  } catch {
    // Ignore
  }
}

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
 * Uses a persistent Cache API cache to avoid redundant requests
 * and to enable offline playback of previously heard words.
 * When offline with no cached audio, returns immediately instead
 * of making a doomed request (avoids 502 noise in proxy logs).
 * Fails silently — never throws. Limit violations (daily quota,
 * text too long) are reported via the optional onError callback.
 * Any previously playing audio is stopped; stale fetch results are discarded.
 */
export async function synthesizeSpeech(
  text: string,
  lang: string,
  onError?: (code: "daily_quota_exceeded" | "text_too_long") => void,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  // Stop any currently playing audio (this increments generationToken)
  stopTts();

  // Allocate a fresh token AFTER stopTts so the token is not invalidated
  const token = ++generationToken;

  const cacheKey = `tts:${lang}:${encodeURIComponent(trimmed)}`;

  // Check persistent cache first
  const cached = await cacheGetBlob(cacheKey);
  if (token !== generationToken) return;
  if (cached) {
    playBlob(cached, token);
    return;
  }

  // Offline with no cached audio — skip the doomed request
  if (!navigator.onLine) return;

  try {
    const response = await fetch(`${PROXY_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, lang }),
    });

    if (!response.ok) {
      if (onError) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (body.error === "daily_quota_exceeded" || body.error === "text_too_long") {
          onError(body.error);
        }
      }
      return;
    }

    const blob = await response.blob();

    // Discard stale results
    if (token !== generationToken) return;

    await cachePutBlob(cacheKey, blob);
    playBlob(blob, token);
  } catch {
    // Silent fail
  }
}
