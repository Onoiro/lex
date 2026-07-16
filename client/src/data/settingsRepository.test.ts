import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { getSettings, saveSettings } from "./settingsRepository";
import { DEFAULT_LANGUAGE_SETTINGS } from "@/types";

beforeEach(async () => {
  await db.settings.clear();
});

describe("getSettings", () => {
  it("returns defaults when no settings stored", async () => {
    const settings = await getSettings();

    expect(settings).toEqual(DEFAULT_LANGUAGE_SETTINGS);
  });

  it("returns stored settings", async () => {
    await saveSettings({ source_lang: "en", target_lang: "de", locale: "ru" });

    const settings = await getSettings();
    expect(settings.source_lang).toBe("en");
    expect(settings.target_lang).toBe("de");
    expect(settings.locale).toBe("ru");
  });
});

describe("saveSettings", () => {
  it("creates settings row on first save", async () => {
    await saveSettings({ target_lang: "fr" });

    const settings = await getSettings();
    expect(settings.target_lang).toBe("fr");
    // Other fields keep defaults
    expect(settings.source_lang).toBe(DEFAULT_LANGUAGE_SETTINGS.source_lang);
    expect(settings.locale).toBe(DEFAULT_LANGUAGE_SETTINGS.locale);
  });

  it("merges partial updates without losing existing fields", async () => {
    await saveSettings({ source_lang: "en", target_lang: "de", locale: "ru" });
    await saveSettings({ target_lang: "fr" });

    const settings = await getSettings();
    expect(settings.source_lang).toBe("en");
    expect(settings.target_lang).toBe("fr");
    expect(settings.locale).toBe("ru");
  });
});
