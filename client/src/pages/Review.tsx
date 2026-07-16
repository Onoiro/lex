import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "@/i18n";
import { getAllWords, updateWord } from "@/data/wordRepository";
import { applyReviewResult, pickWeightedWord, pickRandomDirection } from "@/domain/srs";
import { updateResponseTime, formatTime } from "@/domain/stats";
import type { Word, ReviewDirection } from "@/types";

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

export function Review() {
  const [t] = useLocale();
  const [phase, setPhase] = useState<Phase>("loading");
  const [currentView, setCurrentView] = useState<WordView | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [timerColor, setTimerColor] = useState("var(--pico-muted-color)");
  const [queueSize, setQueueSize] = useState(0);
  

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

  // Keep ref in sync with state
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    answeredRef.current = answered;
  }, [answered]);

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
    return clearAllTimers;
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
      handleAnswer(false, true);
    }, ANSWER_TIMEOUT * 1000);
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

    if (!next) {
      // No prefetched word, pick a new one
      const fresh = pickNextView();
      if (!fresh) {
        setPhase("done");
        return;
      }
      setCurrentView(fresh);
    } else {
      setCurrentView(next);
    }

    setAnswered(false);
    setShowTranslation(false);
    isAutoAnswerRef.current = false;
    startTimer();
  }, [pickNextView, startTimer]);

  const showPauseScreen = useCallback(() => {
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
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

      setShowTranslation(true);

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
    [stopTimer, submitResult, pickNextView, showPauseScreen, showNextWord, t],
  );

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
    startTimer();
  }, [pickNextView, startTimer]);

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
    setPhase("paused");
  }, [clearAllTimers]);

  const handleNext = useCallback(() => {
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    showNextWord();
  }, [showNextWord]);

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
      <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <h2>{t("review.paused")}</h2>
        <button
          type="button"
          onClick={handleResume}
          style={{ fontSize: "1.5rem", padding: "1rem 3rem", marginTop: "2rem" }}
        >
          {t("review.resume")}
        </button>
        <div style={{ marginTop: "1rem" }}>
          <Link to="/" role="button" className="outline secondary">
            {t("review.home")}
          </Link>
        </div>
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
    <article style={{ display: "flex", flexDirection: "column", minHeight: "40vh" }}>
      <header style={{ textAlign: "center", borderBottom: "none", paddingBottom: 0, position: "relative" }}>
        <span style={{ position: "absolute", left: 0, top: 0, color: "var(--pico-muted-color)", fontSize: "0.85rem" }}>
          {word.best_time !== null && word.avg_time !== null && (
            <>
              {t("review.stats_best", { time: formatTime(word.best_time) })}
              {" | "}
              {t("review.stats_avg", { time: formatTime(word.avg_time) })}
            </>
          )}
        </span>
        <span
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            color: timerColor,
            fontSize: "0.95rem",
            fontWeight: "bold",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatTime(elapsed)}
        </span>
        <span style={{ display: "block", marginTop: "0.5rem", color: "var(--pico-muted-color)", fontSize: "0.85rem" }}>
          {total > 0 && (
            <>
              {t("review.stats_known", { count: word.know_count })}
              {" | "}
              {t("review.stats_forgotten", { count: word.forgot_count })}
              {pct !== null && " " + t("review.stats_pct", { pct })}
            </>
          )}
        </span>
        <small style={{ display: "block", color: "var(--pico-muted-color)" }}>{t("review.remember")}</small>
        <h2 style={{ fontSize: "2.5rem", margin: "1rem 0" }}>{displayWord}</h2>
      </header>

      <footer style={{ marginTop: "auto" }}>
        {!answered ? (
          <div className="grid">
            <button
              className="outline secondary"
              onClick={() => handleAnswer(false, false)}
            >
              {t("review.btn_forgot")}
            </button>
            <button onClick={() => handleAnswer(true, false)}>
              {t("review.btn_know")}
            </button>
          </div>
        ) : (
          <button
            className="outline"
            style={{ width: "100%" }}
            onClick={handleNext}
          >
            {t("review.next_word")}
          </button>
        )}
      </footer>

      <div style={{ textAlign: "center", marginTop: "1.5rem", paddingBottom: "1rem" }}>
        <details open={showTranslation} style={{ width: "100%" }}>
          <summary
            style={{
              cursor: "pointer",
              color: "var(--pico-primary)",
              fontWeight: "bold",
              display: answered ? "none" : "block",
            }}
          >
            {t("review.show_translation")}
          </summary>
          <p style={{ fontSize: "2rem", fontWeight: "bold", margin: 0, color: "var(--pico-color)" }}>
            {displayTranslation}
          </p>
        </details>
      </div>

      <div style={{ textAlign: "center", paddingBottom: "1rem" }}>
        <button className="outline secondary" style={{ width: "100%" }} onClick={handleStop}>
          {t("review.stop")}
        </button>
      </div>
    </article>
  );
}