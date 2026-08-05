import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendFeedback } from "@/services/feedbackApi";

describe("feedbackApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: "sent" }),
      }),
    );

    const result = await sendFeedback("bug", "App crashes on startup", "user@example.com");
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns error on 429 rate limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: "Rate limit exceeded" }),
      }),
    );

    const result = await sendFeedback("bug", "App crashes on startup");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Rate limit exceeded");
  });

  it("returns error on 503 service not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: "Feedback service is not configured." }),
      }),
    );

    const result = await sendFeedback("idea", "Add dark mode please!");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Feedback service is not configured.");
  });

  it("returns error on 400 validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Message must be at least 10 characters." }),
      }),
    );

    const result = await sendFeedback("bug", "short");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Message must be at least 10 characters.");
  });

  it("returns error on 502 send failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ error: "Failed to send feedback." }),
      }),
    );

    const result = await sendFeedback("bug", "App crashes on startup");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to send feedback.");
  });

  it("returns network error on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await sendFeedback("bug", "App crashes on startup");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });

  it("sends correct request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "sent" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendFeedback("idea", "Add dark mode please!", "user@example.com");

    expect(mockFetch).toHaveBeenCalledWith(
      "/feedback",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "idea",
          message: "Add dark mode please!",
          contact: "user@example.com",
        }),
      }),
    );
  });

  it("sends empty contact when not provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "sent" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendFeedback("bug", "App crashes on startup");

    expect(mockFetch).toHaveBeenCalledWith(
      "/feedback",
      expect.objectContaining({
        body: JSON.stringify({
          category: "bug",
          message: "App crashes on startup",
          contact: "",
        }),
      }),
    );
  });
});
