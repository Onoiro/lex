import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * proxyHeaders() reads VITE_APP_TOKEN at module load time, so each test
 * re-imports the module with a fresh env via dynamic import.
 */
async function importProxyClient(token: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VITE_APP_TOKEN", token ?? "");
  return await import("@/services/proxyClient");
}

describe("proxyClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("includes X-App-Token when VITE_APP_TOKEN is set", async () => {
    const { proxyHeaders } = await importProxyClient("secret-token");
    expect(proxyHeaders()).toEqual({
      "Content-Type": "application/json",
      "X-App-Token": "secret-token",
    });
  });

  it("omits X-App-Token when VITE_APP_TOKEN is empty", async () => {
    const { proxyHeaders } = await importProxyClient("");
    expect(proxyHeaders()).toEqual({ "Content-Type": "application/json" });
  });

  it("omits X-App-Token when VITE_APP_TOKEN is undefined", async () => {
    const { proxyHeaders } = await importProxyClient(undefined);
    expect(proxyHeaders()).toEqual({ "Content-Type": "application/json" });
  });
});
