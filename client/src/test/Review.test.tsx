import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Review } from "@/pages/Review";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";
import { addWord, getAllWords } from "@/data/wordRepository";
import { emptyDailyStats } from "@/types/dailyStats";

describe("Review", () => {
  beforeEach(async () => {
    setLocale("en");
    await db.words.clear();
    await db.settings.clear();
    await db.dailyStats.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders empty state when no words", async () => {
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/🎉/)).toBeInTheDocument();
    });
  });

  it("renders start screen with queue count", async () => {
    await addWord("hello", "привет");
    await addWord("world", "мир");

    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Words in queue: 2")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
  });

  it("starts training and shows word", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      const wordEl = screen.getByTestId("word-text");
      expect(wordEl).toBeInTheDocument();
      expect(["hello", "привет"]).toContain(wordEl.textContent);
    });
  });

  it("shows know and forgot buttons during training", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /I don't remember/ })).toBeInTheDocument();
    });
  });

  it("shows next word button after answering", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();
    });
  });

  it("shows stop button during training", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop training" })).toBeInTheDocument();
    });
  });

  it("hides translation on Know but shows Show translation button", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();
    });

    expect(screen.queryByTestId("translation-text")).not.toBeInTheDocument();
    expect(screen.getByText("Show translation")).toBeInTheDocument();
  });

  it("shows translation immediately on Forgot", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I don't remember/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I don't remember/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();
    });

    expect(screen.getByTestId("translation-text")).toBeInTheDocument();
    expect(screen.queryByText("Show translation")).not.toBeInTheDocument();
  });

  it("pauses training on stop", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Stop training" }));

    await waitFor(() => {
      expect(screen.getByText("Training paused")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Resume training" })).toBeInTheDocument();
    });
  });

  it("shows hint button when word has note", async () => {
    await addWord("hello", "привет", "en", "ru", "my hint");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("hint-btn")).toBeInTheDocument();
    });
  });

  it("does not show hint button when word has no note", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("word-text")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("hint-btn")).not.toBeInTheDocument();
  });

  it("reveals note text when hint button is clicked", async () => {
    await addWord("hello", "привет", "en", "ru", "my hint");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("hint-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("hint-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("hint-text")).toBeInTheDocument();
    });

    expect(screen.getByTestId("hint-text")).toHaveTextContent("my hint");
  });

  it("hides hint button after answering", async () => {
    await addWord("hello", "привет", "en", "ru", "my hint");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("hint-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(() => {
      expect(screen.queryByTestId("hint-btn")).not.toBeInTheDocument();
    });
  });

  // --- Hint-assisted answers ---

  it("counts hint answer as correct but with reduced interval growth", async () => {
    await addWord("hello", "привет", "en", "ru", "my hint");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("hint-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("hint-btn"));
    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(async () => {
      const words = await getAllWords();
      expect(words[0].know_count).toBe(1);
      expect(words[0].hint_count).toBe(1);
      // repetitions must NOT advance on a hint-assisted answer
      expect(words[0].repetitions).toBe(0);
      // First correct answer would give interval 1; halved → max(1, 0) = 1
      expect(words[0].interval).toBe(1);
    });
  });

  it("does not set best_time on hint-assisted answer but records avg_time", async () => {
    await addWord("hello", "привет", "en", "ru", "my hint");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("hint-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("hint-btn"));
    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(async () => {
      const words = await getAllWords();
      expect(words[0].best_time).toBeNull();
      expect(words[0].avg_time).not.toBeNull();
    });
  });

  it("does not auto-answer after hint is opened (timer frozen)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await addWord("hello", "привет", "en", "ru", "my hint");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("hint-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("hint-btn"));

    // Advance past the 10s auto-answer timeout — nothing should happen
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });

    // Word is still unanswered, user can still answer
    expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(async () => {
      const words = await getAllWords();
      expect(words[0].know_count).toBe(1);
      expect(words[0].hint_count).toBe(1);
    });
  });

  // --- Click "Show translation" button after answering "Know" ---

  it("reveals translation when clicking Show translation after Know", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(() => {
      expect(screen.getByText("Show translation")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("translation-text")).not.toBeInTheDocument();

    await user.click(screen.getByText("Show translation"));

    await waitFor(() => {
      expect(screen.getByTestId("translation-text")).toBeInTheDocument();
    });
  });

  // --- Click "Next word" advances to a new word ---

  it("advances to next word when clicking Next word", async () => {
    await addWord("hello", "привет");
    await addWord("world", "мир");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Next word/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });

    expect(screen.getByTestId("word-text")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Next word/ })).not.toBeInTheDocument();
  });

  // --- Resume after pause ---

  it("resumes training after pause", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Stop training" }));

    await waitFor(() => {
      expect(screen.getByText("Training paused")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Resume training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });
  });

  // --- Timer-based tests using fake timers from the start ---

  it("auto-answers as Forgot after timeout", async () => {
    await addWord("hello", "привет");

    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Start training" }));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();

    // Advance past ANSWER_TIMEOUT (10s) — triggers auto-answer
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();
    expect(screen.getByTestId("translation-text")).toBeInTheDocument();
  });

  it("changes timer color to orange after 5 seconds", async () => {
    await addWord("hello", "привет");

    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Start training" }));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Timer element is the span with tabular-nums style
    const timerEl = screen.getByText(/\d+\.\d{2}s/);
    expect(timerEl.style.color).toBe("var(--pico-muted-color)");

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(timerEl.style.color).toBe("orange");
  });

  it("changes timer color to red after auto-answer timeout", async () => {
    await addWord("hello", "привет");

    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Start training" }));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const timerEl = screen.getByText(/\d+\.\d{2}s/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(timerEl.style.color).toBe("red");
  });

  it("auto-advances to next word after delay", async () => {
    await addWord("hello", "привет");
    await addWord("world", "мир");

    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Start training" }));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole("button", { name: /I know/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();

    // Advance past AUTO_NEXT_DELAY (3s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
  });

  it("pauses after 3 consecutive auto-answers", async () => {
    await addWord("hello", "привет");

    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Start training" }));

    // 1st auto-answer (10s timeout)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11000);
    });
    // Auto-next after 3s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // 2nd auto-answer
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    // Auto-next after 3s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // 3rd auto-answer — should trigger pause
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(screen.getByText("Training paused")).toBeInTheDocument();
  });

  // --- SRS data updated after answering ---

  it("updates word SRS data after answering Know", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();
    });

    const words = await getAllWords();
    expect(words).toHaveLength(1);
    expect(words[0].know_count).toBe(1);
    expect(words[0].repetitions).toBe(1);
    expect(words[0].interval).toBe(1);
  });

  it("updates word SRS data after answering Forgot", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I don't remember/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I don't remember/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();
    });

    const words = await getAllWords();
    expect(words).toHaveLength(1);
    expect(words[0].forgot_count).toBe(1);
    expect(words[0].repetitions).toBe(0);
    expect(words[0].interval).toBe(0);
  });

  // --- Word statistics display ---

  it("displays word statistics when available", async () => {
    await db.words.add({
      word: "hello",
      translation: "привет",
      word_lang: "en",
      translation_lang: "ru",
      interval: 0,
      repetitions: 0,
      next_review: 0,
      last_direction: "en_ru",
      best_time: 2.5,
      avg_time: 3.0,
      know_count: 4,
      forgot_count: 1,
      hint_count: 0,
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });

    expect(screen.getByText(/Known:/)).toBeInTheDocument();
    expect(screen.getByText(/Forgotten:/)).toBeInTheDocument();
  });

  // --- Multiple words cycle ---

  it("cycles through multiple words correctly", async () => {
    await addWord("apple", "яблоко");
    await addWord("banana", "банан");
    await addWord("cherry", "вишня");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    for (let i = 0; i < 3; i++) {
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /I know/ }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Next word/ })).toBeInTheDocument();
      });

      if (i < 2) {
        await user.click(screen.getByRole("button", { name: /Next word/ }));
      }
    }

    const words = await getAllWords();
    const totalKnow = words.reduce((sum, w) => sum + w.know_count, 0);
    expect(totalKnow).toBe(3);
  });

  // --- TTS toggle on Review page ---

  it("does not show TTS toggle when TTS is disabled in settings", async () => {
    await addWord("hello", "привет");
    await db.settings.put({ id: "app", tts_enabled: false, source_lang: "auto", target_lang: "ru", locale: "en", theme: "auto", skin: "default" });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("word-text")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("tts-toggle")).not.toBeInTheDocument();
  });

  it("shows TTS toggle when TTS is enabled in settings", async () => {
    await addWord("hello", "привет");
    await db.settings.put({ id: "app", tts_enabled: true, source_lang: "auto", target_lang: "ru", locale: "en", theme: "auto", skin: "default" });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("tts-toggle")).toBeInTheDocument();
    });
  });

  it("toggles TTS off and on", async () => {
    await addWord("hello", "привет");
    await db.settings.put({ id: "app", tts_enabled: true, source_lang: "auto", target_lang: "ru", locale: "en", theme: "auto", skin: "default" });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByTestId("tts-toggle")).toBeInTheDocument();
    });

    const toggle = screen.getByTestId("tts-toggle");
    expect(toggle.textContent).toBe("🔊");

    await user.click(toggle);
    expect(toggle.textContent).toBe("🔇");

    await user.click(toggle);
    expect(toggle.textContent).toBe("🔊");
  });

  // --- Daily stats ---

  it("shows today block on start screen when there is activity today", async () => {
    await addWord("hello", "привет");
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await db.dailyStats.put({ ...emptyDailyStats(key), reviewed: 10, known: 8, total_time: 25 });

    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("today-block")).toBeInTheDocument();
    });

    expect(screen.getByTestId("today-block")).toHaveTextContent("Reviewed: 10");
    expect(screen.getByTestId("today-block")).toHaveTextContent("80% known");
  });

  it("does not show today block when no activity today", async () => {
    await addWord("hello", "привет");

    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    expect(screen.queryByTestId("today-block")).not.toBeInTheDocument();
  });

  it("shows streak badge when streak is 2+ days", async () => {
    await addWord("hello", "привет");
    const now = new Date();
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const keyOf = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await db.dailyStats.bulkPut([
      { ...emptyDailyStats(keyOf(y)), reviewed: 3 },
      { ...emptyDailyStats(keyOf(now)), reviewed: 1 },
    ]);

    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("streak-badge")).toBeInTheDocument();
    });
    expect(screen.getByTestId("streak-badge")).toHaveTextContent("2-day streak");
  });

  it("shows and fills history table", async () => {
    await addWord("hello", "привет");
    await db.dailyStats.bulkPut([
      { ...emptyDailyStats("2026-08-28"), reviewed: 12, known: 9, new_words: 2 },
      { ...emptyDailyStats("2026-08-29"), reviewed: 5, known: 5 },
    ]);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("history-toggle")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("history-table")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("history-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("history-table")).toBeInTheDocument();
    });

    const table = screen.getByTestId("history-table");
    expect(table).toHaveTextContent("2026-08-29");
    expect(table).toHaveTextContent("2026-08-28");
    expect(table).toHaveTextContent("75%");
  });

  it("records answer into daily stats during training", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start training" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /I know/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I know/ }));

    await waitFor(async () => {
      const today = await db.dailyStats.toArray();
      expect(today).toHaveLength(1);
      expect(today[0].reviewed).toBe(1);
      expect(today[0].known).toBe(1);
    });
  });

  // --- "How it works?" help block ---

  it("shows and hides how-it-works block on start screen", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("how-it-works-toggle")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("how-it-works-block")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("how-it-works-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("how-it-works-block")).toBeInTheDocument();
    });

    expect(screen.getByTestId("how-it-works-block")).toHaveTextContent("How the app decides which word to show");
    expect(screen.getByTestId("how-it-works-block")).toHaveTextContent("almost knew it");

    await user.click(screen.getByTestId("how-it-works-toggle"));

    await waitFor(() => {
      expect(screen.queryByTestId("how-it-works-block")).not.toBeInTheDocument();
    });
  });
});