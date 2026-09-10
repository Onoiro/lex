import { PROXY_URL, proxyHeaders } from "./proxyClient";
import { notifyUpdateRequired } from "./updateGate";

export interface FeedbackResult {
  success: boolean;
  error?: string;
}

/**
 * Send user feedback to the developer via the proxy (Telegram Bot API).
 * Returns { success: true } on success or { success: false, error } on failure.
 */
export async function sendFeedback(
  category: string,
  message: string,
  contact?: string,
): Promise<FeedbackResult> {
  try {
    const response = await fetch(`${PROXY_URL}/feedback`, {
      method: "POST",
      headers: proxyHeaders(),
      body: JSON.stringify({
        category,
        message,
        contact: contact ?? "",
      }),
    });

    if (!response.ok) {
      if (response.status === 426) {
        notifyUpdateRequired();
      }
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.error ?? `HTTP ${response.status}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Network error" };
  }
}
