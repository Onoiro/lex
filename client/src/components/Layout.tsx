import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import { useLocale } from "@/i18n";

interface LayoutProps {
  children: React.ReactNode;
}

const MOBILE_BREAKPOINT = 768;

export function Layout({ children }: LayoutProps) {
  const [t] = useLocale();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const navItems = [
    { to: "/", label: t("nav.home_label"), icon: "🏠" },
    { to: "/add", label: t("nav.translate"), icon: "🌍" },
    { to: "/review", label: t("nav.review"), icon: "🧠" },
    { to: "/dictionary", label: t("nav.dictionary"), icon: "📖" },
    { to: "/settings", label: t("nav.settings"), icon: "⚙", title: t("nav.settings.title") },
  ];

  // Desktop already has a brand link to "/", skip it in the nav items
  const desktopNavItems = navItems.filter((item) => item.to !== "/");

  return (
    <div className="container">
      {/* Top nav — desktop only */}
      {!isMobile && (
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
              {desktopNavItems.map((item) => (
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
      )}

      <main>{children}</main>

      {/* Bottom nav — mobile only */}
      {isMobile && (
        <nav
          className="bottom-nav"
          style={{
            position: "fixed",
            left: 0,
            bottom: 0,
            right: 0,
            margin: 0,
            borderTop: "1px solid var(--pico-muted-border-color)",
            background: "var(--pico-background-color)",
            zIndex: 100,
            display: "flex",
            justifyContent: "space-around",
            padding: "0.25rem 0",
          }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.title}
              className={({ isActive }) =>
                `bottom-nav-item${isActive ? " active" : ""}`
              }
            >
              <span className="bottom-nav-icon">{item.icon}</span>
              <span className="bottom-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}