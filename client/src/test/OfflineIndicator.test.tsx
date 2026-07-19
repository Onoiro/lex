import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineIndicator } from "@/components/OfflineIndicator";

describe("OfflineIndicator", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("renders nothing when online", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("renders warning when offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    render(<OfflineIndicator />);
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });

  it("responds to online event", () => {
    vi.stubGlobal("navigator", { onLine: false });
    render(<OfflineIndicator />);
    expect(screen.getByText(/Offline/)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument();
  });

  it("responds to offline event", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });
});