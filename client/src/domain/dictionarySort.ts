import type { Word } from "@/types";
import { computeRank } from "./srs";

export type SortBy = "word" | "known_no" | "best_time" | "avg_time" | "rank" | "pct" | "date_added";
export type SortDir = "asc" | "desc";

export interface SortState {
  sortBy: SortBy;
  sortDir: SortDir;
}

export const DEFAULT_SORT: SortState = { sortBy: "date_added", sortDir: "desc" };

const STORAGE_KEY = "lex-dict-sort";

export function loadSortState(): SortState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as Partial<SortState>;
    // Backward compat: old "none" → "date_added"
    const rawSortBy = parsed.sortBy as string | undefined;
    const sortBy = rawSortBy === "none" ? "date_added" : rawSortBy;
    if (
      sortBy &&
      ["word", "known_no", "best_time", "avg_time", "rank", "pct", "date_added"].includes(sortBy) &&
      parsed.sortDir &&
      ["asc", "desc"].includes(parsed.sortDir)
    ) {
      return { sortBy: sortBy as SortBy, sortDir: parsed.sortDir as SortDir };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SORT;
}

export function saveSortState(state: SortState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function computePct(word: Word): number | null {
  const total = word.know_count + word.forgot_count;
  if (total === 0) return null;
  return (word.know_count / total) * 100;
}

function getSortValue(word: Word, sortBy: SortBy): number | string | null {
  switch (sortBy) {
    case "word":
      return word.word.toLowerCase();
    case "known_no":
      return word.know_count + word.forgot_count;
    case "best_time":
      return word.best_time;
    case "avg_time":
      return word.avg_time;
    case "rank":
      return computeRank(word);
    case "pct":
      return computePct(word);
    case "date_added":
      return word.id ?? 0;
    default:
      return null;
  }
}

export function sortWords(words: Word[], sortBy: SortBy, sortDir: SortDir): Word[] {
  if (sortBy === "date_added" && sortDir === "desc") {
    // Default order: newest first
    return [...words].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }

  const sorted = [...words].sort((a, b) => {
    const va = getSortValue(a, sortBy);
    const vb = getSortValue(b, sortBy);

    // Null values always go last, regardless of direction
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;

    let cmp: number;
    if (typeof va === "string" && typeof vb === "string") {
      cmp = va.localeCompare(vb);
    } else {
      cmp = (va as number) - (vb as number);
    }

    if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;

    // Stable secondary sort by id
    return (a.id ?? 0) - (b.id ?? 0);
  });

  return sorted;
}

export function nextSortDir(sortBy: SortBy, current: SortState): SortDir {
  if (current.sortBy !== sortBy) {
    // Default direction per column
    if (sortBy === "word" || sortBy === "best_time" || sortBy === "avg_time" || sortBy === "date_added") return "asc";
    return "desc";
  }
  return current.sortDir === "asc" ? "desc" : "asc";
}
