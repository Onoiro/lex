import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLocale, setLocale, SUPPORTED_LOCALES } from "@/i18n";
import { getLanguageName, LANGUAGE_NAMES_EN, LANGUAGE_NAMES_RU } from "@/i18n/languages";
import { getSettings, saveSettings } from "@/data/settingsRepository";
import { getWordCount } from "@/data/wordRepository";
import { resetAllData } from "@/data/db";
import { getLanguages, DAILY_CHAR_LIMIT, MAX_TEXT_LENGTH } from "@/services/translateApi";
import { getQuota } from "@/services/quotaApi";
import type { QuotaInfo } from "@/services/quotaApi";
import { applyTheme } from "@/services/theme";
import { DEFAULT_LANGUAGE_SETTINGS, LANG_LIST_TTL_MS } from "@/types";
import type { Theme, Skin } from "@/types";
import type { LanguageInfo } from "@/services/translateApi";
import { version } from "../../package.json";
import { sendFeedback } from "@/services/feedbackApi";
import { Mascot } from "@/components/Mascot";

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
  const [feedbackCategory, setFeedbackCategory] = useState("bug");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [feedbackError, setFeedbackError] = useState("");
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

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

  // Load remaining quota for the live counters (hidden on failure)
  useEffect(() => {
    let cancelled = false;
    void getQuota()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {
        // Network error — only the static limits text is shown
      });
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

  const handleFeedback = async () => {
    setFeedbackStatus("sending");
    setFeedbackError("");
    const result = await sendFeedback(feedbackCategory, feedbackMessage, feedbackContact);
    if (result.success) {
      setFeedbackStatus("success");
      setFeedbackMessage("");
      setFeedbackContact("");
      setTimeout(() => setFeedbackStatus("idle"), 5000);
    } else {
      setFeedbackStatus("error");
      setFeedbackError(result.error ?? "");
      setTimeout(() => setFeedbackStatus("idle"), 5000);
    }
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
      <div className="page-hero">
        <hgroup>
          <h2 className="lex-mb-0">{t("settings.heading")}</h2>
        </hgroup>
        <Mascot emotion="sliders" size="hero" />
      </div>

      {saved && (
        <article className="lex-alert lex-alert--success">{t("settings.saved")}</article>
      )}

      <form onSubmit={handleSave}>
        <section className="lex-section">
          <h3>🌐 {t("settings.app_language")}</h3>
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

        <section className="lex-section">
          <h3>🌍 {t("settings.translate")}</h3>
          <p className="lex-hint">{t("settings.description")}</p>
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

          <label htmlFor="target_lang">
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
            <small className="lex-field-caption lex-field-caption--error">
              {sameLangWarning}
            </small>
          )}
        </section>

        <section className="lex-section">
          <h3>🔊 {t("settings.tts")}</h3>
          <label htmlFor="tts_enabled" className="lex-switch-label">
            <input
              type="checkbox"
              id="tts_enabled"
              role="switch"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
            />
            {t("settings.tts_review")}
          </label>
          <small className="lex-hint lex-mt-1">
            {t("settings.tts_description")}
          </small>
        </section>

        <section className="lex-section">
          <h3>🎨 {t("settings.theme")}</h3>
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

          <label htmlFor="skin">{t("settings.skin_choose")}</label>
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
          <div className="lex-swatches">
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
                className="lex-swatch"
                onClick={() => setSkin(s.value)}
                aria-label={t(`settings.skin_${s.value}`)}
                aria-pressed={skin === s.value}
                style={{ background: s.bg }}
              >
                <span className="lex-swatch-dot" style={{ background: s.fg }} />
              </button>
            ))}
          </div>
        </section>

        <button type="submit">{t("settings.save")}</button>
      </form>

      {resetDone && (
        <article className="lex-alert lex-alert--success">{t("settings.reset_done")}</article>
      )}

      <details className="lex-details">
        <summary>📊 {t("settings.limits")}</summary>
        <article>
          <div className="section-hero">
            <Mascot emotion="tired" size="inline" animated={false} />
            <div>
              {quota && (
                <p
                  data-testid="limits-today"
                  className="lex-muted"
                >
                  {t("settings.limits_today", {
                    translate_used: quota.translate.used,
                    translate_limit: quota.translate.limit,
                    tts_used: quota.tts.used,
                    tts_limit: quota.tts.limit,
                  })}
                </p>
              )}
              <p className="lex-muted">
                {t("settings.limits_intro")}
              </p>
            </div>
          </div>
          <ul className="lex-muted">
            <li>{t("settings.limits_length", { limit: MAX_TEXT_LENGTH })}</li>
            <li>{t("settings.limits_translate_quota", { limit: quota?.translate.limit ?? DAILY_CHAR_LIMIT })}</li>
            <li>{t("settings.limits_tts_quota", { limit: quota?.tts.limit ?? DAILY_CHAR_LIMIT })}</li>
            <li>{t("settings.limits_reset")}</li>
            <li>{t("settings.limits_cache")}</li>
          </ul>
          <p className="lex-muted lex-mb-0">
            {t("settings.limits_why")}
          </p>
        </article>
      </details>

      <details className="lex-details">
        <summary>💬 {t("settings.feedback")}</summary>
        <article>
          <div className="section-hero">
            <Mascot emotion="mail" size="inline" animated={false} />
            <p className="lex-muted lex-mb-0">
              {t("settings.feedback_description")}
            </p>
          </div>

          {feedbackStatus === "success" && (
            <article className="lex-alert lex-alert--success">
              {t("settings.feedback_success")}
            </article>
          )}

          {feedbackStatus === "error" && (
            <article className="lex-alert lex-alert--error">
              {t("settings.feedback_error")}
              {feedbackError && ` (${feedbackError})`}
            </article>
          )}

          <label htmlFor="feedback_category">{t("settings.feedback_category")}</label>
          <select
            id="feedback_category"
            value={feedbackCategory}
            onChange={(e) => setFeedbackCategory(e.target.value)}
            disabled={feedbackStatus === "sending"}
          >
            <option value="bug">{t("settings.feedback_bug")}</option>
            <option value="idea">{t("settings.feedback_idea")}</option>
            <option value="other">{t("settings.feedback_other")}</option>
          </select>

          <label htmlFor="feedback_message" className="lex-mt-1">
            {t("settings.feedback_message")}
          </label>
          <textarea
            id="feedback_message"
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            placeholder={t("settings.feedback_message_placeholder")}
            rows={4}
            disabled={feedbackStatus === "sending"}
            className="lex-resize-y"
          />
          {feedbackMessage.length > 0 && feedbackMessage.length < 10 && (
            <small className="lex-field-caption lex-field-caption--error">
              {t("settings.feedback_too_short")}
            </small>
          )}

          <label htmlFor="feedback_contact" className="lex-mt-1">
            {t("settings.feedback_contact")}
          </label>
          <input
            type="text"
            id="feedback_contact"
            value={feedbackContact}
            onChange={(e) => setFeedbackContact(e.target.value)}
            placeholder={t("settings.feedback_contact_placeholder")}
            disabled={feedbackStatus === "sending"}
          />

          <button
            type="button"
            onClick={() => void handleFeedback()}
            disabled={feedbackStatus === "sending" || feedbackMessage.trim().length < 10}
            className="lex-mt-1"
          >
            {feedbackStatus === "sending" ? t("settings.feedback_sending") : t("settings.feedback_send")}
          </button>
        </article>
      </details>

      <details className="lex-details lex-details--danger">
        <summary>⚠️ {t("settings.danger_zone")}</summary>
        <article>
          <h3>
            {t("settings.reset_title")}
          </h3>
          <p className="lex-muted">
            {t("settings.reset_description")}
          </p>
          <button
            type="button"
            className="contrast lex-btn--danger"
            onClick={() => void handleReset()}
          >
            {t("settings.reset_btn")}
          </button>
        </article>
      </details>

      <p className="lex-footer-note">{t("settings.app_version", { version })}</p>
      <nav className="lex-legal-nav">
        <Link to="/privacy">{t("settings.privacy_policy")}</Link>
        {" · "}
        <Link to="/terms">{t("settings.terms_of_use")}</Link>
      </nav>
    </>
  );
}