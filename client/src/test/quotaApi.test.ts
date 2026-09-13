import { describe, it, expect, vi, beforeEach } from "vitest";
import { getQuota } from "@/services/quotaApi";
import {
  isUpdateRequired,
  onUpdateRequired,
} from "@/services/updateGate";

describe("quotaApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns quota levels on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            translate: { used: 63, limit: 500, remaining: 437 },
            tts: { used: 0, limit: 500, remaining: 500 },
          }),
      }),
    );

    const quota = await getQuota();
    expect(quota.translate).toEqual({ used: 63, limit: 500, remaining: 437 });
    expect(quota.tts).toEqual({ used: 0, limit: 500, remaining: 500 });
  });

  it("sends proxy headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          translate: { used: 0, limit: 500, remaining: 500 },
          tts: { used: 0, limit: 500, remaining: 500 },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getQuota();

    expect(mockFetch).toHaveBeenCalledWith(
      "/quota",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    await expect(getQuota()).rejects.toThrow("HTTP 503");
  });

  it("notifies update gate on 426 update_required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 426,
        json: () => Promise.resolve({ error: "update_required" }),
      }),
    );

    let notified = false;
    const unsub = onUpdateRequired(() => {
      notified = true;
    });

    await expect(getQuota()).rejects.toThrow("HTTP 426");
    expect(notified).toBe(true);
    expect(isUpdateRequired()).toBe(true);
    unsub();
  });

  it("throws on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(getQuota()).rejects.toThrow("offline");
  });
});
