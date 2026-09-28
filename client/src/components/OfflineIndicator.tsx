import { useState, useEffect } from "react";
import { Mascot } from "@/components/Mascot";
import { WarnIcon } from "@/components/icons";
import { useLocale } from "@/i18n";

export function OfflineIndicator() {
  const [t] = useLocale();
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
    <article className="lex-alert lex-alert--error lex-alert--row">
      <Mascot emotion="sleeping" size="inline" animated={false} />
      <span className="lex-inline">
        <WarnIcon size={16} /> {t("offline.banner")}
      </span>
    </article>
  );
}