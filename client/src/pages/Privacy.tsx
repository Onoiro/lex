import { useLocale } from "@/i18n";

export function Privacy() {
  const [t] = useLocale();

  return (
    <>
      <h2 style={{ textAlign: "center" }}>{t("privacy.title")}</h2>
      <p style={{ textAlign: "center", color: "var(--pico-muted-color)", marginBottom: "2rem" }}>
        {t("privacy.updated")}
      </p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.overview")}</h3>
        <p>{t("privacy.overview_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.local_storage")}</h3>
        <p>{t("privacy.local_storage_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.data_transmitted")}</h3>
        <p>{t("privacy.data_transmitted_intro")}</p>
        <ul>
          <li>
            <strong>{t("privacy.data_translate")}</strong> — {t("privacy.data_translate_desc")}
          </li>
          <li>
            <strong>{t("privacy.data_dictionary")}</strong> — {t("privacy.data_dictionary_desc")}
          </li>
          <li>
            <strong>{t("privacy.data_tts")}</strong> — {t("privacy.data_tts_desc")}
          </li>
          <li>
            <strong>{t("privacy.data_feedback")}</strong> — {t("privacy.data_feedback_desc")}
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.ip_address")}</h3>
        <p>{t("privacy.ip_address_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.proxy_cache")}</h3>
        <p>{t("privacy.proxy_cache_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.third_parties")}</h3>
        <p>{t("privacy.third_parties_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.analytics")}</h3>
        <p>{t("privacy.analytics_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.advertising")}</h3>
        <p>{t("privacy.advertising_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.data_deletion")}</h3>
        <p>{t("privacy.data_deletion_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.age")}</h3>
        <p>{t("privacy.age_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("privacy.contact")}</h3>
        <p>{t("privacy.contact_text")}</p>
      </section>
    </>
  );
}
