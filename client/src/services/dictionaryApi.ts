import { PROXY_URL, proxyHeaders } from "./proxyClient";
import { notifyUpdateRequired } from "./updateGate";

export interface DictionaryExample {
  text: string;
  translation?: string;
}

export interface DictionaryResult {
  examples: DictionaryExample[];
}

/**
 * Fetch example sentences for a word via the proxy dictionary endpoint.
 * Throws on HTTP error or network failure.
 */
export async function getExamples(
  word: string,
  langPair: string,
): Promise<DictionaryExample[]> {
  const response = await fetch(`${PROXY_URL}/dictionary`, {
    method: "POST",
    headers: proxyHeaders(),
    body: JSON.stringify({ word, lang_pair: langPair }),
  });

  if (!response.ok) {
    if (response.status === 426) {
      notifyUpdateRequired();
    }
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  const data: DictionaryResult = await response.json();
  return data.examples ?? [];
}
