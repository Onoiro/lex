import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Dictionary } from "@/pages/Dictionary";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";
import { addWord } from "@/data/wordRepository";

describe("Dictionary", () => {
  beforeEach(async () => {
    setLocale("en");
    await db.words.clear();
  });

  it("renders empty state when no words", async () => {
    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Dictionary is empty 🍃")).toBeInTheDocument();
    });
  });

  it("renders word count in heading", async () => {
    await addWord("hello", "привет");
    await addWord("world", "мир");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Total words saved: 2")).toBeInTheDocument();
    });
  });

  it("renders table with words", async () => {
    await addWord("hello", "привет");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("hello")).toBeInTheDocument();
      expect(screen.getByText("привет")).toBeInTheDocument();
    });
  });

  it("filters words by search", async () => {
    await addWord("hello", "привет");
    await addWord("world", "мир");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("hello")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("🔍"), "hello");

    await waitFor(() => {
      expect(screen.getByText("hello")).toBeInTheDocument();
      expect(screen.queryByText("world")).not.toBeInTheDocument();
    });
  });

  it("deletes word on confirm", async () => {
    await addWord("hello", "привет");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("hello")).toBeInTheDocument();
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByTitle("Delete"));

    await waitFor(() => {
      expect(screen.queryByText("hello")).not.toBeInTheDocument();
    });
  });

  it("renders export and import buttons", async () => {
    await addWord("hello", "привет");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Export/)).toBeInTheDocument();
      expect(screen.getByText(/Import/)).toBeInTheDocument();
    });
  });
});
