import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Add, setDebounceMs } from "@/pages/Add";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";

vi.mock("@/services/translateApi", () => ({
  translateWord: vi.fn(),
}));

import { translateWord } from "@/services/translateApi";

describe("Add", () => {
  beforeEach(async () => {
    setDebounceMs(0);
    setLocale("en");
    await db.words.clear();
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
});
