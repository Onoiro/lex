import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeSpeech, clearTtsCache, stopTts, initTtsUnlock } from "./ttsApi";

// ── Mocks ──────────────────────────────────────────────────────

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock HTMLAudioElement
let mockAudioPlay: ReturnType<typeof vi.fn>;
let mockAudioPause: ReturnType<typeof vi.fn>;
let mockAudioAddEventListener: ReturnType<typeof vi.fn>;
let mockAudioRemoveEventListener: ReturnType<typeof vi.fn>;

function resetAudioMocks() {
  mockAudioPlay = vi.fn().mockResolvedValue(undefined);
  mockAudioPause = vi.fn();
  mockAudioAddEventListener = vi.fn();
  mockAudioRemoveEventListener = vi.fn();
}

resetAudioMocks();

class MockAudio {
  volume = 0;
  get play() { return mockAudioPlay; }
  get pause() { return mockAudioPause; }
  get addEventListener() { return mockAudioAddEventListener; }
  get removeEventListener() { return mockAudioRemoveEventListener; }
}

vi.stubGlobal("Audio", MockAudio);

// jsdom's URL lacks blob URL methods. Patch them as statics instead of
// replacing the whole URL global — Request/Response parsing relies on it.
const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
(URL as unknown as Record<string, unknown>).createObjectURL = mockCreateObjectURL;
(URL as unknown as Record<string, unknown>).revokeObjectURL = mockRevokeObjectURL;

// ── Fake CacheStorage ──────────────────────────────────────────
// jsdom has no Cache API, so we provide a Map-based fake.

const TTS_CACHE_NAME = "lex-tts-audio";

class FakeCache {
  store = new Map<string, Response>();

  async match(req: Request | string): Promise<Response | undefined> {
    const url = typeof req === "string" ? req : req.url;
    const res = this.store.get(url);
    return res ? res.clone() : undefined;
  }

  async put(req: Request | string, res: Response): Promise<void> {
    const url = typeof req === "string" ? req : req.url;
    this.store.set(url, res.clone());
  }

  async delete(req: Request | string): Promise<boolean> {
    const url = typeof req === "string" ? req : req.url;
    return this.store.delete(url);
  }
}

const fakeCache = new FakeCache();

const fakeCaches = {
  open: vi.fn(async (name: string) => {
    if (name !== TTS_CACHE_NAME) throw new Error("unknown cache");
    return fakeCache as unknown as Cache;
  }),
  delete: vi.fn(async (name: string) => {
    if (name !== TTS_CACHE_NAME) return false;
    fakeCache.store.clear();
    return true;
  }),
};

vi.stubGlobal("caches", fakeCaches);

// ── Helpers ────────────────────────────────────────────────────

/** Create a mock fetch response that returns a blob. */
function mockResponse() {
  return {
    ok: true,
    blob: async () => new Blob(["fake-mp3-data"], { type: "audio/mpeg" }),
  };
}

/** Control navigator.onLine via a spy (auto-restored in afterEach). */
function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

beforeEach(async () => {
  mockFetch.mockReset();
  resetAudioMocks();
  fakeCaches.open.mockClear();
  fakeCaches.delete.mockClear();
  fakeCache.store.clear();
  stopTts();
  await clearTtsCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────

describe("initTtsUnlock", () => {
  it("registers touchstart and click listeners", () => {
    const spy = vi.spyOn(document, "addEventListener");
    initTtsUnlock();
    expect(spy).toHaveBeenCalledWith("touchstart", expect.any(Function), expect.objectContaining({ once: true }));
    expect(spy).toHaveBeenCalledWith("click", expect.any(Function), expect.objectContaining({ once: true }));
  });
});

describe("synthesizeSpeech", () => {
  it("does nothing for empty text", async () => {
    await synthesizeSpeech("", "en");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does nothing for whitespace-only text", async () => {
    await synthesizeSpeech("   ", "en");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches audio from /tts endpoint", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse());

    await synthesizeSpeech("hello", "en");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/tts");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ text: "hello", lang: "en" });
  });

  it("caches audio and does not refetch for same text+lang", async () => {
    mockFetch.mockResolvedValue(mockResponse());

    await synthesizeSpeech("hello", "en");
    await synthesizeSpeech("hello", "en");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fetches separately for different languages", async () => {
    mockFetch.mockResolvedValue(mockResponse());

    await synthesizeSpeech("hello", "en");
    await synthesizeSpeech("hello", "ru");

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("fails silently on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 });

    await expect(synthesizeSpeech("hello", "en")).resolves.toBeUndefined();
  });

  it("reports daily_quota_exceeded via onError callback", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "daily_quota_exceeded" }),
    });
    const onError = vi.fn();

    await synthesizeSpeech("hello", "en", onError);

    expect(onError).toHaveBeenCalledWith("daily_quota_exceeded");
  });

  it("reports text_too_long via onError callback", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "text_too_long", max_length: 500 }),
    });
    const onError = vi.fn();

    await synthesizeSpeech("hello", "en", onError);

    expect(onError).toHaveBeenCalledWith("text_too_long");
  });

  it("does not call onError for other HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: "Speech synthesis failed" }),
    });
    const onError = vi.fn();

    await synthesizeSpeech("hello", "en", onError);

    expect(onError).not.toHaveBeenCalled();
  });

  it("fails silently on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(synthesizeSpeech("hello", "en")).resolves.toBeUndefined();
  });

  it("trims text before sending", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse());

    await synthesizeSpeech("  hello  ", "en");

    const [, opts] = mockFetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ text: "hello", lang: "en" });
  });

  it("does not fetch when offline and cache is empty", async () => {
    setOnline(false);

    await synthesizeSpeech("hello", "en");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("plays cached audio when offline without fetching", async () => {
    // Populate cache while online
    mockFetch.mockResolvedValueOnce(mockResponse());
    await synthesizeSpeech("hello", "en");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Go offline and request the same word
    setOnline(false);
    await synthesizeSpeech("hello", "en");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockAudioPlay).toHaveBeenCalledTimes(2);
  });

  it("still fetches when offline for a word not in cache after cache clear", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse());
    await synthesizeSpeech("hello", "en");

    await clearTtsCache();
    setOnline(false);
    await synthesizeSpeech("hello", "en");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockAudioPlay).toHaveBeenCalledTimes(1);
  });

  it("stores audio entries and meta in the persistent cache", async () => {
    mockFetch.mockResolvedValue(mockResponse());
    await synthesizeSpeech("hello", "en");
    await synthesizeSpeech("world", "en");

    // 2 audio entries + 1 meta entry
    expect(fakeCache.store.size).toBe(3);
  });
});

describe("stopTts", () => {
  it("discards stale fetch results when stopTts is called before fetch resolves", async () => {
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
    mockFetch.mockReturnValueOnce(fetchPromise);

    // Start synthesis (fetch is pending)
    const promise = synthesizeSpeech("hello", "en");

    // Stop TTS while fetch is still pending
    stopTts();

    // Now resolve the fetch
    resolveFetch!({
      ok: true,
      blob: async () => new Blob(["fake-mp3-data"], { type: "audio/mpeg" }),
    });

    await promise;

    // Audio play should NOT have been called because the result is stale
    // (mockAudioPlay is called by playBlob, which shouldn't be invoked for stale results)
    expect(mockAudioPlay).not.toHaveBeenCalled();
  });

  it("stops currently playing audio", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse());

    await synthesizeSpeech("hello", "en");

    // Audio play should have been started
    expect(mockAudioPlay).toHaveBeenCalledTimes(1);

    // Stop TTS
    stopTts();

    // Audio pause should have been called
    expect(mockAudioPause).toHaveBeenCalled();
  });
});
