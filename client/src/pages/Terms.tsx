import { useLocale } from "@/i18n";

export function Terms() {
  const [t] = useLocale();

  return (
    <>
      <h2 style={{ textAlign: "center" }}>{t("terms.title")}</h2>
      <p style={{ textAlign: "center", color: "var(--pico-muted-color)", marginBottom: "2rem" }}>
        {t("terms.updated")}
      </p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.acceptance")}</h3>
        <p>{t("terms.acceptance_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.service_description")}</h3>
        <p>{t("terms.service_description_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.warranty")}</h3>
        <p>{t("terms.warranty_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.user_responsibility")}</h3>
        <p>{t("terms.user_responsibility_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.intellectual_property")}</h3>
        <p>{t("terms.intellectual_property_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.liability")}</h3>
        <p>{t("terms.liability_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.changes")}</h3>
        <p>{t("terms.changes_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.governing_law")}</h3>
        <p>{t("terms.governing_law_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.age")}</h3>
        <p>{t("terms.age_text")}</p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>{t("terms.contact")}</h3>
        <p>{t("terms.contact_text")}</p>
      </section>
    </>
  );
}
