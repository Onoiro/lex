import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "@/i18n";
import { getLanguages } from "@/services/translateApi";
import { getSettings, saveSettings } from "@/data/settingsRepository";
import { LANG_COUNT_TTL_MS } from "@/types";

export function Home() {
  const [t] = useLocale();
  const [langCount, setLangCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLangCount() {
      const settings = await getSettings();
      const now = Date.now();

      // Use cached value if still fresh
      if (
        settings.lang_count != null &&
        settings.lang_count_updated_at != null &&
        now - settings.lang_count_updated_at < LANG_COUNT_TTL_MS
      ) {
        if (!cancelled) setLangCount(settings.lang_count!);
        return;
      }

      // Fallback to cached value while we fetch
      if (settings.lang_count != null) {
        setLangCount(settings.lang_count);
      }

      try {
        const langs = await getLanguages();
        if (!cancelled) {
          setLangCount(langs.length);
          // Persist cache
          await saveSettings({
            lang_count: langs.length,
            lang_count_updated_at: now,
          });
        }
      } catch {
        // Keep using the cached value (or null if never fetched)
      }
    }

    void loadLangCount();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <hgroup style={{ textAlign: "center", marginBottom: "3rem", marginTop: "2rem" }}>
        <h1>{t("index.title")}</h1>
        <p>{t("index.subtitle")}</p>
        <p style={{ fontSize: "0.9rem", color: "var(--pico-muted-color)" }}>
          {t("index.subtitle_detail", { count: langCount ?? "..." })}
        </p>
      </hgroup>

      <div className="grid">
        <article>
          <header>
            <h2 style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>
              {t("index.translate_card.title")}
            </h2>
          </header>
          <p style={{ fontSize: "0.9rem", color: "var(--pico-muted-color)", minHeight: "4rem" }}>
            {t("index.translate_card.description")}
          </p>
          <footer>
            <Link
              to="/add"
              role="button"
              className="outline"
              style={{ width: "100%", textAlign: "center" }}
            >
              {t("index.translate_card.button")}
            </Link>
          </footer>
        </article>

        <article>
          <header>
            <h2 style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>
              {t("index.review_card.title")}
            </h2>
          </header>
          <p style={{ fontSize: "0.9rem", color: "var(--pico-muted-color)", minHeight: "4rem" }}>
            {t("index.review_card.description")}
          </p>
          <footer>
            <Link
              to="/review"
              role="button"
              style={{ width: "100%", textAlign: "center" }}
            >
              {t("index.review_card.button")}
            </Link>
          </footer>
        </article>
      </div>
    </>
  );
}