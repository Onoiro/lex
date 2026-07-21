import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Review } from "@/pages/Review";
import { setLocale } from "@/i18n";
import { db } from "@/data/db";
import { addWord } from "@/data/wordRepository";

describe("Review", () => {
  beforeEach(async () => {
    setLocale("en");
    await db.words.clear();
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

    // Translation should not be visible
    expect(screen.queryByTestId("translation-text")).not.toBeInTheDocument();
    // But Show translation button should be visible
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

    // Translation should be visible immediately
    expect(screen.getByTestId("translation-text")).toBeInTheDocument();
    // Show translation button should NOT be visible
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
});