import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpdateScreen } from "@/components/UpdateScreen";
import { setLocale } from "@/i18n";

// Capacitor.getPlatform() returns "web" in jsdom by default.
// VITE_RUSTORE_URL / VITE_DOWNLOAD_URL are read at module load time,
// so URL visibility is tested via the default (empty) values.

describe("UpdateScreen", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("shows title, message and reload button", () => {
    render(<UpdateScreen />);

    expect(screen.getByText("New version available")).toBeInTheDocument();
    expect(
      screen.getByText(/outdated and no longer supported/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload the app" }),
    ).toBeInTheDocument();
  });

  it("hides store links when env URLs are empty", () => {
    render(<UpdateScreen />);

    expect(screen.queryByText("Update in RuStore")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Download the new version"),
    ).not.toBeInTheDocument();
  });

  it("reload button reloads the page", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, reload },
    });

    render(<UpdateScreen />);
    screen.getByRole("button", { name: "Reload the app" }).click();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});