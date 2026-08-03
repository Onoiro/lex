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

  it("renders note column header", async () => {
    await addWord("hello", "привет");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Note")).toBeInTheDocument();
    });
  });

  it("shows note text in table when word has note", async () => {
    await addWord("hello", "привет", "en", "my association");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("my association")).toBeInTheDocument();
    });
  });

  it("shows dash when word has no note", async () => {
    await addWord("hello", "привет");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("hello")).toBeInTheDocument();
    });

    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThan(0);
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

  it("toggles stats help block", async () => {
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

    const toggleBtn = screen.getByText(/\+ .*What do these numbers mean\?/);
    await user.click(toggleBtn);

    expect(screen.getByText("Known/No — how many times you remembered and forgot this word.")).toBeInTheDocument();

    await user.click(screen.getByText(/− .*What do these numbers mean\?/));
    expect(screen.queryByText("Known/No — how many times you remembered and forgot this word.")).not.toBeInTheDocument();
  });

  it("sorts by clicking table header (desktop)", async () => {
    await addWord("banana", "банан");
    await addWord("apple", "яблоко");

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("banana")).toBeInTheDocument();
    });

    // Click "Word" header to sort ascending
    await user.click(screen.getByRole("columnheader", { name: /Word/ }));

    const rows = screen.getAllByRole("row");
    // First data row (index 1, after header) should contain "apple"
    expect(rows[1].textContent).toContain("apple");
    expect(rows[2].textContent).toContain("banana");
  });

  it("persists sort state to localStorage", async () => {
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

    await user.click(screen.getByRole("columnheader", { name: /Rank/ }));

    const stored = localStorage.getItem("lex-dict-sort");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.sortBy).toBe("rank");
  });
});
