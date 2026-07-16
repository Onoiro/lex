import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@picocss/pico/css/pico.min.css";
import "./index.css";

function App() {
  return (
    <div className="container">
      <h1>Lex</h1>
      <p>Client scaffold — Phase 0</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);