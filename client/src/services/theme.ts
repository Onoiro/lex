import type { Theme, Skin } from "@/types";
import { Capacitor } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar";

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
let mediaQuery: MediaQueryList | null = null;

/** Resolve "auto" theme to actual light/dark based on system preference. */
function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

/**
 * Keep the browser chrome (address bar) and the Android status bar in sync
 * with the active skin. The color is read back from the resolved
 * --pico-primary-background token so every skin/dark-mode combination matches.
 */
function syncChromeColors(): void {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue("--pico-primary-background")
    .trim();
  if (!color) return;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);

  // Native shell: recolor the status bar to the same skin color.
  if (Capacitor.isNativePlatform()) {
    void StatusBar.setBackgroundColor({ color }).catch(() => {});
  }
}

/** Apply the given theme and skin to the document root element. */
export function applyTheme(theme: Theme, skin: Skin = "default"): void {
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute("data-theme", resolved);

  if (skin === "default") {
    document.documentElement.removeAttribute("data-skin");
  } else {
    document.documentElement.setAttribute("data-skin", skin);
  }

  // Chrome colors depend on the resolved theme+skin, so read them after
  // the attributes above are in place.
  syncChromeColors();

  // Manage system listener for "auto" mode
  if (mediaQuery) {
    if (mediaListener) {
      mediaQuery.removeEventListener("change", mediaListener);
    }
    mediaQuery = null;
    mediaListener = null;
  }

  if (theme === "auto") {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaListener = () => {
      document.documentElement.setAttribute(
        "data-theme",
        mediaQuery!.matches ? "dark" : "light",
      );
      syncChromeColors();
    };
    mediaQuery.addEventListener("change", mediaListener);
  }
}
