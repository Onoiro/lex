import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Add } from "@/pages/Add";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";

vi.mock("@/services/translateApi", () => ({
  translateWord: vi.fn(),
}));

import { translateWord } from "@/services/translateApi";

describe("Add", () => {
  beforeEach(async () => {
    setLocale("en");
    await db.words.clear();
    vi.clearAllMocks();
  });

  it("renders heading and subheading", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByText("New word")).toBeInTheDocument();
    expect(screen.getByText("Translate and save to your dictionary")).toBeInTheDocument();
  });

  it("renders word and translation inputs", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Foreign word")).toBeInTheDocument();
    expect(screen.getByLabelText("Translation")).toBeInTheDocument();
  });

  it("renders translate and save buttons", () => {
    render(
      <MemoryRouter>
        <Add />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /Translate/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to dictionary" })).toBeInTheDocument();
  });

  it("translates word via API and fills translation", async () => {
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
      expect(screen.getByLabelText("Foreign word")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Foreign word"), "hello");
    await user.click(screen.getByRole("button", { name: /Translate/ }));

    await waitFor(() => {
      expect(screen.getByLabelText("Translation")).toHaveValue("привет");
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
      expect(screen.getByLabelText("Foreign word")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Foreign word"), "hello");
    await user.click(screen.getByRole("button", { name: /Translate/ }));

    await waitFor(() => {
      expect(screen.getByLabelText("Translation")).toHaveValue("привет");
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
      expect(screen.getByLabelText("Foreign word")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Foreign word"), "hello");
    await user.click(screen.getByRole("button", { name: /Translate/ }));

    await waitFor(() => {
      expect(screen.getByLabelText("Translation")).toHaveValue("привет");
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
      expect(screen.getByLabelText("Foreign word")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Foreign word"), "hello");
    await user.click(screen.getByRole("button", { name: /Translate/ }));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });
});
