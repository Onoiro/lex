import { describe, it, expect, vi, beforeEach } from "vitest";
import { getExamples } from "@/services/dictionaryApi";

describe("dictionaryApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns examples on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            examples: [
              { text: "Hello world.", translation: "Привет мир." },
              { text: "Goodbye.", translation: "До свидания." },
            ],
          }),
      }),
    );

    const result = await getExamples("hello", "en-ru");
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Hello world.");
    expect(result[0].translation).toBe("Привет мир.");
  });

  it("returns empty array when no examples", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ examples: [] }),
      }),
    );

    const result = await getExamples("xyz", "en-ru");
    expect(result).toEqual([]);
  });

  it("returns empty array when examples field is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    const result = await getExamples("xyz", "en-ru");
    expect(result).toEqual([]);
  });

  it("throws on HTTP error with error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: "Rate limit exceeded" }),
      }),
    );

    await expect(getExamples("hello", "en-ru")).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  it("throws with HTTP status when error body is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("invalid json")),
      }),
    );

    await expect(getExamples("hello", "en-ru")).rejects.toThrow("HTTP 502");
  });

  it("sends correct request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ examples: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getExamples("hello", "en-ru");

    expect(mockFetch).toHaveBeenCalledWith(
      "/dictionary",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: "hello", lang_pair: "en-ru" }),
      }),
    );
  });
});
