import { describe, it, expect, vi, beforeEach } from "vitest";

describe("updateGate", () => {
  beforeEach(() => {
    // Reset module state between tests
    vi.resetModules();
  });

  it("starts as not required", async () => {
    const gate = await import("@/services/updateGate");
    expect(gate.isUpdateRequired()).toBe(false);
  });

  it("notifyUpdateRequired sets the flag and notifies subscribers", async () => {
    const gate = await import("@/services/updateGate");
    const calls: boolean[] = [];
    gate.onUpdateRequired(() => calls.push(gate.isUpdateRequired()));

    gate.notifyUpdateRequired();

    expect(gate.isUpdateRequired()).toBe(true);
    expect(calls).toEqual([true]);
  });

  it("notifyUpdateRequired is idempotent", async () => {
    const gate = await import("@/services/updateGate");
    let calls = 0;
    gate.onUpdateRequired(() => {
      calls++;
    });

    gate.notifyUpdateRequired();
    gate.notifyUpdateRequired();
    gate.notifyUpdateRequired();

    expect(calls).toBe(1);
  });

  it("unsubscribe stops notifications", async () => {
    const gate = await import("@/services/updateGate");
    let calls = 0;
    const unsub = gate.onUpdateRequired(() => {
      calls++;
    });
    unsub();

    gate.notifyUpdateRequired();

    expect(calls).toBe(0);
  });
});
