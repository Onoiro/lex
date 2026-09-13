import { describe, it, expect, vi, beforeEach } from "vitest";
import { synthesizeSpeech, clearTtsCache } from "@/services/ttsApi";

/**
 * jsdom has no Cache API — install a minimal in-memory stub before each
 * test. URL.createObjectURL/revokeObjectURL are patched as statics
 * (vi.stubGlobal on URL breaks `new Request` inside the cache layer).
 */
const store = new Map<string, Response>();

function installCacheStub() {
  store.clear();
  const cache = {
    match: vi.fn(async (req: Request) => store.get(req.url) ?? null),
    put: vi.fn(async (req: Request, res: Response) => {
      store.set(req.url, res);
    }),
    delete: vi.fn(async (req: Request) => store.delete(req.url)),
  };
  vi.stubGlobal("caches", {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => true),
  });
  return cache;
}

function audioResponse(headers: Record<string, string> = {}): Response {
  return new Response(new Blob(["audio-data"], { type: "audio/mpeg" }), {
    status: 200,
    headers,
  });
}

describe("ttsApi.synthesizeSpeech", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clearTtsCache();
    installCacheStub();
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    Object.defineProperty(window, "HTMLMediaElement", {
      configurable: true,
      value: class {
        play = vi.fn().mockResolvedValue(undefined);
        pause = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      },
    });
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: window.HTMLMediaElement,
    });
  });

  it("returns played:false for empty text", async () => {
    const result = await synthesizeSpeech("  ", "en");
    expect(result).toEqual({ played: false, cached: false });
  });

  it("returns cached:true on local Cache API hit (no fetch)", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    // Prime the local cache
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(audioResponse()),
    );
    await synthesizeSpeech("hello", "en");

    // Second call must come from the local cache
    const localFetch = vi.fn();
    vi.stubGlobal("fetch", localFetch);
    const result = await synthesizeSpeech("hello", "en");

    expect(result).toEqual({ played: true, cached: true });
    expect(localFetch).not.toHaveBeenCalled();
  });

  it("returns cached:true when server responds with X-Cached: 1", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      audioResponse({ "X-Cached": "1" }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await synthesizeSpeech("bonjour", "fr");
    expect(result).toEqual({ played: true, cached: true });
  });

  it("returns cached:false on fresh synthesis", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal("fetch", mockFetch);

    const result = await synthesizeSpeech("world", "en");
    expect(result).toEqual({ played: true, cached: false });
  });

  it("returns played:false on quota error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: "daily_quota_exceeded" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const onError = vi.fn();
    const result = await synthesizeSpeech("world", "en", onError);

    expect(result).toEqual({ played: false, cached: false });
    expect(onError).toHaveBeenCalledWith("daily_quota_exceeded");
  });

  it("returns played:false when offline", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const result = await synthesizeSpeech("world", "en");

    expect(result).toEqual({ played: false, cached: false });
    expect(mockFetch).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });
});
