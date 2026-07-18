import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "@/i18n";
import { getAllWords, deleteWord, exportWords, importWords } from "@/data/wordRepository";
import { formatTime } from "@/domain/stats";
import type { Word } from "@/types";

export function Dictionary() {
  const [t] = useLocale();
  const [words, setWords] = useState<Word[]>([]);
  const [search, setSearch] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadWords = useCallback(async () => {
    const all = await getAllWords();
    setWords(all);
  }, []);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  const filtered = search.trim()
    ? words.filter(
        (w) =>
          w.word.toLowerCase().includes(search.toLowerCase()) ||
          w.translation.toLowerCase().includes(search.toLowerCase()),
      )
    : words;

  const handleDelete = async (id: number, word: string) => {
    if (!confirm(t("dictionary.confirm_delete", { word }))) return;
    await deleteWord(id);
    void loadWords();
  };

  const handleExport = async () => {
    const words = await exportWords();
    const blob = new Blob([JSON.stringify(words, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lex-dictionary.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data) || data.length === 0) {
        setImportMsg(t("dictionary.import_empty"));
        return;
      }
      const result = await importWords(data);
      setImportMsg(
        t("dictionary.import_success", {
          imported: result.imported,
          skipped: result.skipped,
        }),
      );
      void loadWords();
    } catch {
      setImportMsg(t("dictionary.import_error"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (words.length === 0) {
    return (
      <>
        <hgroup style={{ textAlign: "center", marginBottom: "2rem", marginTop: "1rem" }}>
          <h1>{t("dictionary.heading")}</h1>
          <p>{t("dictionary.total", { total: 0 })}</p>
        </hgroup>
        <article style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>{t("dictionary.empty")}</h2>
          <p style={{ color: "var(--pico-muted-color)" }}>{t("dictionary.empty_hint")}</p>
          <Link to="/add" role="button">{t("dictionary.add_word")}</Link>
        </article>
      </>
    );
  }

  return (
    <>
      <hgroup style={{ textAlign: "center", marginBottom: "2rem", marginTop: "1rem" }}>
        <h1>{t("dictionary.heading")}</h1>
        <p>{t("dictionary.total", { total: words.length })}</p>
      </hgroup>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button className="outline" onClick={() => void handleExport()} style={{ fontSize: "0.9rem" }}>
          📤 {t("dictionary.export")}
        </button>
        <button
          className="outline"
          onClick={() => fileInputRef.current?.click()}
          style={{ fontSize: "0.9rem" }}
        >
          📥 {t("dictionary.import")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={(e) => void handleImport(e)}
          style={{ display: "none" }}
        />
      </div>

      {importMsg && (
        <p style={{ marginBottom: "1rem", color: "var(--pico-muted-color)" }}>{importMsg}</p>
      )}

      <input
        type="search"
        placeholder="🔍"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: "1rem" }}
      />

      <article style={{ padding: 0, overflowX: "auto" }}>
        <table role="grid" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: "25%", padding: "0.75rem" }}>{t("dictionary.col_word")}</th>
              <th style={{ width: "25%" }}>{t("dictionary.col_translation")}</th>
              <th style={{ width: "10%", textAlign: "center" }}>{t("dictionary.col_known_no")}</th>
              <th style={{ width: "12%", textAlign: "center" }}>{t("dictionary.col_time")}</th>
              <th style={{ width: "10%", textAlign: "center" }}>{t("dictionary.col_interval")}</th>
              <th style={{ width: "8%", textAlign: "center" }}>{t("dictionary.col_pct")}</th>
              <th style={{ width: "10%", textAlign: "center", padding: "0.75rem" }}>{t("dictionary.col_delete")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => {
              const total = w.know_count + w.forgot_count;
              const pct = total > 0 ? Math.round((w.know_count / total) * 100) : null;

              return (
                <tr key={w.id}>
                  <td style={{ padding: "0.75rem" }}><strong>{w.word}</strong></td>
                  <td>{w.translation}</td>
                  <td style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--pico-muted-color)" }}>
                    {total > 0 ? (
                      <>
                        <span style={{ color: "green" }}>{w.know_count}</span>
                        {" / "}
                        <span style={{ color: "red" }}>{w.forgot_count}</span>
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--pico-muted-color)" }}>
                    {w.best_time !== null && w.avg_time !== null ? (
                      <>
                        <span>⚡ {formatTime(w.best_time)}</span>
                        {" / "}
                        <span>{formatTime(w.avg_time)}</span>
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--pico-muted-color)" }}>
                    {w.interval > 0 ? `${w.interval}д` : "—"}
                  </td>
                  <td style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--pico-muted-color)" }}>
                    {pct !== null ? `${pct}%` : "—"}
                  </td>
                  <td style={{ textAlign: "center", padding: "0.75rem" }}>
                    <button
                      className="outline contrast"
                      onClick={() => handleDelete(w.id!, w.word)}
                      style={{ border: "none", padding: "0.25rem 0.5rem", fontSize: "1.2rem" }}
                      title={t("dictionary.col_delete")}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </>
  );
}