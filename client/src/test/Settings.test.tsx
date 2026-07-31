import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Settings } from "@/pages/Settings";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";
import { addWord } from "@/data/wordRepository";

vi.mock("@/services/translateApi", () => ({
  getLanguages: vi.fn().mockRejectedValue(new Error("offline")),
}));

describe("Settings", () => {
  beforeEach(async () => {
    setLocale("en");
    await db.words.clear();
    await db.settings.clear();
  });

  it("renders heading and description", async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    expect(screen.getByText("Language settings")).toBeInTheDocument();
    expect(screen.getByText(/By default/)).toBeInTheDocument();
  });

  it("loads settings from storage", async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Source language")).toHaveValue("auto");
      expect(screen.getByLabelText(/Target language/)).toHaveValue("ru");
    });
  });

  it("shows save button", async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("shows confirmation after save", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Source language")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Language settings updated.")).toBeInTheDocument();
    });
  });

  it("falls back to static language list when proxy is unavailable", async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const sourceSelect = screen.getByLabelText("Source language");
      const options = sourceSelect.querySelectorAll("option");
      expect(options.length).toBeGreaterThan(10);
    });
  });

  it("shows app version", async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Version/)).toBeInTheDocument();
    });
  });

  describe("reset all data", () => {
    it("renders danger zone section", async () => {
      render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Danger zone/)).toBeInTheDocument();
      });
    });

    it("does not reset when user cancels first confirm", async () => {
      const user = userEvent.setup();
      await addWord("hello", "привет");

      vi.spyOn(window, "confirm").mockReturnValue(false);

      render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Danger zone/)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Reset everything/ }));

      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("All data has been reset.")).not.toBeInTheDocument();

      const { getWordCount } = await import("@/data/wordRepository");
      expect(await getWordCount()).toBe(1);
    });

    it("does not reset when user cancels second confirm", async () => {
      const user = userEvent.setup();
      await addWord("hello", "привет");

      vi.spyOn(window, "confirm")
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Danger zone/)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Reset everything/ }));

      expect(window.confirm).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("All data has been reset.")).not.toBeInTheDocument();

      const { getWordCount } = await import("@/data/wordRepository");
      expect(await getWordCount()).toBe(1);
    });

    it("resets all data when user confirms both prompts", async () => {
      const user = userEvent.setup();
      await addWord("hello", "привет");
      await addWord("world", "мир");

      vi.spyOn(window, "confirm").mockReturnValue(true);

      render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Danger zone/)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Reset everything/ }));

      await waitFor(() => {
        expect(screen.getByText("All data has been reset.")).toBeInTheDocument();
      });

      const { getWordCount } = await import("@/data/wordRepository");
      expect(await getWordCount()).toBe(0);
    });
  });
});
