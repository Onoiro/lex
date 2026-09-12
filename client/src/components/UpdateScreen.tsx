import { Capacitor } from "@capacitor/core";
import { t } from "@/i18n";

// Store/download links for the "update the app" screen. Baked in at
// build time; empty values hide the corresponding button.
const RUSTORE_URL = import.meta.env.VITE_RUSTORE_URL ?? "";
const DOWNLOAD_URL = import.meta.env.VITE_DOWNLOAD_URL ?? "";

/**
 * Full-screen "update the app" gate. Shown when the proxy reports the
 * client version as outdated (426 update_required). Offers a store link
 * depending on the platform and a reload button (enough for PWA, where
 * the service worker picks up the new bundle on reload).
 */
export function UpdateScreen() {
  const platform = Capacitor.getPlatform();

  return (
    <main className="container">
      <div>
        <h1>{t("update.title")}</h1>
        <p>{t("update.message")}</p>
        {platform === "android" && RUSTORE_URL && (
          <p>
            <a href={RUSTORE_URL} target="_blank" rel="noreferrer">
              {t("update.rustore")}
            </a>
          </p>
        )}
        {platform !== "android" && DOWNLOAD_URL && (
          <p>
            <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
              {t("update.download")}
            </a>
          </p>
        )}
        <p>
          <button onClick={() => window.location.reload()}>
            {t("update.reload")}
          </button>
        </p>
        <p>
          <small>{t("update.hint")}</small>
        </p>
      </div>
    </main>
  );
}
