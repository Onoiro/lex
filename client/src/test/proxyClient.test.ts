import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * proxyHeaders() reads VITE_APP_TOKEN at module load time, so each test
 * re-imports the module with a fresh env via dynamic import.
 * __APP_VERSION__ is injected by vite define (package.json version) and
 * is a compile-time constant — asserted via objectContaining.
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
    expect(proxyHeaders()).toEqual(
      expect.objectContaining({ "X-App-Token": "secret-token" }),
    );
  });

  it("omits X-App-Token when VITE_APP_TOKEN is empty", async () => {
    const { proxyHeaders } = await importProxyClient("");
    expect(proxyHeaders()).not.toHaveProperty("X-App-Token");
  });

  it("omits X-App-Token when VITE_APP_TOKEN is undefined", async () => {
    const { proxyHeaders } = await importProxyClient(undefined);
    expect(proxyHeaders()).not.toHaveProperty("X-App-Token");
  });

  it("always includes X-App-Version", async () => {
    const { proxyHeaders } = await importProxyClient("");
    expect(proxyHeaders()).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
        "X-App-Version": expect.any(String),
      }),
    );
  });
});