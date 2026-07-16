import { NavLink, Link } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { to: "/add", label: "Translate" },
  { to: "/review", label: "Review" },
  { to: "/dictionary", label: "Dictionary" },
  { to: "/settings", label: "Settings" },
];

export function Layout({ children }: LayoutProps) {
  return (
    <div className="container">
      <header>
        <nav>
          <ul>
            <li>
              <Link to="/" className="contrast">
                <strong>Lex</strong>
              </Link>
            </li>
          </ul>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "secondary" : "secondary"
                  }
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
        Lex v0.1.0
      </footer>
    </div>
  );
}
