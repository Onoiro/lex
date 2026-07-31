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

// Mock URL.createObjectURL / revokeObjectURL
const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
vi.stubGlobal("URL", { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });

// ── Helpers ────────────────────────────────────────────────────

/** Create a mock fetch response that returns a blob. */
function mockResponse() {
  return {
    ok: true,
    blob: async () => new Blob(["fake-mp3-data"], { type: "audio/mpeg" }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  resetAudioMocks();
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