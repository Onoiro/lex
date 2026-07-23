import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/i18n";
import { getLanguageName } from "@/i18n/languages";
import { validateWord, validateTranslation } from "@/domain/validators";
import { translateWord } from "@/services/translateApi";
import { addWord } from "@/data/wordRepository";
import { getSettings, saveSettings } from "@/data/settingsRepository";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import type { LanguageSettings } from "@/types";

type MessageType = "success" | "error_duplicate" | "error_translation" | "error_network" | null;

// Allow tests to override debounce delay
let _debounceMs = 1000;
export function setDebounceMs(ms: number) {
  _debounceMs = ms;
}

export function Add() {
  const [t] = useLocale();
  const navigate = useNavigate();
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);
  const [settings, setSettings] = useState<LanguageSettings | null>(null);
  const [userEditingTranslation, setUserEditingTranslation] = useState(false);

  const wordRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  // Auto-translate with debounce
  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    const trimmed = word.trim();

    if (!trimmed) {
      setTranslation("");
      return;
    }

    if (!settings || userEditingTranslation) {
      return;
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      setTranslating(true);
      try {
        const result = await translateWord(word, settings.source_lang, settings.target_lang);
        if (result.translation) {
          setTranslation(result.translation);
        } else {
          showMessage("error_translation", t("add.error_translation"));
        }
      } catch (e) {
        showMessage("error_network", t("add.error_network") + ": " + (e as Error).message);
      }
      setTranslating(false);
    }, _debounceMs);
  }, [word, settings, userEditingTranslation, showMessage, t]);

  const handleTranslationEdit = () => {
    setUserEditingTranslation(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const validWord = validateWord(word);
    const validTranslation = validateTranslation(translation);

    if (!validWord || !validTranslation) {
      return;
    }

    try {
      await addWord(validWord, validTranslation);
      showMessage("success", t("add.success"));
      setWord("");
      setTranslation("");
      setUserEditingTranslation(false);
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
    const swapped = {
      source_lang: settings.target_lang,
      target_lang: settings.source_lang,
    };
    await saveSettings(swapped);
    setSettings({ ...settings, ...swapped });
    // Clear translation when swapping languages
    setTranslation("");
    setUserEditingTranslation(false);
  };

  const sourceLangName = !settings
    ? ""
    : settings.source_lang === "auto"
      ? t("add.auto_detect")
      : getLanguageName(settings.source_lang, "short");
  const targetLangName = settings?.target_lang
    ? getLanguageName(settings.target_lang, "short")
    : "";
  const sourceLangCode = settings?.source_lang === "auto" ? "auto" : settings?.source_lang;
  const targetLangCode = settings?.target_lang;

  return (
    <>
      <OfflineIndicator />
      <hgroup style={{ textAlign: "center", marginBottom: "1.5rem", marginTop: "1rem" }}>
        <h1>{t("add.heading")}</h1>
      </hgroup>

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
          <button
            type="button"
            className="secondary"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem", cursor: "pointer" }}
            onClick={() => navigate("/settings")}
          >
            {sourceLangName}
          </button>
          <button
            type="button"
            className="secondary"
            style={{ padding: "0.25rem 0.35rem", fontSize: "0.85rem", cursor: "pointer", lineHeight: 1 }}
            onClick={handleSwapLanguages}
            title={t("add.swap_languages")}
          >
            ⇄
          </button>
          <button
            type="button"
            className="secondary"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem", cursor: "pointer" }}
            onClick={() => navigate("/settings")}
          >
            {targetLangName}
          </button>
        </div>

        <form onSubmit={handleSave} style={{ marginBottom: 0 }}>
          {/* Word input */}
          <input
            ref={wordRef}
            type="text"
            id="word"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            required
            placeholder={t("add.word_placeholder_new")}
            autoComplete="off"
            style={{
              width: "100%",
              fontSize: "1.1rem",
              marginBottom: "1rem",
              boxSizing: "border-box",
            }}
          />

          {/* Translation output */}
          <div style={{ position: "relative" }}>
            <textarea
              id="translation"
              value={translation}
              onChange={(e) => {
                setTranslation(e.target.value);
                setUserEditingTranslation(true);
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
                overflowY: "auto",
                resize: "vertical",
                marginBottom: "0.5rem",
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
              {sourceLangCode} → {targetLangCode}
            </small>
          )}

          {/* Save button - sticky bottom */}
          <footer
            style={{
              position: "sticky",
              bottom: "0",
              marginTop: "auto",
              paddingTop: "1rem",
              background: "var(--pico-background-color)",
              borderTop: "1px solid var(--pico-muted-border-color)",
            }}
          >
            <button type="submit" style={{ width: "100%" }}>
              {t("add.save_btn")}
            </button>
          </footer>
        </form>
      </article>
    </>
  );
}