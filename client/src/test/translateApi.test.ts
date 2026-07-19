import { describe, it, expect, vi, beforeEach } from "vitest";
import { translateWord, getLanguages } from "@/services/translateApi";

describe("translateApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("translateWord", () => {
    it("returns translation and detected language on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              translation: "привет",
              detected_language: "en",
            }),
        }),
      );

      const result = await translateWord("hello", "en", "ru");
      expect(result.translation).toBe("привет");
      expect(result.detectedLanguage).toBe("en");
    });

    it("returns empty values when response has no translation", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      const result = await translateWord("hello", "en", "ru");
      expect(result.translation).toBe("");
      expect(result.detectedLanguage).toBe("");
    });

    it("throws on HTTP error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: "Rate limit exceeded" }),
        }),
      );

      await expect(translateWord("hello", "en", "ru")).rejects.toThrow(
        "Rate limit exceeded",
      );
    });

    it("throws with HTTP status when error body is missing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error("invalid json")),
        }),
      );

      await expect(translateWord("hello", "en", "ru")).rejects.toThrow(
        "HTTP 500",
      );
    });

    it("sends correct request body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ translation: "test", detected_language: "" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await translateWord("hello", "auto", "ru");

      expect(mockFetch).toHaveBeenCalledWith(
        "/translate",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: "hello",
            source_lang: "auto",
            target_lang: "ru",
          }),
        }),
      );
    });
  });

  describe("getLanguages", () => {
    it("returns language list on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              languages: [
                { code: "en", name: "English" },
                { code: "ru", name: "Russian" },
              ],
            }),
        }),
      );

      const langs = await getLanguages();
      expect(langs).toHaveLength(2);
      expect(langs[0]).toEqual({ code: "en", name: "English" });
    });

    it("throws on HTTP error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
        }),
      );

      await expect(getLanguages()).rejects.toThrow("HTTP 503");
    });
  });
});
