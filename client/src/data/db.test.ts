import { beforeEach, describe, expect, it } from "vitest";
import { db, resetAllData } from "./db";
import { addWord, getWordCount, getAllWords } from "./wordRepository";
import { getSettings, saveSettings } from "./settingsRepository";
import { DEFAULT_LANGUAGE_SETTINGS } from "@/types";

beforeEach(async () => {
  await db.words.clear();
  await db.settings.clear();
});

describe("resetAllData", () => {
  it("deletes all words", async () => {
    await addWord("hello", "привет");
    await addWord("world", "мир");
    expect(await getWordCount()).toBe(2);

    await resetAllData();

    expect(await getWordCount()).toBe(0);
    expect(await getAllWords()).toEqual([]);
  });

  it("deletes all settings and restores defaults", async () => {
    await saveSettings({ source_lang: "de", target_lang: "fr", locale: "ru", theme: "dark", skin: "ocean" });

    await resetAllData();

    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_LANGUAGE_SETTINGS);
  });

  it("works when database is already empty", async () => {
    await resetAllData();

    expect(await getWordCount()).toBe(0);
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_LANGUAGE_SETTINGS);
  });
});
