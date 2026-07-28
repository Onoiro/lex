import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeSpeech, clearTtsCache, stopTts, initTtsUnlock } from "./ttsApi";

// ── Mocks ──────────────────────────────────────────────────────

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock AudioContext
// Note: use getters so that class fields always read the current mock function
let mockSourceStart: ReturnType<typeof vi.fn>;
let mockSourceStop: ReturnType<typeof vi.fn>;
let mockSourceConnect: ReturnType<typeof vi.fn>;
let mockSourceDisconnect: ReturnType<typeof vi.fn>;
let mockDecodeAudioData: ReturnType<typeof vi.fn>;
let mockResume: ReturnType<typeof vi.fn>;
let mockCtxState = "running";

function resetAudioContextMocks() {
  mockSourceStart = vi.fn();
  mockSourceStop = vi.fn();
  mockSourceConnect = vi.fn();
  mockSourceDisconnect = vi.fn();
  mockDecodeAudioData = vi.fn();
  mockResume = vi.fn().mockResolvedValue(undefined);
  mockCtxState = "running";
}

resetAudioContextMocks();

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  get connect() { return mockSourceConnect; }
  get disconnect() { return mockSourceDisconnect; }
  get start() { return mockSourceStart; }
  get stop() { return mockSourceStop; }
}

class MockAudioContext {
  get state() { return mockCtxState; }
  get resume() { return mockResume; }
  get decodeAudioData() { return mockDecodeAudioData; }
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode());
  destination = {} as AudioDestinationNode;
}

vi.stubGlobal("AudioContext", MockAudioContext);
vi.stubGlobal("webkitAudioContext", undefined);

// ── Helpers ────────────────────────────────────────────────────

/** Create a mock fetch response that returns a blob-like object with arrayBuffer. */
function mockResponse() {
  return {
    ok: true,
    blob: async () => ({
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  };
}

/** Make decodeAudioData call the callback synchronously with a fake AudioBuffer. */
function enableDecode() {
  mockDecodeAudioData = vi.fn(
    (_buf: ArrayBuffer, cb: (buf: AudioBuffer) => void) => {
      cb({} as AudioBuffer);
    },
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  resetAudioContextMocks();
  clearTtsCache();
  stopTts();
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
      blob: async () => ({
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    });

    await promise;

    // decodeAudioData should NOT have been called because the result is stale
    expect(mockDecodeAudioData).not.toHaveBeenCalled();
  });

  it("stops currently playing audio", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse());
    enableDecode();

    await synthesizeSpeech("hello", "en");

    // Audio source start should have been called
    expect(mockSourceStart).toHaveBeenCalledTimes(1);

    // Stop TTS
    stopTts();

    // Audio source stop should have been called
    expect(mockSourceStop).toHaveBeenCalled();
  });

  it("new synthesizeSpeech stops previous audio", async () => {
    mockFetch.mockResolvedValue(mockResponse());
    enableDecode();

    await synthesizeSpeech("hello", "en");
    await synthesizeSpeech("world", "en");

    // stopTts (inside second synthesizeSpeech) should have stopped previous source
    expect(mockSourceStop).toHaveBeenCalled();
    // Second source should have started
    expect(mockSourceStart).toHaveBeenCalledTimes(2);
  });
});