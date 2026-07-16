import { useState, useEffect, useCallback } from "react";
import en from "./en.json";
import ru from "./ru.json";

export const SUPPORTED_LOCALES = ["en", "ru"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const translations: Record<string, Record<string, string>> = {
  en: en as Record<string, string>,
  ru: ru as Record<string, string>,
};

// Module-level locale, synced with settings
let currentLocale: Locale = "en";

const listeners = new Set<() => void>();

export function setLocale(locale: string): void {
  if (SUPPORTED_LOCALES.includes(locale as Locale)) {
    currentLocale = locale as Locale;
    listeners.forEach((fn) => fn());
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Translate a key to the current locale.
 * Falls back to English, then to the key itself.
 * Supports {param} interpolation.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = currentLocale;

  let value = translations[locale]?.[key];
  if (value === undefined) {
    value = translations.en?.[key];
  }
  if (value === undefined) {
    return key;
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }

  return value;
}

/**
 * React hook for locale-aware rendering.
 * Returns [t, locale] and re-renders on locale change.
 */
export function useLocale(): readonly [typeof t, Locale] {
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return [t, currentLocale] as const;
}

/**
 * Initialize locale from settings on app startup.
 */
export function useInitLocale(): void {
  const init = useCallback(async () => {
    const { getSettings } = await import("@/data/settingsRepository");
    const settings = await getSettings();
    setLocale(settings.locale);
  }, []);

  useEffect(() => {
    void init();
  }, [init]);
}
