import { useState, useEffect } from "react";
import { useLocale, setLocale, SUPPORTED_LOCALES } from "@/i18n";
import { getLanguageName, LANGUAGE_NAMES_EN, LANGUAGE_NAMES_RU } from "@/i18n/languages";
import { getSettings, saveSettings } from "@/data/settingsRepository";
import { getLanguages } from "@/services/translateApi";
import { LANG_LIST_TTL_MS } from "@/types";
import type { LanguageInfo } from "@/services/translateApi";

export function Settings() {
  const [t] = useLocale();
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("ru");
  const [locale, setLocaleState] = useState("en");
  const [saved, setSaved] = useState(false);
  const [langOptions, setLangOptions] = useState<LanguageInfo[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const settings = await getSettings();
      if (cancelled) return;

      setSourceLang(settings.source_lang);
      setTargetLang(settings.target_lang);
      setLocaleState(settings.locale);

      // Try cached list first
      const now = Date.now();
      if (
        settings.lang_list != null &&
        settings.lang_list_updated_at != null &&
        now - settings.lang_list_updated_at < LANG_LIST_TTL_MS
      ) {
        const parsed: LanguageInfo[] = JSON.parse(settings.lang_list);
        if (!cancelled) setLangOptions(parsed);
        return;
      }

      // If stale but cached, show it while fetching
      if (settings.lang_list != null) {
        const parsed: LanguageInfo[] = JSON.parse(settings.lang_list);
        if (!cancelled) setLangOptions(parsed);
      }

      try {
        const langs = await getLanguages();
        if (!cancelled) {
          setLangOptions(langs);
          await saveSettings({
            lang_list: JSON.stringify(langs),
            lang_list_updated_at: now,
          });
        }
      } catch {
        // Fallback to static dict if nothing cached
        if (!cancelled && settings.lang_list == null) {
          setLangOptions(
            Object.entries(LANGUAGE_NAMES_EN).map(([code, name]) => ({ code, name })),
          );
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const sameLangWarning =
    sourceLang !== "auto" && sourceLang === targetLang
      ? t("settings.same_lang_warning")
      : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({ source_lang: sourceLang, target_lang: targetLang, locale });
    setLocale(locale);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const names = locale === "ru" ? LANGUAGE_NAMES_RU : LANGUAGE_NAMES_EN;
  const langCodes = langOptions.length > 0
    ? langOptions.map((l) => l.code).sort((a, b) =>
        (names[a] ?? a).localeCompare(names[b] ?? b),
      )
    : Object.keys(LANGUAGE_NAMES_EN).sort((a, b) =>
        (names[a] ?? a).localeCompare(names[b] ?? b),
      );

  return (
    <>
      <h2>{t("settings.heading")}</h2>
      <p>{t("settings.description")}</p>

      {saved && (
        <article
          style={{
            background: "var(--pico-ins-color)",
            color: "var(--pico-primary-inverse)",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          {t("settings.lang_updated")}
        </article>
      )}

      <form onSubmit={handleSave}>
        <fieldset>
          <legend>{t("settings.app_language")}</legend>
          <label htmlFor="locale">{t("settings.choose_app_language")}</label>
          <select
            id="locale"
            value={locale}
            onChange={(e) => setLocaleState(e.target.value)}
            required
          >
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>
                {getLanguageName(code)}
              </option>
            ))}
          </select>
        </fieldset>

        <fieldset>
          <legend>{t("settings.translate")}</legend>
          <label htmlFor="source_lang">{t("settings.source_lang")}</label>
          <select
            id="source_lang"
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            required
          >
            <option value="auto">{t("settings.auto_detect")}</option>
            {langCodes.map((code) => (
              <option key={code} value={code}>
                {getLanguageName(code)}
              </option>
            ))}
          </select>

          <label htmlFor="target_lang" style={{ marginTop: "1rem" }}>
            {t("settings.target_lang")}
          </label>
          <select
            id="target_lang"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            required
          >
            {langCodes.map((code) => (
              <option key={code} value={code}>
                {getLanguageName(code)}
              </option>
            ))}
          </select>

          {sameLangWarning && (
            <small style={{ color: "var(--pico-del-color)", display: "block", marginTop: "0.5rem" }}>
              {sameLangWarning}
            </small>
          )}
        </fieldset>

        <button type="submit">{t("settings.save")}</button>
      </form>
    </>
  );
}