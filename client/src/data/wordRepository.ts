import { db } from "./db";
import type { Word } from "@/types";

/** Create a new word entry with default SRS fields. */
export async function addWord(
  word: string,
  translation: string,
): Promise<number> {
  const existing = await db.words.where("word").equals(word).first();
  if (existing) {
    throw new Error(`Word "${word}" already exists`);
  }

  const id = await db.words.add({
    word,
    translation,
    interval: 0,
    repetitions: 0,
    next_review: 0,
    last_direction: "en_ru",
    best_time: null,
    avg_time: null,
    know_count: 0,
    forgot_count: 0,
  });

  return id;
}

/** Delete a word by id. */
export async function deleteWord(id: number): Promise<void> {
  await db.words.delete(id);
}

/** Get a single word by id. */
export async function getWord(id: number): Promise<Word | undefined> {
  return db.words.get(id);
}

/** Get all words sorted alphabetically by word. */
export async function getAllWords(): Promise<Word[]> {
  return db.words.orderBy("word").toArray();
}

/** Partially update a word entry. */
export async function updateWord(
  id: number,
  changes: Partial<Word>,
): Promise<void> {
  await db.words.update(id, changes);
}

/** Get total word count. */
export async function getWordCount(): Promise<number> {
  return db.words.count();
}

/** Export all words as a JSON-serializable array. */
export async function exportWords(): Promise<Word[]> {
  return db.words.orderBy("word").toArray();
}

/** Import words from a JSON array, skipping duplicates. */
export async function importWords(data: Word[]): Promise<{
  imported: number;
  skipped: number;
}> {
  let imported = 0;
  let skipped = 0;

  for (const entry of data) {
    const existing = await db.words
      .where("word")
      .equals(entry.word)
      .first();
    if (existing) {
      skipped++;
      continue;
    }

    await db.words.add({
      word: entry.word,
      translation: entry.translation,
      interval: entry.interval ?? 0,
      repetitions: entry.repetitions ?? 0,
      next_review: entry.next_review ?? 0,
      last_direction: entry.last_direction ?? "en_ru",
      best_time: entry.best_time ?? null,
      avg_time: entry.avg_time ?? null,
      know_count: entry.know_count ?? 0,
      forgot_count: entry.forgot_count ?? 0,
    });
    imported++;
  }

  return { imported, skipped };
}
