import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Home } from "@/pages/Home";
import { setLocale } from "@/i18n";

describe("Home", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("renders title and subtitle", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByText("Lex — Translator and Vocabulary Trainer")).toBeInTheDocument();
    expect(screen.getByText("Your personal translator and vocabulary trainer.")).toBeInTheDocument();
  });

  it("renders translate card with link to /add", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByText("🌍 Translator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Translate a word" })).toHaveAttribute("href", "/add");
  });

  it("renders review card with link to /review", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByText("🧠 Training")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start review" })).toHaveAttribute("href", "/review");
  });

  it("renders in Russian", () => {
    setLocale("ru");

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByText("🌍 Переводчик")).toBeInTheDocument();
    expect(screen.getByText("🧠 Тренировка")).toBeInTheDocument();
  });
});
