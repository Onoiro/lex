export function Home() {
  return (
    <>
      <hgroup style={{ textAlign: "center", marginBottom: "3rem", marginTop: "2rem" }}>
        <h1>Lex</h1>
        <p>Translate and memorize words</p>
      </hgroup>

      <div className="grid">
        <article>
          <header>
            <h2 style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>Translate</h2>
          </header>
          <p style={{ fontSize: "0.9rem", color: "var(--pico-muted-color)", minHeight: "4rem" }}>
            Add a new word with auto-translation.
          </p>
          <footer>
            <Link to="/add" role="button" className="outline" style={{ width: "100%", textAlign: "center" }}>
              Translate
            </Link>
          </footer>
        </article>

        <article>
          <header>
            <h2 style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>Review</h2>
          </header>
          <p style={{ fontSize: "0.9rem", color: "var(--pico-muted-color)", minHeight: "4rem" }}>
            Practice words with spaced repetition.
          </p>
          <footer>
            <Link to="/review" role="button" style={{ width: "100%", textAlign: "center" }}>
              Review
            </Link>
          </footer>
        </article>
      </div>
    </>
  );
}

import { Link } from "react-router-dom";
