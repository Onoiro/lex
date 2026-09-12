/**
 * Device ID for proxy quota tracking (X-Device-Id header).
 * Generated once, persisted in localStorage. Quota follows the device,
 * not the IP — fair for users behind CGNAT. Clearing site data resets
 * the ID (acceptable for the Free tier).
 */

const DEVICE_ID_KEY = "lex_device_id";

/** Get the persistent device ID, generating it on first use. Empty string if storage is unavailable. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
