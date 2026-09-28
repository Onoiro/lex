import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import { useLocale } from "@/i18n";
import {
  HomeIcon,
  GlobeIcon,
  BrainIcon,
  BookIcon,
  GearIcon,
} from "@/components/icons";

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
    { to: "/", label: t("nav.home_label"), Icon: HomeIcon },
    { to: "/add", label: t("nav.translate"), Icon: GlobeIcon },
    { to: "/review", label: t("nav.review"), Icon: BrainIcon },
    { to: "/dictionary", label: t("nav.dictionary"), Icon: BookIcon },
    {
      to: "/settings",
      label: t("nav.settings"),
      Icon: GearIcon,
      title: t("nav.settings.title"),
    },
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
        <nav className="bottom-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.title}
              className={({ isActive }) =>
                `bottom-nav-item${isActive ? " active" : ""}`
              }
            >
              <span className="bottom-nav-icon">
                <item.Icon />
              </span>
              <span className="bottom-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
