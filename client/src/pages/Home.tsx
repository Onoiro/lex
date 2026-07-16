import { Link } from "react-router-dom";
import { useLocale } from "@/i18n";

export function Home() {
  const [t] = useLocale();

  return (
    <>
      <hgroup style={{ textAlign: "center", marginBottom: "3rem", marginTop: "2rem" }}>
        <h1>{t("index.title")}</h1>
        <p>{t("index.subtitle")}</p>
        <p style={{ fontSize: "0.9rem", color: "var(--pico-muted-color)" }}>
          {t("index.subtitle_detail")}
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