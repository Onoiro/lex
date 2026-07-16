import { describe, expect, it, beforeEach } from "vitest";
import { t, setLocale, getLocale, SUPPORTED_LOCALES } from "./index";

describe("i18n", () => {
  beforeEach(() => {
    setLocale("en");
  });

  describe("SUPPORTED_LOCALES", () => {
    it("contains en and ru", () => {
      expect(SUPPORTED_LOCALES).toEqual(["en", "ru"]);
    });
  });

  describe("setLocale / getLocale", () => {
    it("sets and gets locale", () => {
      setLocale("ru");
      expect(getLocale()).toBe("ru");
    });

    it("ignores unsupported locale", () => {
      setLocale("fr");
      expect(getLocale()).toBe("en");
    });
  });

  describe("t()", () => {
    it("returns English translation by default", () => {
      expect(t("nav.home")).toBe("Lex");
    });

    it("returns Russian translation when locale is ru", () => {
      setLocale("ru");
      expect(t("nav.translate")).toBe("Переводчик");
    });

    it("falls back to English when key missing in ru", () => {
      setLocale("ru");
      expect(t("nav.home")).toBe("Lex");
    });

    it("falls back to key when missing in all locales", () => {
      expect(t("nonexistent.key")).toBe("nonexistent.key");
    });

    it("interpolates params", () => {
      expect(t("review.queue", { total_due: 5 })).toBe("Words in queue: 5");
    });

    it("interpolates multiple params", () => {
      expect(t("review.stats_pct", { pct: 75 })).toBe("(75%)");
    });

    it("interpolates params in Russian", () => {
      setLocale("ru");
      expect(t("review.queue", { total_due: 3 })).toBe("Слов в очереди: 3");
    });
  });
});
