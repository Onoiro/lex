import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "@/i18n";
import { getLanguages } from "@/services/translateApi";
import { getSettings, saveSettings } from "@/data/settingsRepository";
import { Mascot } from "@/components/Mascot";
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
      <div className="home-hero">
        <Mascot emotion="base" size="hero" />
        <hgroup>
          <h1>
            {t("index.title")}
            <small className="home-title-tail">{t("index.title_tail")}</small>
          </h1>
          <p className="lex-hint">
            {t("index.subtitle_detail", { count: langCount ?? "..." })}
          </p>
        </hgroup>
      </div>

      <div className="grid">
        <article className="lex-card">
          <header>
            <h2 className="lex-card-title">{t("index.translate_card.title")}</h2>
          </header>
          <p className="lex-card-desc">{t("index.translate_card.description")}</p>
          <footer>
            <Link to="/add" role="button" className="outline lex-card-cta">
              {t("index.translate_card.button")}
            </Link>
          </footer>
        </article>

        <article className="lex-card">
          <header>
            <h2 className="lex-card-title">{t("index.review_card.title")}</h2>
          </header>
          <p className="lex-card-desc">{t("index.review_card.description")}</p>
          <footer>
            <Link to="/review" role="button" className="lex-card-cta">
              {t("index.review_card.button")}
            </Link>
          </footer>
        </article>
      </div>
    </>
  );
}