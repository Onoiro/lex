import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Add, setDebounceMs } from "@/pages/Add";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";
import { LimitError, MAX_TEXT_LENGTH } from "@/services/translateApi";

vi.mock("@/services/translateApi", () => ({
  translateWord: vi.fn(),
  LimitError: class LimitError extends Error {
    code: string;
    maxLength?: number;
    constructor(code: string, maxLength?: number) {
      super(code);
      this.code = code;
      this.maxLength = maxLength;
    }
  },
  MAX_TEXT_LENGTH: 500,
  getLanguages: vi.fn().mockResolvedValue([
    { code: "en", name: "English" },
    { code: "ru", name: "Russian" },
    { code: "de", name: "German" },
    { code: "fr", name: "French" },
    { code: "es", name: "Spanish" },
    { code: "zh", name: "Chinese" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "ar", name: "Arabic" },
    { code: "hi", name: "Hindi" },
    { code: "pt", name: "Portuguese" },
    { code: "it", name: "Italian" },
    { code: "tr", name: "Turkish" },
    { code: "nl", name: "Dutch" },
    { code: "pl", name: "Polish" },
    { code: "sv", name: "Swedish" },
    { code: "uk", name: "Ukrainian" },
    { code: "el", name: "Greek" },
    { code: "cs", name: "Czech" },
    { code: "ro", name: "Romanian" },
    { code: "hu", name: "Hungarian" },
    { code: "bg", name: "Bulgarian" },
    { code: "hr", name: "Croatian" },
    { code: "sk", name: "Slovak" },
    { code: "fi", name: "Finnish" },
    { code: "da", name: "Danish" },
    { code: "no", name: "Norwegian" },
    { code: "he", name: "Hebrew" },
    { code: "id", name: "Indonesian" },
    { code: "ms", name: "Malay" },
    { code: "th", name: "Thai" },
    { code: "vi", name: "Vietnamese" },
    { code: "ka", name: "Georgian" },
    { code: "hy", name: "Armenian" },
    { code: "az", name: "Azerbaijani" },
    { code: "auto", name: "Auto-detect" },
  ]),
}));

vi.mock("@/services/dictionaryApi", () => ({
  getExamples: vi.fn(),
}));

vi.mock("@/services/quotaApi", () => ({
  getQuota: vi.fn().mockResolvedValue({
    translate: { used: 63, limit: 500, remaining: 437 },
    tts: { used: 0, limit: 500, remaining: 500 },
  }),
}));

vi.mock("@/data/settingsRepository", () => ({
  getSettings: vi.fn().mockResolvedValue({
    source_lang: "auto",
    target_lang: "ru",
    locale: "en",
    lang_list: null,
    lang_list_updated_at: null,
  }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}));

import { translateWord } from "@/services/translateApi";
import { getExamples } from "@/services/dictionaryApi";
import { getQuota } from "@/services/quotaApi";
import { saveSettings } from "@/data/settingsRepository";

describe("Add", () => {
  beforeEach(async () => {
    setDebounceMs(0);
    setLocale("en");
    await db.words.clear();
    await db.settings.clear();
    await db.dailyStats.clear();
    vi.clearAllMocks();
  });

  it("renders heading", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByText("Translate")).toBeInTheDocument();
  });

  it("renders language bar with swap button", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByTitle("Swap languages")).toBeInTheDocument();
  });

  it("renders word input and translation textarea", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Translation")).toBeInTheDocument();
  });

  it("renders save button", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Save to dictionary" })).toBeInTheDocument();
  });

  it("auto-translates word via API after debounce", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });
  });

  it("saves word to dictionary", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await user.click(screen.getByRole("button", { name: "Save to dictionary" }));

    await waitFor(() => {
      expect(screen.getByText(/successfully added/)).toBeInTheDocument();
    });

    const count = await db.words.count();
    expect(count).toBe(1);
  });

  it("increments daily new_words counter after saving", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await user.click(screen.getByRole("button", { name: "Save to dictionary" }));

    await waitFor(async () => {
      const rows = await db.dailyStats.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].new_words).toBe(1);
    });
  });

  it("shows error on duplicate word", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    await db.words.add({
      word: "hello",
      translation: "привет",
      word_lang: "en",
      translation_lang: "ru",
      interval: 0,
      repetitions: 0,
      next_review: 0,
      last_direction: "en_ru",
      best_time: null,
      avg_time: null,
      know_count: 0,
      forgot_count: 0,
      hint_count: 0,
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await user.click(screen.getByRole("button", { name: "Save to dictionary" }));

    await waitFor(() => {
      expect(screen.getByText(/already in the dictionary/)).toBeInTheDocument();
    });
  });

  it("clears translation when word field is emptied", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await user.clear(screen.getByPlaceholderText("Enter a word or phrase"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("");
    });
  });

  it("auto-translates single character word", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "I",
      detectedLanguage: "ru",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "я");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("I");
    });
  });

  it("does not leave stale translation when word is deleted character by character", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    // Delete characters one by one, slower than debounce
    const input = screen.getByPlaceholderText("Enter a word or phrase");
    for (let i = 0; i < 5; i++) {
      await user.type(input, "{backspace}");
      await new Promise((r) => setTimeout(r, 10));
    }

    await waitFor(() => {
      expect(input).toHaveValue("");
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("");
    });
  });

  it("re-triggers auto-translate when word changes after manual translation edit", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    const wordInput = screen.getByPlaceholderText("Enter a word or phrase");
    const translationInput = screen.getByPlaceholderText("Translation");

    // First word auto-translates
    await user.type(wordInput, "hello");
    await waitFor(() => {
      expect(translationInput).toHaveValue("привет");
    });

    // User manually edits the translation
    await user.clear(translationInput);
    await user.type(translationInput, "custom translation");

    // User clears word and types a new one
    await user.clear(wordInput);
    await user.type(wordInput, "world");

    // Auto-translate should run again for the new word
    await waitFor(() => {
      expect(translationInput).toHaveValue("привет");
    });
  });

  it("shows warning when trying to swap with auto-detect source", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    // Click swap when source is auto-detect (default)
    await user.click(screen.getByTitle("Swap languages"));

    await waitFor(() => {
      expect(screen.getByText(/Cannot swap/)).toBeInTheDocument();
    });
  });

  it("shows network error on translation failure", async () => {
    vi.mocked(translateWord).mockRejectedValue(new Error("Network error"));

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  // --- Usage limits ---

  it("shows quota message and stops auto-translate when daily quota is exceeded", async () => {
    vi.mocked(translateWord).mockRejectedValue(
      new LimitError("daily_quota_exceeded"),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByText(/Daily translation limit reached/)).toBeInTheDocument();
    });

    const callsAfterQuota = vi.mocked(translateWord).mock.calls.length;

    // New word should NOT trigger another auto-translate (no 429 spam)
    await user.clear(screen.getByPlaceholderText("Enter a word or phrase"));
    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "world");

    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(translateWord).mock.calls.length).toBe(callsAfterQuota);
  });

  it("shows too-long warning and skips auto-translate for text over 500 chars", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    // Typing 501 chars fires 501 keystroke events — skip inter-key delays
    // and allow a generous timeout so slow CI runners don't flake
    const user = userEvent.setup({ delay: null });
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    const longText = "a".repeat(501);
    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), longText);

    await waitFor(() => {
      expect(screen.getByTestId("too-long-warning")).toBeInTheDocument();
    });

    // Auto-translate must not fire for the over-limit text itself
    // (intermediate keystrokes are shorter than the limit and may translate)
    await new Promise((r) => setTimeout(r, 50));
    const lastCall = vi.mocked(translateWord).mock.calls.at(-1);
    expect(lastCall?.[0].length ?? 0).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
  }, 15_000);

  it("does not show too-long warning for text within limit", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    expect(screen.queryByTestId("too-long-warning")).not.toBeInTheDocument();
  });

  it("renders note input field", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Association, hint, or mnemonic to help you remember")).toBeInTheDocument();
  });

  it("saves word with note and clears note after save", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await user.type(
      screen.getByPlaceholderText("Association, hint, or mnemonic to help you remember"),
      "my hint",
    );

    await user.click(screen.getByRole("button", { name: "Save to dictionary" }));

    await waitFor(() => {
      expect(screen.getByText(/successfully added/)).toBeInTheDocument();
    });

    const words = await db.words.toArray();
    expect(words).toHaveLength(1);
    expect(words[0].note).toBe("my hint");

    expect(screen.getByPlaceholderText("Association, hint, or mnemonic to help you remember")).toHaveValue("");
  });

  it("saves word without note when note is empty", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await user.click(screen.getByRole("button", { name: "Save to dictionary" }));

    await waitFor(() => {
      expect(screen.getByText(/successfully added/)).toBeInTheDocument();
    });

    const words = await db.words.toArray();
    expect(words).toHaveLength(1);
    expect(words[0].note).toBeUndefined();
  });

  it("renders language select dropdowns", async () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTitle("Source language")).toBeInTheDocument();
      expect(screen.getByTitle("Target language")).toBeInTheDocument();
    });
  });

  it("does not save settings when source language is changed", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTitle("Source language")).toBeInTheDocument();
    });

    const sourceSelect = screen.getByTitle("Source language") as HTMLSelectElement;
    expect(sourceSelect.value).toBe("auto");

    await user.selectOptions(sourceSelect, "en");

    await waitFor(() => {
      expect(sourceSelect.value).toBe("en");
    });

    // saveSettings should NOT be called for language changes on Add page
    expect(saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ source_lang: "en" }),
    );
  });

  it("does not save settings when target language is changed", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTitle("Target language")).toBeInTheDocument();
    });

    const targetSelect = screen.getByTitle("Target language") as HTMLSelectElement;
    expect(targetSelect.value).toBe("ru");

    await user.selectOptions(targetSelect, "en");

    await waitFor(() => {
      expect(targetSelect.value).toBe("en");
    });

    // saveSettings should NOT be called for language changes on Add page
    expect(saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ target_lang: "en" }),
    );
  });

  it("shows lang-changed banner when languages differ from global settings", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTitle("Source language")).toBeInTheDocument();
    });

    const sourceSelect = screen.getByTitle("Source language") as HTMLSelectElement;
    await user.selectOptions(sourceSelect, "en");

    await waitFor(() => {
      expect(screen.getByText(/Translation languages changed for this session/)).toBeInTheDocument();
    });
  });

  it("does not show lang-changed banner when languages match global settings", async () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTitle("Source language")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Translation languages changed for this session/)).not.toBeInTheDocument();
  });

  it("shows warning when source and target are the same", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTitle("Source language")).toBeInTheDocument();
    });

    const sourceSelect = screen.getByTitle("Source language") as HTMLSelectElement;
    const targetSelect = screen.getByTitle("Target language") as HTMLSelectElement;

    await user.selectOptions(sourceSelect, "en");
    await user.selectOptions(targetSelect, "en");

    await waitFor(() => {
      expect(screen.getByText(/Source and target languages are the same/)).toBeInTheDocument();
    });

    // saveSettings should NOT be called when same-lang warning is shown
    expect(saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ target_lang: "en" }),
    );
  });

  // --- Quota indicator ---

  it("shows quota indicator after loading quota", async () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("quota-indicator")).toBeInTheDocument();
    });
    expect(screen.getByTestId("quota-indicator")).toHaveTextContent(
      "Translate: 63/500",
    );
    expect(screen.getByTestId("quota-indicator")).toHaveTextContent(
      "Speech: 0/500",
    );
  });

  it("hides quota indicator when quota fetch fails", async () => {
    vi.mocked(getQuota).mockRejectedValue(new Error("offline"));

    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("quota-indicator")).not.toBeInTheDocument();

    // Restore the default mock so later tests see the indicator again
    vi.mocked(getQuota).mockResolvedValue({
      translate: { used: 63, limit: 500, remaining: 437 },
      tts: { used: 0, limit: 500, remaining: 500 },
    });
  });

  it("decrements translate quota after non-cached translation", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
      cached: false,
    });

    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("quota-indicator")).toBeInTheDocument();
    });

    // Single change event: exactly one auto-translate -> one decrement
    fireEvent.change(screen.getByPlaceholderText("Enter a word or phrase"), {
      target: { value: "hello" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("quota-indicator")).toHaveTextContent(
        "Translate: 68/500",
      );
    });
  });

  it("does not decrement translate quota on cached translation", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
      cached: true,
    });

    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("quota-indicator")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Enter a word or phrase"), {
      target: { value: "hello" },
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("quota-indicator")).toHaveTextContent(
      "Translate: 63/500",
    );
  });

  it("shows zero remaining translate quota on 429", async () => {
    vi.mocked(translateWord).mockRejectedValue(
      new LimitError("daily_quota_exceeded"),
    );

    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("quota-indicator")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Enter a word or phrase"), {
      target: { value: "hello" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("quota-indicator")).toHaveTextContent(
        "Translate: 500/500",
      );
    });
  });

  // --- Load examples into note field ---

  it("shows load examples button when word and translation are filled", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    expect(screen.getByTestId("load-examples-btn")).toBeInTheDocument();
  });

  it("does not show load examples button when word is empty", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("load-examples-btn")).not.toBeInTheDocument();
  });

  // --- Clear fields button ---

  it("does not show clear button when word is empty", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("clear-fields-btn")).not.toBeInTheDocument();
  });

  it("clears word, translation and note on clear button click", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    const noteField = screen.getByPlaceholderText("Association, hint, or mnemonic to help you remember");
    await user.type(noteField, "my note");

    await user.click(screen.getByTestId("clear-fields-btn"));

    expect(screen.getByPlaceholderText("Enter a word or phrase")).toHaveValue("");
    expect(screen.getByPlaceholderText("Translation")).toHaveValue("");
    expect(noteField).toHaveValue("");
    expect(screen.queryByTestId("clear-fields-btn")).not.toBeInTheDocument();
  });

  it("loads example into note field on button click", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });
    vi.mocked(getExamples).mockResolvedValue([
      { text: "Hello there.", translation: "Привет тебе." },
    ]);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await user.click(screen.getByTestId("load-examples-btn"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Association, hint, or mnemonic to help you remember")).toHaveValue(
        "Hello there. — Привет тебе.",
      );
    });
  });

  it("shows no examples message when API returns empty", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });
    vi.mocked(getExamples).mockResolvedValue([]);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    await user.click(screen.getByTestId("load-examples-btn"));

    await waitFor(() => {
      expect(screen.getByText("No examples found")).toBeInTheDocument();
    });
  });

  it("replaces existing note text with example", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });
    vi.mocked(getExamples).mockResolvedValue([
      { text: "Hello there.", translation: "Привет тебе." },
    ]);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter a word or phrase")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a word or phrase"), "hello");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Translation")).toHaveValue("привет");
    });

    const noteField = screen.getByPlaceholderText("Association, hint, or mnemonic to help you remember");
    await user.type(noteField, "existing note");

    await user.click(screen.getByTestId("load-examples-btn"));

    await waitFor(() => {
      expect(noteField).toHaveValue("Hello there. — Привет тебе.");
    });
  });
});
