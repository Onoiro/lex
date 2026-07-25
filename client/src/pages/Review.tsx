import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "@/i18n";
import { getAllWords, updateWord } from "@/data/wordRepository";
import { getSettings } from "@/data/settingsRepository";
import { applyReviewResult, pickWeightedWord, pickRandomDirection } from "@/domain/srs";
import { updateResponseTime, formatTime } from "@/domain/stats";
import { synthesizeSpeech, stopTts } from "@/services/ttsApi";
import type { Word, ReviewDirection, LanguageSettings } from "@/types";

const ANSWER_TIMEOUT = 10;
const WARNING_THRESHOLD = 5;
const INACTIVITY_TIMEOUT = 30;
const MAX_CONSECUTIVE_AUTO = 3;
const AUTO_NEXT_DELAY = 3000;

type Phase = "loading" | "empty" | "start" | "training" | "paused" | "done";

interface WordView {
  word: Word;
  direction: ReviewDirection;
}

interface SessionStats {
  total: number;
  known: number;
  forgotten: number;
  times: number[];
}

export function Review() {
  const [t] = useLocale();
  const [phase, setPhase] = useState<Phase>("loading");
  const [currentView, setCurrentView] = useState<WordView | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [timerColor, setTimerColor] = useState("var(--pico-muted-color)");
  const [queueSize, setQueueSize] = useState(0);
  const [session, setSession] = useState<SessionStats>({
    total: 0,
    known: 0,
    forgotten: 0,
    times: [],
  });
  const [settings, setSettings] = useState<LanguageSettings | null>(null);

  // Refs for timers and state that shouldn't trigger re-renders
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoNextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveAutoRef = useRef(0);
  const isAutoAnswerRef = useRef(false);
  const allWordsRef = useRef<Word[]>([]);
  const nextViewRef = useRef<WordView | null>(null);
  const currentViewRef = useRef<WordView | null>(null);
  const answeredRef = useRef(false);
  const settingsRef = useRef<LanguageSettings | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Keep ref in sync with state
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    answeredRef.current = answered;
  }, [answered]);

  const handleAnswerRef = useRef<typeof handleAnswer>(() => {});

  const clearAllTimers = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    timerIntervalRef.current = null;
    answerTimeoutRef.current = null;
    inactivityTimeoutRef.current = null;
    autoNextTimeoutRef.current = null;
  }, []);

  const loadWords = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);

    const words = await getAllWords();
    allWordsRef.current = words;
    setQueueSize(words.length);

    if (words.length === 0) {
      setPhase("empty");
      return;
    }
    setPhase("start");
  }, []);

  useEffect(() => {
    void loadWords();
    return () => {
      clearAllTimers();
      stopTts();
    };
  }, [loadWords, clearAllTimers]);

  const pickNextView = useCallback((): WordView | null => {
    const words = allWordsRef.current;
    if (words.length === 0) return null;
    const picked = pickWeightedWord(words);
    if (!picked) return null;
    return { word: picked, direction: pickRandomDirection() };
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setElapsed(0);
    setTimerColor("var(--pico-muted-color)");

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      const e = (Date.now() - startTimeRef.current) / 1000;
      setElapsed(e);
      if (e >= WARNING_THRESHOLD) {
        setTimerColor("orange");
      }
    }, 100);

    if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
    answerTimeoutRef.current = setTimeout(() => {
      handleAnswerRef.current(false, true);
    }, ANSWER_TIMEOUT * 1000);
  }, []);

  const playTts = useCallback((text: string, lang: string) => {
    const s = settingsRef.current;
    if (!s?.tts_enabled) return;
    stopTts();
    void synthesizeSpeech(text, lang);
  }, []);

  const stopTimer = useCallback((): number => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
    timerIntervalRef.current = null;
    answerTimeoutRef.current = null;
    const e = (Date.now() - startTimeRef.current) / 1000;
    setElapsed(e);
    return Math.round(e * 100) / 100;
  }, []);

  const submitResult = useCallback(
    async (correct: boolean, elapsedSec: number) => {
      const view = currentViewRef.current;
      if (!view || !view.word.id) return;

      const srsUpdate = applyReviewResult(view.word, correct, view.direction);
      const timeUpdate = updateResponseTime(view.word, elapsedSec);
      await updateWord(view.word.id, { ...srsUpdate, ...timeUpdate });

      // Update the word in allWordsRef so next pick has fresh data
      const idx = allWordsRef.current.findIndex((w) => w.id === view.word.id);
      if (idx >= 0) {
        allWordsRef.current[idx] = { ...view.word, ...srsUpdate, ...timeUpdate };
      }

      // Check for new record
      if (correct && view.word.best_time !== null && elapsedSec < view.word.best_time) {
        setTimerColor("green");
      }
    },
    [],
  );

  const showNextWord = useCallback(() => {
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);

    const next = nextViewRef.current;
    nextViewRef.current = null;

    let view: WordView;

    if (!next) {
      // No prefetched word, pick a new one
      const fresh = pickNextView();
      if (!fresh) {
        setPhase("done");
        return;
      }
      view = fresh;
    } else {
      view = next;
    }

    setCurrentView(view);
    setAnswered(false);
    setShowTranslation(false);
    isAutoAnswerRef.current = false;
    startTimer();

    // Auto-play word audio if TTS is enabled
    const s = settingsRef.current;
    const displayWord = view.direction === "en_ru" ? view.word.word : view.word.translation;
    const wordLang = view.direction === "en_ru" ? (s?.source_lang ?? "en") : (s?.target_lang ?? "ru");
    playTts(displayWord, wordLang === "auto" ? "en" : wordLang);
  }, [pickNextView, startTimer, playTts]);

  const showPauseScreen = useCallback(() => {
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    stopTts();
    setPhase("paused");
  }, []);

  const handleAnswer = useCallback(
    (correct: boolean, isAuto: boolean) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      setAnswered(true);

      isAutoAnswerRef.current = isAuto;

      let elapsedSec: number;
      if (isAuto) {
        elapsedSec = ANSWER_TIMEOUT;
        setTimerColor("red");
        stopTimer();
      } else {
        elapsedSec = stopTimer();
      }

      if (isAuto) {
        consecutiveAutoRef.current++;
      } else {
        consecutiveAutoRef.current = 0;
      }

      setShowTranslation(!correct);

      // Auto-play translation audio if TTS is enabled and answer is wrong
      if (!correct) {
        const view = currentViewRef.current;
        const s = settingsRef.current;
        if (view) {
          const displayTranslation = view.direction === "en_ru" ? view.word.translation : view.word.word;
          const transLang = view.direction === "en_ru" ? (s?.target_lang ?? "ru") : (s?.source_lang ?? "en");
          playTts(displayTranslation, transLang === "auto" ? "en" : transLang);
        }
      }

      // Update session stats
      setSession((prev) => ({
        total: prev.total + 1,
        known: prev.known + (correct ? 1 : 0),
        forgotten: prev.forgotten + (correct ? 0 : 1),
        times: [...prev.times, elapsedSec],
      }));

      // Submit result and prefetch next word
      void submitResult(correct, elapsedSec).then(() => {
        const next = pickNextView();
        nextViewRef.current = next;

        if (!next) {
          return;
        }

        if (consecutiveAutoRef.current >= MAX_CONSECUTIVE_AUTO) {
          showPauseScreen();
          return;
        }

        // Auto-next after delay
        autoNextTimeoutRef.current = setTimeout(() => {
          showNextWord();
        }, AUTO_NEXT_DELAY);

        // Inactivity timeout
        inactivityTimeoutRef.current = setTimeout(() => {
          showPauseScreen();
        }, INACTIVITY_TIMEOUT * 1000);
      });
    },
    [stopTimer, submitResult, pickNextView, showPauseScreen, showNextWord, playTts, t],
  );

  // Keep handleAnswer ref in sync for timer callback
  handleAnswerRef.current = handleAnswer;

  const handleStart = useCallback(() => {
    const view = pickNextView();
    if (!view) {
      setPhase("empty");
      return;
    }
    setCurrentView(view);
    setPhase("training");
    setAnswered(false);
    setShowTranslation(false);
    consecutiveAutoRef.current = 0;
    setSession({ total: 0, known: 0, forgotten: 0, times: [] });
    startTimer();

    // Auto-play word audio if TTS is enabled
    const s = settingsRef.current;
    const displayWord = view.direction === "en_ru" ? view.word.word : view.word.translation;
    const wordLang = view.direction === "en_ru" ? (s?.source_lang ?? "en") : (s?.target_lang ?? "ru");
    playTts(displayWord, wordLang === "auto" ? "en" : wordLang);
  }, [pickNextView, startTimer, playTts]);

  const handleResume = useCallback(() => {
    setPhase("training");
    consecutiveAutoRef.current = 0;
    if (nextViewRef.current) {
      showNextWord();
    } else {
      startTimer();
    }
  }, [showNextWord, startTimer]);

  const handleStop = useCallback(() => {
    clearAllTimers();
    stopTts();
    setPhase("paused");
  }, [clearAllTimers]);

  const handleNext = useCallback(() => {
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    showNextWord();
  }, [showNextWord]);

  // --- Render helpers ---

  const avgTime = session.times.length > 0
    ? session.times.reduce((a, b) => a + b, 0) / session.times.length
    : null;

  const bestTime = session.times.length > 0
    ? Math.min(...session.times)
    : null;

  // --- Render ---

  if (phase === "loading") {
    return <div style={{ textAlign: "center", padding: "3rem" }}>...</div>;
  }

  if (phase === "empty") {
    return (
      <article style={{ textAlign: "center" }}>
        <p style={{ fontSize: "1.2rem" }}>{t("review.empty", { message: "" })}</p>
        <Link to="/" role="button" className="outline">{t("review.home")}</Link>
      </article>
    );
  }

  if (phase === "done") {
    return (
      <article style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ fontSize: "1.2rem" }}>{t("review.done", { message: "" })}</p>
        <Link to="/" role="button" className="outline">{t("review.home")}</Link>
      </article>
    );
  }

  if (phase === "start") {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <h2>{t("review.heading")}</h2>
        <p style={{ color: "var(--pico-muted-color)", marginBottom: "2rem" }}>
          {t("review.queue", { total_due: queueSize })}
        </p>
        <button
          type="button"
          onClick={handleStart}
          style={{ fontSize: "1.5rem", padding: "1rem 3rem" }}
        >
          {t("review.start")}
        </button>
      </div>
    );
  }

  if (phase === "paused") {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <h2>{t("review.paused")}</h2>

        {session.total > 0 && (
          <div style={{ marginTop: "2rem", color: "var(--pico-muted-color)", fontSize: "0.95rem", lineHeight: 1.8 }}>
            <div style={{ fontWeight: "bold", marginBottom: "0.5rem", color: "var(--pico-color)" }}>
              {t("review.session_total", { total: session.total })}
            </div>
            <div>
              {t("review.session_known", { count: session.known })}{" "}
              {t("review.session_forgotten", { count: session.forgotten })}
            </div>
            {session.total > 0 && (
              <div>
                {Math.round((session.known / session.total) * 100)}%
              </div>
            )}
            {avgTime !== null && (
              <div>{t("review.session_avg_time", { time: formatTime(avgTime) })}</div>
            )}
            {bestTime !== null && (
              <div>{t("review.session_best_time", { time: formatTime(bestTime) })}</div>
            )}
            <div style={{ marginTop: "0.5rem", opacity: 0.6 }}>
              {t("review.session_progress")}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleResume}
          style={{ fontSize: "1.5rem", padding: "1rem 3rem", marginTop: "2rem" }}
        >
          {t("review.resume")}
        </button>
      </div>
    );
  }

  // phase === "training"
  if (!currentView) return null;

  const { word, direction } = currentView;
  const displayWord = direction === "en_ru" ? word.word : word.translation;
  const displayTranslation = direction === "en_ru" ? word.translation : word.word;

  const total = word.know_count + word.forgot_count;
  const pct = total > 0 ? Math.round((word.know_count / total) * 100) : null;

  return (
    <article style={{ display: "flex", flexDirection: "column" }}>
      {/* Word area with timer */}
      <div style={{ textAlign: "center", padding: "2rem 1rem 1rem" }}>
        <div style={{ display: "inline-flex", alignItems: "flex-start", gap: "1rem" }}>
          <div style={{ textAlign: "center" }}>
            <small style={{ display: "block", color: "var(--pico-muted-color)" }}>
              {t("review.remember")}
            </small>
            <h2 data-testid="word-text" style={{ fontSize: "2.5rem", margin: "0.5rem 0" }}>
              {displayWord}
            </h2>
          </div>
          <span
            style={{
              color: timerColor,
              fontSize: "0.95rem",
              fontWeight: "bold",
              fontVariantNumeric: "tabular-nums",
              paddingTop: "0.25rem",
            }}
          >
            {formatTime(elapsed)}
          </span>
        </div>
      </div>

      {/* Buttons + translation + word stats */}
      <div style={{ textAlign: "center", padding: "0 1rem" }}>
        {!answered ? (
          <div className="grid" style={{ width: "100%", maxWidth: "400px", margin: "0 auto" }}>
            <button
              type="button"
              className="outline secondary"
              onClick={() => handleAnswer(false, false)}
            >
              {t("review.btn_forgot")}
            </button>
            <button type="button" onClick={() => handleAnswer(true, false)}>
              {t("review.btn_know")}
            </button>
          </div>
        ) : (
          <div style={{ width: "100%", maxWidth: "400px", margin: "0 auto" }}>
            <button
              type="button"
              className="outline"
              style={{ width: "100%" }}
              onClick={handleNext}
            >
              {t("review.next_word")}
            </button>
          </div>
        )}

        {/* Translation */}
        <div style={{ marginTop: "1.5rem" }}>
          {showTranslation ? (
            <p data-testid="translation-text" style={{ fontSize: "2rem", fontWeight: "bold", margin: 0, color: "var(--pico-color)" }}>
              {displayTranslation}
            </p>
          ) : answered ? (
            <button
              type="button"
              className="outline"
              style={{ width: "100%", maxWidth: "400px" }}
              onClick={() => {
                setShowTranslation(true);
                const s = settingsRef.current;
                const transLang = direction === "en_ru" ? (s?.target_lang ?? "ru") : (s?.source_lang ?? "en");
                playTts(displayTranslation, transLang === "auto" ? "en" : transLang);
              }}
            >
              {t("review.show_translation")}
            </button>
          ) : null}
        </div>

        {/* Word-level stats */}
        {total > 0 && (
          <div style={{ marginTop: "1rem", color: "var(--pico-muted-color)", fontSize: "0.85rem" }}>
            {t("review.stats_known", { count: word.know_count })}{" "}
            {t("review.stats_forgotten", { count: word.forgot_count })}
            {pct !== null && " " + t("review.stats_pct", { pct })}
          </div>
        )}
      </div>

      {/* Footer: stop button */}
      <footer style={{ textAlign: "center", paddingBottom: "1rem", marginTop: "1rem" }}>
        <button type="button" className="outline secondary" style={{ width: "100%", maxWidth: "400px" }} onClick={handleStop}>
          {t("review.stop")}
        </button>
      </footer>
    </article>
  );
}
