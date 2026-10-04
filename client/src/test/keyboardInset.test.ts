import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initKeyboardInset } from "@/services/keyboardInset";

/** Minimal visualViewport stub with a controllable height. */
function stubVisualViewport(height: number, offsetTop = 0) {
  const listeners: Record<string, (() => void)[]> = {};
  const vv = {
    height,
    offsetTop,
    addEventListener: (type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    },
  };
  vi.stubGlobal("visualViewport", vv);
  return {
    setHeight(next: number) {
      vv.height = next;
      listeners.resize?.forEach((cb) => cb());
    },
  };
}

describe("initKeyboardInset", () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty("--lex-keyboard-inset");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--lex-keyboard-inset");
  });

  it("sets the inset to 0 when the keyboard is closed", () => {
    stubVisualViewport(window.innerHeight);
    initKeyboardInset();

    expect(
      document.documentElement.style.getPropertyValue("--lex-keyboard-inset"),
    ).toBe("0px");
  });

  it("reports the keyboard height when the viewport shrinks", () => {
    const vv = stubVisualViewport(window.innerHeight);
    initKeyboardInset();

    vv.setHeight(window.innerHeight - 300);

    expect(
      document.documentElement.style.getPropertyValue("--lex-keyboard-inset"),
    ).toBe("300px");
  });

  it("ignores small viewport changes (browser chrome, not a keyboard)", () => {
    const vv = stubVisualViewport(window.innerHeight);
    initKeyboardInset();

    vv.setHeight(window.innerHeight - 40);

    expect(
      document.documentElement.style.getPropertyValue("--lex-keyboard-inset"),
    ).toBe("0px");
  });

  it("does nothing when visualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);
    initKeyboardInset();

    expect(
      document.documentElement.style.getPropertyValue("--lex-keyboard-inset"),
    ).toBe("");
  });
});
