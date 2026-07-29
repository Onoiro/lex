import { db, type SettingsRow } from "./db";
import { DEFAULT_LANGUAGE_SETTINGS, type LanguageSettings } from "@/types";

/** Read current language settings, falling back to defaults.
    Strips legacy "accent" field from older database rows. */
export async function getSettings(): Promise<LanguageSettings> {
  const row = await db.settings.get("app");
  if (!row) {
    return { ...DEFAULT_LANGUAGE_SETTINGS };
  }

  const { id: _id, accent: _accent, ...settings } = row as SettingsRow & {
    accent?: unknown;
  };
  return settings;
}

/** Merge partial settings into the stored row, creating it if needed. */
export async function saveSettings(
  partial: Partial<LanguageSettings>,
): Promise<void> {
  const current = await getSettings();
  const merged: SettingsRow = {
    id: "app",
    ...current,
    ...partial,
  };

  await db.settings.put(merged);
}
