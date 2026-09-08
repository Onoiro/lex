/** Base URL of the proxy (empty string = relative path). */
export const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

// Shared secret sent as the X-App-Token header. Baked in at build time
// via VITE_APP_TOKEN. Empty in local dev — the header is then omitted
// (the proxy has token checking disabled when APP_TOKENS is unset).
const APP_TOKEN = import.meta.env.VITE_APP_TOKEN ?? "";

/** Headers for proxy API requests (Content-Type + app token when set). */
export function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (APP_TOKEN) {
    headers["X-App-Token"] = APP_TOKEN;
  }
  return headers;
}
