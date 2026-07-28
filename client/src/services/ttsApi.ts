const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

/** In-memory cache for synthesized audio blobs (keyed by "lang:text"). */
const audioCache = new Map<string, Blob>();

/** Monotonic token to invalidate stale fetch/playback requests. */
let generationToken = 0;

/** Currently playing AudioBufferSourceNode, or null. */
let currentSource: AudioBufferSourceNode | null = null;

// ── Web Audio API ──────────────────────────────────────────────
//
// Mobile browsers (iOS Safari, Android Firefox/Chrome) block audio
// playback unless it's initiated by a synchronous user gesture. The
// Web Audio API provides a reliable unlock mechanism:
//
// 1. AudioContext is created in "suspended" state on mobile.
// 2. resume() is called during the first user gesture (touchstart/click).
// 3. After resume(), decodeAudioData() + start() work programmatically
//    even outside of user gestures.
//
// AudioBufferSourceNode can only be started once, so we create a new
// one for each play request.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AnyAudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AnyAudioContext();
  }
  return audioCtx;
}

/** Resume the AudioContext on first user gesture to unlock audio. */
let audioUnlocked = false;

function unlockAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
}

/** Register global listeners to unlock audio on first user gesture. */
export function initTtsUnlock(): void {
  const opts: AddEventListenerOptions = { once: true, passive: true };
  document.addEventListener("touchstart", unlockAudio, opts);
  document.addEventListener("click", unlockAudio, opts);
  // Also try to resume immediately if context is already running
  // (e.g. desktop, or if another page interaction already unlocked it)
  if (getAudioContext().state === "running") {
    audioUnlocked = true;
  }
}

// ── Playback helpers ───────────────────────────────────────────

/** Stop any currently playing audio. */
export function stopTts(): void {
  generationToken++;
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // Ignore — source may have already stopped
    }
    currentSource.disconnect();
    currentSource = null;
  }
}

/**
 * Decode MP3 bytes and play them through the Web Audio API.
 * Returns true if playback was started, false on error.
 */
function playAudioBuffer(arrayBuffer: ArrayBuffer, token: number): boolean {
  if (token !== generationToken) return false;

  // Stop any currently playing audio WITHOUT incrementing generationToken
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // Ignore — source may have already stopped
    }
    currentSource.disconnect();
    currentSource = null;
  }

  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    // Audio not unlocked yet — silently fail
    return false;
  }

  // Decode asynchronously, then play
  void ctx.decodeAudioData(arrayBuffer, (buffer) => {
    if (token !== generationToken) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    currentSource = source;

    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
      }
    };
  });

  return true;
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

  // Ensure AudioContext is unlocked — if still suspended, try to resume
  // (this may be called from a user gesture handler)
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const cacheKey = `${lang}:${trimmed}`;

  // Check cache first
  const cached = audioCache.get(cacheKey);
  if (cached) {
    const buf = await cached.arrayBuffer();
    playAudioBuffer(buf, token);
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

    const arrayBuffer = await blob.arrayBuffer();
    playAudioBuffer(arrayBuffer, token);
  } catch {
    // Silent fail
  }
}

/** Clear the audio cache (useful for testing). */
export function clearTtsCache(): void {
  audioCache.clear();
}