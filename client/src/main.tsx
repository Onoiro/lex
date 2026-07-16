import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
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

// Configure native plugins (Android only, no-op on web)
async function setupNativePlugins() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Default });
    await StatusBar.setBackgroundColor({ color: "#1095C1" });
  } catch {
    // StatusBar not available on this platform
  }

  try {
    await SplashScreen.hide();
  } catch {
    // SplashScreen not available
  }
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

// Initialize native plugins
void setupNativePlugins();