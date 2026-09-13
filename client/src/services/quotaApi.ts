import { PROXY_URL, proxyHeaders } from "./proxyClient";
import { notifyUpdateRequired } from "./updateGate";

export interface QuotaLevel {
  used: number;
  limit: number;
  remaining: number;
}

export interface QuotaInfo {
  translate: QuotaLevel;
  tts: QuotaLevel;
}

/**
 * Fetch remaining daily quota (translate and tts) for this device.
 * Throws on network failure; 426 triggers the update gate.
 */
export async function getQuota(): Promise<QuotaInfo> {
  const response = await fetch(`${PROXY_URL}/quota`, {
    headers: proxyHeaders(),
  });

  if (!response.ok) {
    if (response.status === 426) {
      notifyUpdateRequired();
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    translate: {
      used: data.translate?.used ?? 0,
      limit: data.translate?.limit ?? 0,
      remaining: data.translate?.remaining ?? 0,
    },
    tts: {
      used: data.tts?.used ?? 0,
      limit: data.tts?.limit ?? 0,
      remaining: data.tts?.remaining ?? 0,
    },
  };
}
