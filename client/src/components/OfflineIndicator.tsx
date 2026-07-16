import { useState, useEffect } from "react";

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <article
      style={{
        background: "var(--pico-del-color)",
        color: "var(--pico-primary-inverse)",
        padding: "0.75rem 1rem",
        marginBottom: "1rem",
        fontSize: "0.9rem",
        textAlign: "center",
      }}
    >
      ⚠️ Offline — translation requires internet connection
    </article>
  );
}
