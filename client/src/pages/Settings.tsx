import { useState, useEffect } from "react";
import { useLocale, setLocale, SUPPORTED_LOCALES } from "@/i18n";
import { getLanguageName, LANGUAGE_NAMES_EN } from "@/i18n/languages";
import { getSettings, saveSettings } from "@/data/settingsRepository";
import { getLanguages } from "@/services/translateApi";
import type { LanguageInfo } from "@/services/translateApi";

export function Settings() {
  const [t] = useLocale();
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("ru");
  const [locale, setLocaleState] = useState("en");
  const [saved, setSaved] = useState(false);
  const [langOptions, setLangOptions] = useState<LanguageInfo[]>([]);

  useEffect(() => {
    void getSettings().then((s) => {
      setSourceLang(s.source_lang);
      setTargetLang(s.target_lang);
      setLocaleState(s.locale);
    });

    // Try to load languages from proxy, fall back to static dict
    getLanguages()
      .then(setLangOptions)
      .catch(() => {
        // Fallback: use static LANGUAGE_NAMES_EN
        setLangOptions(
          Object.entries(LANGUAGE_NAMES_EN).map(([code, name]) => ({ code, name })),
        );
      });
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

  const langCodes = langOptions.length > 0
    ? langOptions.map((l) => l.code).sort()
    : Object.keys(LANGUAGE_NAMES_EN).sort();

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