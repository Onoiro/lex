import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "@/i18n";
import { getAllWords, deleteWord, exportWords, importWords } from "@/data/wordRepository";
import { formatTime } from "@/domain/stats";
import { computeRank } from "@/domain/srs";
import { MAX_IMPORT_FILE_SIZE, MAX_IMPORT_ENTRIES } from "@/domain/validators";
import { sortWords, loadSortState, saveSortState, nextSortDir } from "@/domain/dictionarySort";
import type { SortBy, SortDir } from "@/domain/dictionarySort";
import { Mascot } from "@/components/Mascot";
import type { Word } from "@/types";

const MOBILE_BREAKPOINT = 768;

const SORT_OPTIONS: SortBy[] = ["date_added", "word", "known_no", "best_time", "avg_time", "rank", "pct"];

export function Dictionary() {
  const [t] = useLocale();
  const [words, setWords] = useState<Word[]>([]);
  const [search, setSearch] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const initialSort = useMemo(() => loadSortState(), []);
  const [sortBy, setSortBy] = useState<SortBy>(initialSort.sortBy);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort.sortDir);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveSortState({ sortBy, sortDir });
  }, [sortBy, sortDir]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  const sorted = sortWords(filtered, sortBy, sortDir);

  const handleSortClick = (column: SortBy) => {
    const dir = nextSortDir(column, { sortBy, sortDir });
    setSortBy(column);
    setSortDir(dir);
  };

  const sortIndicator = (column: SortBy) => {
    if (sortBy !== column) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

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
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        setImportMsg(
          t("dictionary.import_too_large", {
            max: Math.round(MAX_IMPORT_FILE_SIZE / (1024 * 1024)),
          }),
        );
        return;
      }

      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data) || data.length === 0) {
        setImportMsg(t("dictionary.import_empty"));
        return;
      }
      if (data.length > MAX_IMPORT_ENTRIES) {
        setImportMsg(t("dictionary.import_too_many", { max: MAX_IMPORT_ENTRIES }));
        return;
      }
      const result = await importWords(data);
      setImportMsg(
        t("dictionary.import_success", {
          imported: result.imported,
          skipped: result.skipped,
          invalid: result.invalid,
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
        <div className="page-hero">
          <Mascot emotion="reading" size="hero" />
          <hgroup>
            <h1>{t("dictionary.heading")}</h1>
            <p className="lex-hint">{t("dictionary.total", { total: 0 })}</p>
          </hgroup>
        </div>
        <article className="lex-card lex-center">
          <Mascot emotion="empty" size="hero" />
          <h2 className="lex-empty-title">{t("dictionary.empty")}</h2>
          <p className="lex-hint">{t("dictionary.empty_hint")}</p>
          <Link to="/add" role="button">{t("dictionary.add_word")}</Link>
        </article>
      </>
    );
  }

  return (
    <>
      <div className="page-hero">
        <Mascot emotion="reading" size="hero" />
        <hgroup>
          <h1>{t("dictionary.heading")}</h1>
          <p className="lex-hint">{t("dictionary.total", { total: words.length })}</p>
        </hgroup>
      </div>

      <div className="lex-toolbar">
        <button type="button" className="outline" onClick={() => void handleExport()}>
          📤 {t("dictionary.export")}
        </button>
        <button
          type="button"
          className="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          📥 {t("dictionary.import")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={(e) => void handleImport(e)}
          className="lex-hidden-input"
        />
      </div>

      {importMsg && (
        <p className="lex-hint">{importMsg}</p>
      )}

      <input
        type="search"
        placeholder="🔍"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="lex-search"
      />

      <div className="lex-sort-row">
        <select
          value={sortBy}
          onChange={(e) => {
            const value = e.target.value as SortBy;
            setSortBy(value);
            setSortDir(nextSortDir(value, { sortBy: "date_added", sortDir: "desc" }));
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t(`dictionary.sort_${opt}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="outline"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      <p className="lex-hint lex-hint--xs">
        {t(`dictionary.sort_${sortDir}_${sortBy}`)}
      </p>

      {isMobile ? (
        <div className="lex-word-list">
          {sorted.map((w) => {
            const total = w.know_count + w.forgot_count;
            const pct = total > 0 ? Math.round((w.know_count / total) * 100) : null;

            return (
              <article key={w.id} className="lex-card">
                <div className="lex-word-row">
                  <div className="lex-word-main">
                    <strong className="lex-word-title-text">{w.word}</strong>
                    <div className="lex-word-translation-text">{w.translation}</div>
                    {w.note && (
                      <small className="lex-word-note">{w.note}</small>
                    )}
                  </div>
                  <div className="lex-word-actions">
                    <Link
                      to={`/add?id=${w.id}`}
                      className="lex-icon-btn"
                      title={t("dictionary.col_edit")}
                    >
                      ✏️
                    </Link>
                    <button
                      type="button"
                      className="lex-icon-btn lex-icon-btn--danger"
                      onClick={() => handleDelete(w.id!, w.word)}
                      title={t("dictionary.col_delete")}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="lex-word-stats">
                  {total > 0 && (
                    <span>
                      <span className="lex-known">{w.know_count}</span>
                      {" / "}
                      <span className="lex-forgot">{w.forgot_count}</span>
                    </span>
                  )}
                  {w.hint_count > 0 && (
                    <span>💡 {w.hint_count}</span>
                  )}
                  {w.best_time !== null && w.avg_time !== null && (
                    <span>⚡ {formatTime(w.best_time)} / {formatTime(w.avg_time)}</span>
                  )}
                  <span>{t("dictionary.col_rank")}: {computeRank(w)}</span>
                  {pct !== null && <span>{pct}%</span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <article className="lex-table-wrap">
          <table role="grid">
            <thead>
              <tr>
                <th className="lex-th-sortable" onClick={() => handleSortClick("word")}>
                  {t("dictionary.col_word")}{sortIndicator("word")}
                </th>
                <th>{t("dictionary.col_translation")}</th>
                <th>{t("dictionary.col_note")}</th>
                <th className="lex-th-sortable lex-cell-center" onClick={() => handleSortClick("known_no")}>
                  {t("dictionary.col_known_no")}{sortIndicator("known_no")}
                </th>
                <th className="lex-th-sortable lex-cell-center" onClick={() => handleSortClick("best_time")}>
                  {t("dictionary.col_time")}{sortIndicator("best_time")}
                </th>
                <th className="lex-th-sortable lex-cell-center" onClick={() => handleSortClick("rank")}>
                  {t("dictionary.col_rank")}{sortIndicator("rank")}
                </th>
                <th className="lex-th-sortable lex-cell-center" onClick={() => handleSortClick("pct")}>
                  {t("dictionary.col_pct")}{sortIndicator("pct")}
                </th>
                <th className="lex-cell-center">{t("dictionary.col_delete")}</th>
                <th className="lex-cell-center">{t("dictionary.col_edit")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => {
                const total = w.know_count + w.forgot_count;
                const pct = total > 0 ? Math.round((w.know_count / total) * 100) : null;

                return (
                  <tr key={w.id}>
                    <td><strong>{w.word}</strong></td>
                    <td>{w.translation}</td>
                    <td className="lex-cell-note">{w.note || "—"}</td>
                    <td className="lex-cell-center">
                      {total > 0 ? (
                        <>
                          <span className="lex-known">{w.know_count}</span>
                          {" / "}
                          <span className="lex-forgot">{w.forgot_count}</span>
                        </>
                      ) : "—"}
                      {w.hint_count > 0 && <> 💡 {w.hint_count}</>}
                    </td>
                    <td className="lex-cell-center">
                      {w.best_time !== null && w.avg_time !== null ? (
                        <>
                          <span>⚡ {formatTime(w.best_time)}</span>
                          {" / "}
                          <span>{formatTime(w.avg_time)}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="lex-cell-center">{computeRank(w)}</td>
                    <td className="lex-cell-center">{pct !== null ? `${pct}%` : "—"}</td>
                    <td className="lex-cell-center">
                      <button
                        type="button"
                        className="lex-icon-btn lex-icon-btn--danger"
                        onClick={() => handleDelete(w.id!, w.word)}
                        title={t("dictionary.col_delete")}
                      >
                        🗑️
                      </button>
                    </td>
                    <td className="lex-cell-center">
                      <Link
                        to={`/add?id=${w.id}`}
                        className="lex-icon-btn"
                        title={t("dictionary.col_edit")}
                      >
                        ✏️
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      )}
    </>
  );
}