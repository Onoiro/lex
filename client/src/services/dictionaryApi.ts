const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? "";

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, lang_pair: langPair }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  const data: DictionaryResult = await response.json();
  return data.examples ?? [];
}
