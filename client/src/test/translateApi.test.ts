import { describe, it, expect, vi, beforeEach } from "vitest";
import { translateWord, getLanguages, LimitError } from "@/services/translateApi";
import {
  isUpdateRequired,
  onUpdateRequired,
} from "@/services/updateGate";

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

    it("throws LimitError with code on text_too_long", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "text_too_long", max_length: 500 }),
        }),
      );

      const err = await translateWord("a".repeat(501), "en", "ru").catch((e) => e);
      expect(err).toBeInstanceOf(LimitError);
      expect(err.code).toBe("text_too_long");
      expect(err.maxLength).toBe(500);
    });

    it("throws LimitError with code on daily_quota_exceeded", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: "daily_quota_exceeded" }),
        }),
      );

      const err = await translateWord("hello", "en", "ru").catch((e) => e);
      expect(err).toBeInstanceOf(LimitError);
      expect(err.code).toBe("daily_quota_exceeded");
    });

    it("notifies update gate on 426 update_required", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 426,
          json: () => Promise.resolve({ error: "update_required" }),
        }),
      );

      let notified = false;
      const unsub = onUpdateRequired(() => {
        notified = true;
      });

      await expect(translateWord("hello", "en", "ru")).rejects.toThrow(
        "update_required",
      );
      expect(notified).toBe(true);
      expect(isUpdateRequired()).toBe(true);
      unsub();
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
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
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
