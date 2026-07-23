import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Add, setDebounceMs } from "@/pages/Add";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";

vi.mock("@/services/translateApi", () => ({
  translateWord: vi.fn(),
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
import { saveSettings } from "@/data/settingsRepository";

describe("Add", () => {
  beforeEach(async () => {
    setDebounceMs(0);
    setLocale("en");
    await db.words.clear();
    await db.settings.clear();
    vi.clearAllMocks();
  });

  it("renders heading", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByText("New word")).toBeInTheDocument();
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

  it("shows error on duplicate word", async () => {
    vi.mocked(translateWord).mockResolvedValue({
      translation: "привет",
      detectedLanguage: "en",
    });

    await db.words.add({
      word: "hello",
      translation: "привет",
      interval: 0,
      repetitions: 0,
      next_review: 0,
      last_direction: "en_ru",
      best_time: null,
      avg_time: null,
      know_count: 0,
      forgot_count: 0,
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

  it("saves settings when source language is changed", async () => {
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
      expect(saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ source_lang: "en" }),
      );
    });
  });

  it("saves settings when target language is changed", async () => {
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
      expect(saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ target_lang: "en" }),
      );
    });
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
});
