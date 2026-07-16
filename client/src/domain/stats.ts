import type { Word } from "@/types";

/**
 * Update best and average response time for a word.
 *
 * Returns a partial Word object with updated best_time and/or avg_time.
 * Does NOT mutate the original word.
 * Ignores elapsed <= 0.
 */
export function updateResponseTime(
  word: Word,
  elapsed: number,
): Partial<Word> {
  if (elapsed <= 0) {
    return {};
  }

  const result: Partial<Word> = {};

  if (word.best_time === null || elapsed < word.best_time) {
    result.best_time = elapsed;
  }

  if (word.avg_time === null) {
    result.avg_time = elapsed;
  } else {
    result.avg_time = (word.avg_time + elapsed) / 2.0;
  }

  return result;
}

/**
 * Format a time in seconds as "X.XXs".
 */
export function formatTime(seconds: number): string {
  return seconds.toFixed(2) + "s";
}
