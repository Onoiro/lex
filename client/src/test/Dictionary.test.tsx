import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Dictionary } from "@/pages/Dictionary";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";
import { addWord, getWordCount } from "@/data/wordRepository";

describe("Dictionary", () => {
  beforeEach(async () => {
    setLocale("en");
    localStorage.removeItem("lex-dict-sort");
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

    // Empty-state mascot in the heading, empty state below
    expect(screen.getAllByTestId("mascot")[0]).toHaveAttribute("src", "/mascot/reading.webp");
    expect(screen.getAllByTestId("mascot")[1]).toHaveAttribute("src", "/mascot/empty.webp");
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

    // Reading mascot in the heading even with words present
    expect(screen.getByTestId("mascot")).toHaveAttribute("src", "/mascot/reading.webp");
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
    await addWord("hello", "привет", "en", "ru", "my association");

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

  it("shows context description for current sort option", async () => {
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

    // Default sort is date_added desc — should show description
    expect(
      screen.getByText("Words in the order they were added to the dictionary (newest first)."),
    ).toBeInTheDocument();

    // Change to "Word" sort
    const select = screen.getByDisplayValue("Date added");
    await user.selectOptions(select, "word");

    expect(
      screen.getByText("Alphabetical order (A to Z)."),
    ).toBeInTheDocument();
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

  it("rejects oversized import file without reading it", async () => {
    await addWord("hello", "привет");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Import/)).toBeInTheDocument();
    });

    // Duck-typed file: oversized, reading must never happen
    const giantFile = {
      size: 11 * 1024 * 1024,
      text: async () => {
        throw new Error("should not read oversized file");
      },
    };
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [giantFile] } });

    await waitFor(() => {
      expect(screen.getByText("File is too large (max 10 MB).")).toBeInTheDocument();
    });
    // Nothing was imported
    expect(await getWordCount()).toBe(1);
  });

  it("rejects import with too many entries", async () => {
    await addWord("hello", "привет");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Import/)).toBeInTheDocument();
    });

    const entries = Array.from({ length: 10_001 }, (_, i) => ({
      word: `word${i}`,
      translation: `перевод${i}`,
    }));
    // Duck-typed file: jsdom File has no .text()
    const file = {
      size: JSON.stringify(entries).length,
      text: async () => JSON.stringify(entries),
    };
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Too many entries (max 10000).")).toBeInTheDocument();
    });
    // Nothing was imported
    expect(await getWordCount()).toBe(1);
  });

  it("shows invalid count in import success message", async () => {
    await addWord("hello", "привет");

    render(
      <MemoryRouter>
        <Dictionary />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Import/)).toBeInTheDocument();
    });

    // 2 valid new words, 1 duplicate of existing, 3 invalid entries
    const entries = [
      { word: "world", translation: "мир" },
      { word: "test", translation: "тест" },
      { word: "hello", translation: "дубль" },
      { word: "", translation: "пустое слово" },
      { word: "bad!", translation: "мусорные символы" },
      "not an object",
    ];
    // Duck-typed file: jsdom File has no .text()
    const file = {
      size: JSON.stringify(entries).length,
      text: async () => JSON.stringify(entries),
    };
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText("Imported 2 words, skipped duplicates: 1, invalid: 3."),
      ).toBeInTheDocument();
    });
    expect(await getWordCount()).toBe(3);
  });
});
