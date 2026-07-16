import type { ReviewDirection, Word } from "@/types";

const MAX_INTERVAL = 30;
const SECONDS_PER_DAY = 86400;

/**
 * Apply SM-2 based review result to a word.
 *
 * Returns a partial Word object with updated SRS fields.
 * Does NOT mutate the original word.
 *
 * Interval growth:
 *   - 1st correct: interval = 1
 *   - 2nd correct: interval = 6
 *   - subsequent: interval = interval * 2.5 (capped at 30)
 *
 * On incorrect: interval and repetitions reset to 0.
 */
export function applyReviewResult(
  word: Word,
  correct: boolean,
  direction: ReviewDirection,
): Partial<Word> {
  let interval: number;

  if (correct) {
    if (word.repetitions === 0) {
      interval = 1;
    } else if (word.repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.trunc(word.interval * 2.5);
    }
    if (interval > MAX_INTERVAL) {
      interval = MAX_INTERVAL;
    }

    return {
      interval,
      repetitions: word.repetitions + 1,
      next_review: Date.now() / 1000 + interval * SECONDS_PER_DAY,
      last_direction: direction,
      know_count: word.know_count + 1,
    };
  }

  return {
    interval: 0,
    repetitions: 0,
    next_review: Date.now() / 1000,
    last_direction: direction,
    forgot_count: word.forgot_count + 1,
  };
}

/**
 * Pick a word using weighted random selection.
 *
 * Weight = 1 / (interval + 1). Words with lower intervals
 * (more frequently forgotten) are picked more often.
 */
export function pickWeightedWord(words: Word[]): Word | null {
  if (words.length === 0) {
    return null;
  }

  const weights = words.map((w) => 1.0 / (w.interval + 1));
  const total = weights.reduce((sum, w) => sum + w, 0);

  let r = Math.random() * total;
  for (let i = 0; i < words.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      return words[i];
    }
  }

  return words[words.length - 1];
}

/**
 * Return a random review direction.
 */
export function pickRandomDirection(): ReviewDirection {
  return Math.random() < 0.5 ? "en_ru" : "ru_en";
}
