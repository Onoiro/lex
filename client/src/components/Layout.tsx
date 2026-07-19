import { NavLink, Link } from "react-router-dom";
import { useLocale } from "@/i18n";

const APP_VERSION = "1.0.0";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [t] = useLocale();

  const navItems = [
    { to: "/add", label: t("nav.translate") },
    { to: "/review", label: t("nav.review") },
    { to: "/dictionary", label: t("nav.dictionary") },
    { to: "/settings", label: t("nav.settings"), title: t("nav.settings.title") },
  ];

  return (
    <div className="container">
      <header>
        <nav>
          <ul>
            <li>
              <Link to="/" className="contrast">
                <strong>{t("nav.home")}</strong>
              </Link>
            </li>
          </ul>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => (isActive ? "" : "secondary")}
                  title={item.title}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main>{children}</main>

      <footer
        style={{
          position: "fixed",
          left: 0,
          bottom: 0,
          right: 0,
          margin: 0,
          padding: "0.75rem",
          background: "var(--pico-background-color)",
          color: "var(--pico-muted-color)",
          textAlign: "center",
          borderTop: "1px solid var(--pico-muted-border-color)",
          fontSize: "0.85rem",
          zIndex: 100,
        }}
      >
        {t("footer.version", { version: APP_VERSION })}
      </footer>
    </div>
  );
}