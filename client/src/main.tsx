import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <div>
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
