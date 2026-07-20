import { useState, useRef, useEffect, useCallback } from "react";
import { useLocale } from "@/i18n";
import { getLanguageName } from "@/i18n/languages";
import { validateWord, validateTranslation } from "@/domain/validators";
import { translateWord } from "@/services/translateApi";
import { addWord } from "@/data/wordRepository";
import { getSettings } from "@/data/settingsRepository";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import type { LanguageSettings } from "@/types";

type MessageType = "success" | "error_duplicate" | "error_translation" | "error_network" | null;

export function Add() {
  const [t] = useLocale();
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [detectedLang, setDetectedLang] = useState("");
  const [translating, setTranslating] = useState(false);
  const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);
  const [settings, setSettings] = useState<LanguageSettings | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const wordRef = useRef<HTMLTextAreaElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((type: MessageType, text: string) => {
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    setMessage({ type, text });
    messageTimeoutRef.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const resizeTextarea = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px";
  }, []);

  useEffect(() => {
    resizeTextarea(wordRef.current);
  }, [word, resizeTextarea]);

  useEffect(() => {
    resizeTextarea(translationRef.current);
  }, [translation, resizeTextarea]);

  const handleTranslate = async () => {
    if (!word.trim() || !settings) return;

    setTranslating(true);
    try {
      const result = await translateWord(word, settings.source_lang, settings.target_lang);
      if (result.translation) {
        setTranslation(result.translation);
        if (result.detectedLanguage) {
          setDetectedLang(t("add.detected_lang", { lang: result.detectedLanguage }));
        } else {
          setDetectedLang("");
        }
      } else {
        showMessage("error_translation", t("add.error_translation"));
      }
    } catch (e) {
      showMessage("error_network", t("add.error_network") + ": " + (e as Error).message);
    }
    setTranslating(false);
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
      setDetectedLang("");
    } catch (err) {
      if ((err as Error).message.includes("already exists")) {
        showMessage("error_duplicate", t("add.error_duplicate", { error_word: validWord }));
      } else {
        showMessage("error_network", (err as Error).message);
      }
    }
  };

  const wordHint = settings?.source_lang === "auto"
    ? t("add.word_hint")
    : t("add.word_hint_lang", { lang: getLanguageName(settings?.source_lang ?? "auto") });

  return (
    <>
      <OfflineIndicator />
      <hgroup style={{ textAlign: "center", marginBottom: "2rem", marginTop: "1rem" }}>
        <h1>{t("add.heading")}</h1>
        <p>{t("add.subheading")}</p>
      </hgroup>

      {message && (
        <article
          style={{
            background:
              message.type === "success"
                ? "var(--pico-ins-color)"
                : "var(--pico-del-color)",
            color: "var(--pico-primary-inverse)",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          {message.text}
        </article>
      )}

      <article>
        <form onSubmit={handleSave} style={{ marginBottom: 0 }}>
          <label htmlFor="word">{t("add.word_label")}</label>
          <textarea
            id="word"
            ref={wordRef}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            required
            placeholder={t("add.word_placeholder")}
            rows={1}
            style={{ width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word", boxSizing: "border-box", overflowY: "auto", resize: "vertical" }}
          />
          <small style={{ color: "var(--pico-muted-color)" }}>{wordHint}</small>

          <button
            type="button"
            className="secondary"
            style={{ width: "100%", marginTop: "0.5rem" }}
            onClick={handleTranslate}
            disabled={translating || !isOnline}
          >
            {translating ? "⏳ ..." : t("add.translate_btn")}
          </button>

          <label htmlFor="translation" style={{ marginTop: "1rem" }}>{t("add.translation_label")}</label>
          <textarea
            id="translation"
            ref={translationRef}
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            required
            placeholder={t("add.translation_placeholder")}
            rows={1}
            style={{ width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word", boxSizing: "border-box", overflowY: "auto", resize: "vertical" }}
          />
          <small style={{ color: "var(--pico-muted-color)" }}>
            {t("add.translation_hint", { lang: getLanguageName(settings?.target_lang ?? "ru") })}
          </small>
          {detectedLang && (
            <output style={{ display: "block", marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--pico-muted-color)" }}>
              {detectedLang}
            </output>
          )}

          <footer style={{ marginTop: "2rem", paddingBottom: 0 }}>
            <button type="submit" style={{ width: "100%" }}>{t("add.save_btn")}</button>
          </footer>
        </form>
      </article>
    </>
  );
}