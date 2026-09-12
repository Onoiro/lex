import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDeviceId } from "./deviceId";

describe("getDeviceId", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("generates and persists a UUID on first call", () => {
    const id = getDeviceId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(localStorage.getItem("lex_device_id")).toBe(id);
  });

  it("reuses the stored ID on subsequent calls", () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(second).toBe(first);
  });

  it("returns existing stored ID without regenerating", () => {
    localStorage.setItem("lex_device_id", "existing-id");
    expect(getDeviceId()).toBe("existing-id");
  });

  it("returns empty string when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(getDeviceId()).toBe("");
  });
});
