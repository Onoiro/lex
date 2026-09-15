import { db } from "./db";
import { sanitizeImportEntry } from "@/domain/validators";
import type { Word } from "@/types";

/** Create a new word entry with default SRS fields. */
export async function addWord(
  word: string,
  translation: string,
  wordLang: string = "en",
  translationLang: string = "ru",
  note?: string,
): Promise<number> {
  const existing = await db.words.where("word").equals(word).first();
  if (existing) {
    throw new Error(`Word "${word}" already exists`);
  }

  const id = await db.words.add({
    word,
    translation,
    word_lang: wordLang,
    translation_lang: translationLang,
    ...(note ? { note } : {}),
    interval: 0,
    repetitions: 0,
    next_review: 0,
    last_direction: "en_ru",
    best_time: null,
    avg_time: null,
    know_count: 0,
    forgot_count: 0,
    hint_count: 0,
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

/** Update word text, translation, and note with duplicate check.
 *  Throws if the new word text already exists in a different entry.
 *  Pass `note` as empty string to clear the stored note, or omit to leave unchanged. */
export async function updateWordEntry(
  id: number,
  word: string,
  translation: string,
  wordLang: string,
  translationLang: string,
  note?: string,
): Promise<void> {
  // Check for duplicate (exclude current id)
  const existing = await db.words.where("word").equals(word).first();
  if (existing && existing.id !== id) {
    throw new Error(`Word "${word}" already exists`);
  }

  await db.words.update(id, { word, translation, word_lang: wordLang, translation_lang: translationLang });

  if (note !== undefined) {
    if (note) {
      await db.words.update(id, { note });
    } else {
      // Clear the note field
      await db.words.where(":id").equals(id).modify((w: Word) => {
        delete w.note;
      });
    }
  }
}

/** Get total word count. */
export async function getWordCount(): Promise<number> {
  return db.words.count();
}

/** Export all words as a JSON-serializable array. */
export async function exportWords(): Promise<Word[]> {
  return db.words.orderBy("word").toArray();
}

/** Import words from a JSON array: sanitize each entry, skip duplicates
 *  (both existing in the DB and within the file) and invalid entries.
 *  Runs in a single transaction with one bulkAdd — atomic and fast. */
export async function importWords(data: unknown[]): Promise<{
  imported: number;
  skipped: number;
  invalid: number;
}> {
  return db.transaction("rw", db.words, async () => {
    const existing = new Set((await db.words.toArray()).map((w) => w.word));

    let skipped = 0;
    let invalid = 0;
    const toAdd: Word[] = [];

    for (const entry of data) {
      const word = sanitizeImportEntry(entry);
      if (word === null) {
        invalid++;
        continue;
      }
      if (existing.has(word.word)) {
        skipped++;
        continue;
      }
      existing.add(word.word);
      toAdd.push(word);
    }

    if (toAdd.length > 0) {
      await db.words.bulkAdd(toAdd);
    }

    return { imported: toAdd.length, skipped, invalid };
  });
}
