import { useState, useEffect } from "react";
import { Mascot } from "@/components/Mascot";

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
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
      }}
    >
      <Mascot emotion="sleeping" size="inline" animated={false} />
      <span>⚠️ Offline — translation requires internet connection</span>
    </article>
  );
}
