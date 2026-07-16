import Dexie, { type Table } from "dexie";
import type { Word, LanguageSettings } from "@/types";

/** Settings row: single-row table keyed by "app". */
export interface SettingsRow extends LanguageSettings {
  id: "app";
}

export class LexDatabase extends Dexie {
  words!: Table<Word, number>;
  settings!: Table<SettingsRow, string>;

  constructor() {
    super("lex-db");
    this.version(1).stores({
      words: "++id, &word, next_review",
      settings: "id",
    });
  }
}

export const db = new LexDatabase();
