/** Daily review statistics, keyed by local date "YYYY-MM-DD". */
export interface DailyStats {
  /** Local date as "YYYY-MM-DD" (primary key). */
  date: string;
  /** Total answers given this day. */
  reviewed: number;
  /** "I know" answers. */
  known: number;
  /** "I forgot" answers. */
  forgotten: number;
  /** Sum of answer times in seconds (avg = total_time / reviewed). */
  total_time: number;
  /** Best answer time in seconds this day (null if no answers). */
  best_time: number | null;
  /** Words added to the dictionary this day. */
  new_words: number;
}

/** Zeroed DailyStats stub for a given date. */
export function emptyDailyStats(date: string): DailyStats {
  return {
    date,
    reviewed: 0,
    known: 0,
    forgotten: 0,
    total_time: 0,
    best_time: null,
    new_words: 0,
  };
}
