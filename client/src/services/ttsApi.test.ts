import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeSpeech, clearTtsCache } from "./ttsApi";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Audio constructor
class MockAudio {
  play = vi.fn().mockResolvedValue(undefined);
  addEventListener = vi.fn();
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
  clearTtsCache();
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
