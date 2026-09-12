/** Base URL of the proxy (empty string = relative path). */
export const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

import { getDeviceId } from "./deviceId";

// Shared secret sent as the X-App-Token header. Baked in at build time
// via VITE_APP_TOKEN. Empty in local dev — the header is then omitted
// (the proxy has token checking disabled when APP_TOKENS is unset).
const APP_TOKEN = import.meta.env.VITE_APP_TOKEN ?? "";

// App version injected at build time from package.json (vite define).
// Sent as X-App-Version so the proxy can gate outdated clients.
declare const __APP_VERSION__: string;

/** Headers for proxy API requests (Content-Type + app token when set). */
export function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-App-Version": __APP_VERSION__,
  };
  if (APP_TOKEN) {
    headers["X-App-Token"] = APP_TOKEN;
  }
  // Quota follows the device, not the IP (fair behind CGNAT)
  const deviceId = getDeviceId();
  if (deviceId) {
    headers["X-Device-Id"] = deviceId;
  }
  return headers;
}