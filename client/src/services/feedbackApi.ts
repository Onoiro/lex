const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        message,
        contact: contact ?? "",
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.error ?? `HTTP ${response.status}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Network error" };
  }
}
