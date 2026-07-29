import type { Theme, Skin } from "@/types";

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

/** Apply the given theme and skin to the document root element. */
export function applyTheme(theme: Theme, skin: Skin = "default"): void {
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute("data-theme", resolved);

  if (skin === "default") {
    document.documentElement.removeAttribute("data-skin");
  } else {
    document.documentElement.setAttribute("data-skin", skin);
  }

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
    };
    mediaQuery.addEventListener("change", mediaListener);
  }
}
