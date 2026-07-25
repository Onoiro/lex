import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeSpeech, clearTtsCache, stopTts } from "./ttsApi";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Audio constructor
const mockPlay = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();
const mockAddEventListener = vi.fn();

class MockAudio {
  play = mockPlay;
  pause = mockPause;
  addEventListener = mockAddEventListener;
}
vi.stubGlobal("Audio", MockAudio);

// Mock URL.createObjectURL/revokeObjectURL
vi.stubGlobal("URL", {
  ...URL,
  createObjectURL: vi.fn().mockReturnValue("blob:test"),
  revokeObjectURL: vi.fn(),
});

beforeEach(() => {
  mockFetch.mockReset();
  mockPlay.mockReset().mockResolvedValue(undefined);
  mockPause.mockReset();
  mockAddEventListener.mockReset();
  clearTtsCache();
  stopTts();
});

afterEach(() => {
  vi.restoreAllMocks();
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
    const mockBlob = new Blob(["fake audio"], { type: "audio/mpeg" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob,
    });

    await synthesizeSpeech("hello", "en");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain("/tts");
    const options = call[1];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ text: "hello", lang: "en" });
  });

  it("caches audio and does not refetch for same text+lang", async () => {
    const mockBlob = new Blob(["fake audio"], { type: "audio/mpeg" });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    });

    await synthesizeSpeech("hello", "en");
    await synthesizeSpeech("hello", "en");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fetches separately for different languages", async () => {
    const mockBlob = new Blob(["fake audio"], { type: "audio/mpeg" });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    });

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
    const mockBlob = new Blob(["fake audio"], { type: "audio/mpeg" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob,
    });

    await synthesizeSpeech("  hello  ", "en");

    const options = mockFetch.mock.calls[0][1];
    expect(JSON.parse(options.body)).toEqual({ text: "hello", lang: "en" });
  });
});

describe("stopTts", () => {
  it("discards stale fetch results when stopTts is called before fetch resolves", async () => {
    const mockBlob = new Blob(["fake audio"], { type: "audio/mpeg" });

    // Create a controllable promise for fetch
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    mockFetch.mockReturnValueOnce(fetchPromise);

    // Start synthesis (fetch is pending)
    const promise = synthesizeSpeech("hello", "en");

    // Stop TTS while fetch is still pending
    stopTts();

    // Now resolve the fetch
    resolveFetch!({ ok: true, blob: async () => mockBlob });

    await promise;

    // Audio.play should NOT have been called because the result is stale
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it("stops currently playing audio", async () => {
    const mockBlob = new Blob(["fake audio"], { type: "audio/mpeg" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob,
    });

    await synthesizeSpeech("hello", "en");

    // Audio was played
    expect(mockPlay).toHaveBeenCalledTimes(1);

    // Stop TTS
    stopTts();

    // Audio.pause should have been called
    expect(mockPause).toHaveBeenCalled();
  });

  it("new synthesizeSpeech stops previous audio", async () => {
    const mockBlob = new Blob(["fake audio"], { type: "audio/mpeg" });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    });

    // First synthesis (from cache, plays immediately)
    await synthesizeSpeech("hello", "en");

    // Second synthesis (different text, fetches new audio)
    await synthesizeSpeech("world", "en");

    // pause should have been called when second synthesis started
    expect(mockPause).toHaveBeenCalled();
  });
});
