import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@picocss/pico/css/pico.min.css";
import "./index.css";
import { Layout } from "@/components/Layout";
import { Home } from "@/pages/Home";
import { Add } from "@/pages/Add";
import { Review } from "@/pages/Review";
import { Dictionary } from "@/pages/Dictionary";
import { Settings } from "@/pages/Settings";
import { useInitLocale } from "@/i18n";

function App() {
  useInitLocale();

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<Add />} />
        <Route path="/review" element={<Review />} />
        <Route path="/dictionary" element={<Dictionary />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Register service worker for PWA offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}