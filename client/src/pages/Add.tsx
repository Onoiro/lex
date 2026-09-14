import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useLocale } from "@/i18n";
import { getLanguageName, LANGUAGE_NAMES_EN, LANGUAGE_NAMES_RU } from "@/i18n/languages";
import { validateWord, validateTranslation, validateNote } from "@/domain/validators";
import { translateWord, getLanguages, LimitError, MAX_TEXT_LENGTH, DAILY_CHAR_LIMIT } from "@/services/translateApi";
import { getQuota } from "@/services/quotaApi";
import type { QuotaInfo } from "@/services/quotaApi";
import { getExamples } from "@/services/dictionaryApi";
import { synthesizeSpeech } from "@/services/ttsApi";
import { addWord, getWord, updateWordEntry } from "@/data/wordRepository";
import { incrementNewWords } from "@/data/dailyStatsRepository";
import { getSettings, saveSettings } from "@/data/settingsRepository";
import { Link } from "react-router-dom";
import { LANG_LIST_TTL_MS } from "@/types";
import type { LanguageInfo } from "@/services/translateApi";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import type { LanguageSettings } from "@/types";

type MessageType = "success" | "error_duplicate" | "error_translation" | "error_network" | "error_quota" | null;

// Allow tests to override debounce delay
let _debounceMs = 1000;
export function setDebounceMs(ms: number) {
  _debounceMs = ms;
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function Add() {
  const [t] = useLocale();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get("id") ? Number(searchParams.get("id")) : null;
  const [editing, setEditing] = useState(false);
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [note, setNote] = useState("");
  const [translating, setTranslating] = useState(false);
  const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);
  const [settings, setSettings] = useState<LanguageSettings | null>(null);
  const [userEditingTranslation, setUserEditingTranslation] = useState(false);
  const [langOptions, setLangOptions] = useState<LanguageInfo[]>([]);
  const [ttsLoading, setTtsLoading] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string>("");
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [examplesError, setExamplesError] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const prevWordRef = useRef("");

  const initialSettingsRef = useRef<LanguageSettings | null>(null);
  const wordRef = useRef<HTMLTextAreaElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((type: MessageType, text: string) => {
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    setMessage({ type, text });
    messageTimeoutRef.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, []);

  // Auto-resize textareas when their values change
  useEffect(() => {
    if (wordRef.current) autoResize(wordRef.current);
  }, [word]);

  useEffect(() => {
    if (translationRef.current) autoResize(translationRef.current);
  }, [translation]);

  useEffect(() => {
    if (noteRef.current) autoResize(noteRef.current);
  }, [note]);

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s);
      initialSettingsRef.current = s;
    });
  }, []);

  // Load remaining quota for the indicator (hidden on failure)
  useEffect(() => {
    let cancelled = false;
    void getQuota()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {
        // Network error — indicator stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load word for editing when ?id= is present
  useEffect(() => {
    if (editId === null) return;
    let cancelled = false;
    void (async () => {
      const w = await getWord(editId);
      if (cancelled || !w) return;
      setEditing(true);
      setWord(w.word);
      setTranslation(w.translation);
      setNote(w.note ?? "");
      setDetectedLang(w.word_lang);
      setUserEditingTranslation(true);
      // Auto-resize textareas after loading values
      requestAnimationFrame(() => {
        if (wordRef.current) autoResize(wordRef.current);
        if (translationRef.current) autoResize(translationRef.current);
        if (noteRef.current) autoResize(noteRef.current);
      });
    })();
    return () => { cancelled = true; };
  }, [editId]);

  // Load language list
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const settings = await getSettings();
      if (cancelled) return;

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

  // Auto-translate with debounce
  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    const trimmed = word.trim();

    if (!trimmed) {
      setTranslation("");
      setDetectedLang("");
      return;
    }

    if (!settings || userEditingTranslation) {
      return;
    }

    // Stop auto-translate for the rest of the day once quota is exceeded,
    // but remind the user why on every new attempt
    if (quotaExceeded) {
      showMessage("error_quota", t("add.error_quota", { limit: DAILY_CHAR_LIMIT }));
      return;
    }

    // Skip doomed requests: proxy rejects anything over 500 chars
    if (trimmed.length > MAX_TEXT_LENGTH) {
      return;
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      setTranslating(true);
      try {
        const result = await translateWord(word, settings.source_lang, settings.target_lang);
        setDetectedLang(result.detectedLanguage);
        if (result.translation) {
          setTranslation(result.translation);
        } else {
          showMessage("error_translation", t("add.error_translation"));
        }
        // Optimistic decrement: server cache hits don't consume quota
        if (result.cached === false) {
          decrementQuota("translate", word.trim().length);
        }
      } catch (e) {
        if (e instanceof LimitError && e.code === "daily_quota_exceeded") {
          setQuotaExceeded(true);
          setQuota((q) => (q ? { ...q, translate: { ...q.translate, remaining: 0, used: q.translate.limit } } : q));
          showMessage("error_quota", t("add.error_quota", { limit: DAILY_CHAR_LIMIT }));
        } else {
          showMessage("error_network", t("add.error_network") + ": " + (e as Error).message);
        }
      }
      setTranslating(false);
    }, _debounceMs);
  }, [word, settings, userEditingTranslation, quotaExceeded, showMessage, t]);

  // Optimistically decrement the remaining quota after a non-cached request
  const decrementQuota = (kind: "translate" | "tts", chars: number) => {
    setQuota((q) => {
      if (!q) return q;
      const level = q[kind];
      const remaining = Math.max(0, level.remaining - chars);
      return { ...q, [kind]: { ...level, remaining, used: level.limit - remaining } };
    });
  };

  // Zero out a quota level after a 429 daily_quota_exceeded
  const zeroQuota = (kind: "translate" | "tts") => {
    setQuota((q) => {
      if (!q) return q;
      const level = q[kind];
      return { ...q, [kind]: { ...level, remaining: 0, used: level.limit } };
    });
  };

  const handleTranslationEdit = () => {
    setUserEditingTranslation(true);
  };

  // Clear note and examples state when user starts a new word
  useEffect(() => {
    const trimmed = word.trim();
    if (trimmed !== prevWordRef.current) {
      if (trimmed === "") {
        setNote("");
        setExamplesError(false);
      }
      prevWordRef.current = trimmed;
    }
  }, [word]);

  const handleClear = () => {
    setWord("");
    setTranslation("");
    setNote("");
    setDetectedLang("");
    setUserEditingTranslation(false);
    setExamplesError(false);
    wordRef.current?.focus();
  };

  const handlePlayWord = async () => {
    const trimmed = word.trim();
    if (!trimmed || !settings) return;
    const lang = settings.source_lang === "auto" ? (detectedLang || "en") : settings.source_lang;
    setTtsLoading("word");
    const result = await synthesizeSpeech(trimmed, lang, (code) => {
      if (code === "daily_quota_exceeded") {
        zeroQuota("tts");
        showMessage("error_quota", t("add.error_quota_tts", { limit: DAILY_CHAR_LIMIT }));
      } else {
        showMessage("error_quota", t("add.error_too_long", { limit: MAX_TEXT_LENGTH }));
      }
    });
    if (result.played && !result.cached) {
      decrementQuota("tts", trimmed.length);
    }
    setTtsLoading(null);
  };

  const handlePlayTranslation = async () => {
    const trimmed = translation.trim();
    if (!trimmed || !settings) return;
    setTtsLoading("translation");
    const result = await synthesizeSpeech(trimmed, settings.target_lang, (code) => {
      if (code === "daily_quota_exceeded") {
        zeroQuota("tts");
        showMessage("error_quota", t("add.error_quota_tts", { limit: DAILY_CHAR_LIMIT }));
      } else {
        showMessage("error_quota", t("add.error_too_long", { limit: MAX_TEXT_LENGTH }));
      }
    });
    if (result.played && !result.cached) {
      decrementQuota("tts", trimmed.length);
    }
    setTtsLoading(null);
  };

  const handleLoadExamples = async () => {
    const trimmedWord = word.trim();
    if (!trimmedWord || !settings) return;

    const sourceLang = settings.source_lang === "auto" ? (detectedLang || "en") : settings.source_lang;
    const langPair = `${sourceLang}-${settings.target_lang}`;

    setExamplesLoading(true);
    setExamplesError(false);

    try {
      const examples = await getExamples(trimmedWord, langPair);
      if (examples.length > 0) {
        const first = examples[0];
        const exampleText = first.translation
          ? `${first.text} — ${first.translation}`
          : first.text;
        setNote(exampleText);
      } else {
        setExamplesError(true);
      }
    } catch {
      setExamplesError(true);
    }
    setExamplesLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const validWord = validateWord(word);
    const validTranslation = validateTranslation(translation);
    const validNote = validateNote(note);

    if (!validWord || !validTranslation || validNote === null) {
      return;
    }

    try {
      const lang = settings!.source_lang === "auto" ? (detectedLang || "en") : settings!.source_lang;

      if (editing && editId !== null) {
        await updateWordEntry(editId, validWord, validTranslation, lang, settings!.target_lang, validNote || undefined);
        showMessage("success", t("add.edit_success"));
        // Navigate back to dictionary after a short delay
        setTimeout(() => navigate("/dictionary"), 1200);
      } else {
        await addWord(validWord, validTranslation, lang, settings!.target_lang, validNote || undefined);
        void incrementNewWords().catch((e) => console.error("daily stats:", e));
        showMessage("success", t("add.success"));
        setWord("");
        setTranslation("");
        setNote("");
        setDetectedLang("");
        setUserEditingTranslation(false);
      }
    } catch (err) {
      if ((err as Error).message.includes("already exists")) {
        showMessage("error_duplicate", t("add.error_duplicate", { error_word: validWord }));
      } else {
        showMessage("error_network", (err as Error).message);
      }
    }
  };

  const handleSwapLanguages = async () => {
    if (!settings) return;
    if (settings.source_lang === "auto") {
      showMessage("error_translation", t("add.swap_auto_warning"));
      return;
    }
    const swapped = {
      source_lang: settings.target_lang,
      target_lang: settings.source_lang,
    };
    setSettings({ ...settings, ...swapped });
    // Clear translation when swapping languages
    setTranslation("");
    setDetectedLang("");
    setUserEditingTranslation(false);
  };

  const handleSourceLangChange = async (lang: string) => {
    if (!settings) return;
    if (lang === settings.target_lang && lang !== "auto") {
      showMessage("error_translation", t("settings.same_lang_warning"));
      return;
    }
    setSettings({ ...settings, source_lang: lang });
    setTranslation("");
    setDetectedLang("");
    setUserEditingTranslation(false);
  };

  const handleTargetLangChange = async (lang: string) => {
    if (!settings) return;
    if (lang === settings.source_lang && settings.source_lang !== "auto") {
      showMessage("error_translation", t("settings.same_lang_warning"));
      return;
    }
    setSettings({ ...settings, target_lang: lang });
    setTranslation("");
    setDetectedLang("");
    setUserEditingTranslation(false);
  };

  const locale = settings?.locale ?? "en";
  const names = locale === "ru" ? LANGUAGE_NAMES_RU : LANGUAGE_NAMES_EN;

  const wordTooLong = word.trim().length > MAX_TEXT_LENGTH;

  const langCodes = langOptions.length > 0
    ? langOptions.map((l) => l.code).sort((a, b) =>
        (names[a] ?? a).localeCompare(names[b] ?? b),
      )
    : Object.keys(names).sort((a, b) =>
        (names[a] ?? a).localeCompare(names[b] ?? b),
      );

  const langsChanged = settings != null && initialSettingsRef.current != null &&
    (settings.source_lang !== initialSettingsRef.current.source_lang ||
     settings.target_lang !== initialSettingsRef.current.target_lang);

  return (
    <>
      <OfflineIndicator />
      <hgroup style={{ textAlign: "center", marginBottom: "1.5rem", marginTop: "1rem" }}>
        <h1>{editing ? t("add.edit_heading") : t("add.heading")}</h1>
      </hgroup>

      {langsChanged && (
        <article
          style={{
            background: "var(--pico-ins-color)",
            color: "var(--pico-primary-inverse)",
            padding: "0.5rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
            textAlign: "center",
          }}
        >
          {t("add.lang_changed_hint")}{" "}
          <Link to="/settings" style={{ color: "var(--pico-primary-inverse)", fontWeight: 700, textDecoration: "underline" }}>
            {t("add.lang_changed_settings_link")}
          </Link>
        </article>
      )}

      {message && (
        <article
          style={{
            background:
              message.type === "success"
                ? "var(--pico-ins-color)"
                : "var(--pico-del-color)",
            color: "var(--pico-primary-inverse)",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          {message.text}
        </article>
      )}

      <article style={{ marginBottom: "3rem" }}>
        {/* Language bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            marginBottom: "1.25rem",
            fontSize: "0.95rem",
            color: "var(--pico-muted-color)",
          }}
        >
          <select
            value={settings?.source_lang ?? "auto"}
            onChange={(e) => handleSourceLangChange(e.target.value)}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem", cursor: "pointer" }}
            title={t("add.source_lang")}
          >
            <option value="auto">{t("add.auto_detect")}</option>
            {langCodes.map((code) => (
              <option key={code} value={code}>
                {getLanguageName(code, "short")}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary"
            style={{ padding: "0.25rem 0.35rem", fontSize: "0.85rem", cursor: "pointer", lineHeight: 1 }}
            onClick={handleSwapLanguages}
            title={t("add.swap_languages")}
          >
            ⇄
          </button>
          <select
            value={settings?.target_lang ?? "ru"}
            onChange={(e) => handleTargetLangChange(e.target.value)}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem", cursor: "pointer" }}
            title={t("add.target_lang")}
          >
            {langCodes.map((code) => (
              <option key={code} value={code}>
                {getLanguageName(code, "short")}
              </option>
            ))}
          </select>
        </div>

        {/* Daily quota indicator (hidden when quota is unknown) */}
        {quota && (
          <small
            data-testid="quota-indicator"
            style={{
              display: "block",
              textAlign: "center",
              marginBottom: "1rem",
              marginTop: "-0.75rem",
              color: "var(--pico-muted-color)",
              fontSize: "0.75rem",
            }}
          >
            {t("quota.translate_line", { used: quota.translate.used, limit: quota.translate.limit })}
            {" · "}
            {t("quota.tts_line", { used: quota.tts.used, limit: quota.tts.limit })}
          </small>
        )}

        <form onSubmit={handleSave} style={{ marginBottom: 0 }}>
          {/* Word input */}
          <div style={{ position: "relative" }}>
            <textarea
              ref={wordRef}
              id="word"
              value={word}
              onChange={(e) => {
                const newVal = e.target.value;
                if (userEditingTranslation && newVal.trim() !== word.trim()) {
                  setUserEditingTranslation(false);
                }
                setWord(newVal);
                autoResize(e.target);
              }}
              required
              placeholder={t("add.word_placeholder_new")}
              autoComplete="off"
              rows={2}
              style={{
                width: "100%",
                fontSize: "1.1rem",
                marginBottom: "1rem",
                boxSizing: "border-box",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflowY: "hidden",
                resize: "vertical",
                paddingRight: "2.5rem",
              }}
            />
            {word.trim() && (
              <button
                type="button"
                className="outline"
                data-testid="clear-fields-btn"
                onClick={handleClear}
                title={t("add.clear_fields")}
                aria-label={t("add.clear_fields")}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "0.4rem",
                  padding: "0.25rem 0.5rem",
                  fontSize: "1rem",
                  lineHeight: 1,
                  cursor: "pointer",
                  border: "none",
                  background: "none",
                  color: "var(--pico-muted-color)",
                }}
              >
                ✕
              </button>
            )}
            {word.trim() && (
              <button
                type="button"
                className="outline"
                data-testid="tts-word-btn"
                onClick={handlePlayWord}
                disabled={ttsLoading === "word"}
                title={t("tts.listen_word")}
                style={{
                  position: "absolute",
                  right: "2.2rem",
                  top: "0.4rem",
                  padding: "0.25rem 0.5rem",
                  fontSize: "1rem",
                  lineHeight: 1,
                  cursor: "pointer",
                  border: "none",
                  background: "none",
                  color: "var(--pico-primary)",
                }}
              >
                {ttsLoading === "word" ? "⏳" : "🔊"}
              </button>
            )}
          </div>

          {/* Translation output */}
          <div style={{ position: "relative" }}>
            <textarea
              ref={translationRef}
              id="translation"
              value={translation}
              onChange={(e) => {
                setTranslation(e.target.value);
                setUserEditingTranslation(true);
                autoResize(e.target);
              }}
              onFocus={handleTranslationEdit}
              required
              placeholder={t("add.translation_placeholder_new")}
              rows={2}
              style={{
                width: "100%",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                boxSizing: "border-box",
                overflowY: "hidden",
                resize: "vertical",
                marginBottom: "0.5rem",
                paddingRight: "2.5rem",
              }}
            />
            {translating && (
              <span
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "0.5rem",
                  fontSize: "0.85rem",
                  color: "var(--pico-muted-color)",
                }}
              >
                ⏳
              </span>
            )}
            {!translating && translation.trim() && (
              <button
                type="button"
                className="outline"
                data-testid="tts-translation-btn"
                onClick={handlePlayTranslation}
                disabled={ttsLoading === "translation"}
                title={t("tts.listen_translation")}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "0.4rem",
                  padding: "0.25rem 0.5rem",
                  fontSize: "1rem",
                  lineHeight: 1,
                  cursor: "pointer",
                  border: "none",
                  background: "none",
                  color: "var(--pico-primary)",
                }}
              >
                {ttsLoading === "translation" ? "⏳" : "🔊"}
              </button>
            )}
          </div>

          {/* Language codes */}
          {translation && (
            <small
              style={{
                display: "block",
                marginBottom: "1rem",
                color: "var(--pico-muted-color)",
                fontSize: "0.8rem",
              }}
            >
              {(settings?.source_lang === "auto" ? detectedLang : settings?.source_lang) ?? "auto"} → {settings?.target_lang}
            </small>
          )}

          {/* Length limit warning */}
          {wordTooLong && (
            <small
              data-testid="too-long-warning"
              style={{
                display: "block",
                marginBottom: "1rem",
                color: "var(--pico-del-color)",
                fontSize: "0.8rem",
              }}
            >
              {t("add.error_too_long", { limit: MAX_TEXT_LENGTH })}
            </small>
          )}

          {/* Note input */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <label htmlFor="note" style={{ fontSize: "0.85rem", color: "var(--pico-muted-color)" }}>
              {t("add.note_label")}
            </label>
            {word.trim() && translation.trim() && (
              <button
                type="button"
                className="outline"
                data-testid="load-examples-btn"
                onClick={handleLoadExamples}
                disabled={examplesLoading}
                style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", lineHeight: 1 }}
              >
                {examplesLoading ? t("add.loading_examples") : t("add.load_examples")}
              </button>
            )}
          </div>
          {examplesError && (
            <small style={{ display: "block", marginBottom: "0.25rem", color: "var(--pico-muted-color)", fontSize: "0.8rem" }}>
              {t("add.no_examples")}
            </small>
          )}
          <textarea
            id="note"
            ref={noteRef}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              autoResize(e.target);
            }}
            placeholder={t("add.note_placeholder")}
            rows={2}
            style={{
              width: "100%",
              fontSize: "0.95rem",
              marginBottom: "1rem",
              boxSizing: "border-box",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflowY: "hidden",
              resize: "vertical",
            }}
          />

          {/* Save button - sticky bottom */}
          <footer
            style={{
              position: "sticky",
              bottom: "0",
              marginTop: "auto",
              paddingTop: "1rem",
              background: "var(--pico-background-color)",
              borderTop: "1px solid var(--pico-muted-border-color)",
              display: "flex",
              gap: "0.5rem",
            }}
          >
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => navigate("/dictionary")}
                style={{ flex: 1 }}
              >
                {t("add.cancel_btn")}
              </button>
            )}
            <button type="submit" style={{ flex: 2 }}>
              {editing ? t("add.save_edit_btn") : t("add.save_btn")}
            </button>
          </footer>
        </form>
      </article>
    </>
  );
}