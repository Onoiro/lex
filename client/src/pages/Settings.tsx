import { useState, useEffect } from "react";
import { useLocale, setLocale, SUPPORTED_LOCALES } from "@/i18n";
import { getLanguageName, LANGUAGE_NAMES_EN, LANGUAGE_NAMES_RU } from "@/i18n/languages";
import { getSettings, saveSettings } from "@/data/settingsRepository";
import { getWordCount } from "@/data/wordRepository";
import { resetAllData } from "@/data/db";
import { getLanguages } from "@/services/translateApi";
import { applyTheme } from "@/services/theme";
import { DEFAULT_LANGUAGE_SETTINGS, LANG_LIST_TTL_MS } from "@/types";
import type { Theme, Skin } from "@/types";
import type { LanguageInfo } from "@/services/translateApi";
import { version } from "../../package.json";

export function Settings() {
  const [t] = useLocale();
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("ru");
  const [locale, setLocaleState] = useState("en");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [theme, setTheme] = useState<Theme>("auto");
  const [skin, setSkin] = useState<Skin>("default");
  const [saved, setSaved] = useState(false);
  const [langOptions, setLangOptions] = useState<LanguageInfo[]>([]);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const settings = await getSettings();
      if (cancelled) return;

      setSourceLang(settings.source_lang);
      setTargetLang(settings.target_lang);
      setLocaleState(settings.locale);
      setTtsEnabled(settings.tts_enabled);
      setTheme(settings.theme);
      setSkin(settings.skin);

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
    await saveSettings({ source_lang: sourceLang, target_lang: targetLang, locale, tts_enabled: ttsEnabled, theme, skin });
    applyTheme(theme, skin);
    setLocale(locale);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = async () => {
    const count = await getWordCount();
    if (!confirm(t("settings.reset_confirm1", { count }))) return;
    if (!confirm(t("settings.reset_confirm2"))) return;

    await resetAllData();

    // Reset local state to defaults
    const defaults = DEFAULT_LANGUAGE_SETTINGS;
    setSourceLang(defaults.source_lang);
    setTargetLang(defaults.target_lang);
    setLocaleState(defaults.locale);
    setTtsEnabled(defaults.tts_enabled);
    setTheme(defaults.theme);
    setSkin(defaults.skin);
    applyTheme(defaults.theme, defaults.skin);
    setLocale(defaults.locale);

    setResetDone(true);
    setTimeout(() => setResetDone(false), 3000);
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
        <section style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>🌐 {t("settings.app_language")}</h3>
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
        </section>

        <section style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>🌍 {t("settings.translate")}</h3>
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
        </section>

        <section style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>🔊 {t("settings.tts")}</h3>
          <label htmlFor="tts_enabled">
            <input
              type="checkbox"
              id="tts_enabled"
              role="switch"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
              style={{ marginRight: "0.5rem" }}
            />
            {t("settings.tts_review")}
          </label>
          <small style={{ display: "block", marginTop: "0.5rem", color: "var(--pico-muted-color)" }}>
            {t("settings.tts_description")}
          </small>
        </section>

        <section style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>🎨 {t("settings.theme")}</h3>
          <label htmlFor="theme">{t("settings.theme_choose")}</label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            required
          >
            <option value="light">{t("settings.theme_light")}</option>
            <option value="dark">{t("settings.theme_dark")}</option>
            <option value="auto">{t("settings.theme_auto")}</option>
          </select>

          <label htmlFor="skin" style={{ marginTop: "1rem" }}>{t("settings.skin_choose")}</label>
          <select
            id="skin"
            value={skin}
            onChange={(e) => setSkin(e.target.value as Skin)}
            required
          >
            <option value="default">{t("settings.skin_default")}</option>
            <option value="ocean">{t("settings.skin_ocean")}</option>
            <option value="forest">{t("settings.skin_forest")}</option>
            <option value="sunset">{t("settings.skin_sunset")}</option>
            <option value="midnight">{t("settings.skin_midnight")}</option>
            <option value="rose">{t("settings.skin_rose")}</option>
            <option value="mono">{t("settings.skin_mono")}</option>
          </select>

          {/* Live preview swatches for each skin */}
          <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {([
              { value: "default", bg: "#fff", fg: "#1095c1" },
              { value: "ocean", bg: "#f0f7fa", fg: "#0ea5e9" },
              { value: "forest", bg: "#f2f7f0", fg: "#16a34a" },
              { value: "sunset", bg: "#fdf6f0", fg: "#f97316" },
              { value: "midnight", bg: "#f5f3fa", fg: "#7c3aed" },
              { value: "rose", bg: "#fdf5f7", fg: "#e11d48" },
              { value: "mono", bg: "#fff", fg: "#333" },
            ] as const).map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSkin(s.value)}
                aria-label={t(`settings.skin_${s.value}`)}
                style={{
                  width: "2.5rem",
                  height: "2.5rem",
                  borderRadius: "50%",
                  border: skin === s.value ? "3px solid var(--pico-primary)" : "1px solid var(--pico-muted-border-color)",
                  background: s.bg,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    width: "1rem",
                    height: "1rem",
                    borderRadius: "50%",
                    background: s.fg,
                    display: "block",
                  }}
                />
              </button>
            ))}
          </div>
        </section>

        <button type="submit">{t("settings.save")}</button>
      </form>

      {resetDone && (
        <article
          style={{
            background: "var(--pico-ins-color)",
            color: "var(--pico-primary-inverse)",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          {t("settings.reset_done")}
        </article>
      )}

      <details
        style={{
          marginTop: "2rem",
          borderColor: "var(--pico-del-color)",
        }}
      >
        <summary
          style={{
            color: "var(--pico-del-color)",
            fontWeight: 600,
          }}
        >
          ⚠️ {t("settings.danger_zone")}
        </summary>
        <article style={{ marginTop: "1rem" }}>
          <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            {t("settings.reset_title")}
          </h3>
          <p style={{ color: "var(--pico-muted-color)", marginBottom: "1rem" }}>
            {t("settings.reset_description")}
          </p>
          <button
            type="button"
            className="contrast"
            style={{
              background: "var(--pico-del-color)",
              borderColor: "var(--pico-del-color)",
            }}
            onClick={() => void handleReset()}
          >
            {t("settings.reset_btn")}
          </button>
        </article>
      </details>

      <p style={{ marginTop: "2rem", fontSize: "0.85rem", color: "var(--pico-muted-color)", textAlign: "center" }}>
        {t("settings.app_version", { version })}
      </p>
    </>
  );
}