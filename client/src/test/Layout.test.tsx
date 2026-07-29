import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { setLocale } from "@/i18n";

const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 375;

describe("Layout", () => {
  beforeEach(() => {
    setLocale("en");
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: DESKTOP_WIDTH,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: DESKTOP_WIDTH,
    });
  });

  it("renders navigation links in English", () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>Test content</div>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByText("Lex")).toBeInTheDocument();
    expect(screen.getByText("Translate")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Dictionary")).toBeInTheDocument();
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("renders bottom nav icons on mobile", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: MOBILE_WIDTH,
    });

    const { container } = render(
      <MemoryRouter>
        <Layout>
          <div />
        </Layout>
      </MemoryRouter>,
    );

    // Bottom nav should be visible on mobile
    expect(container.querySelectorAll(".bottom-nav-item")).toHaveLength(5);
    expect(screen.getByText("🏠")).toBeInTheDocument();
    expect(screen.getByText("🌍")).toBeInTheDocument();
    expect(screen.getByText("🧠")).toBeInTheDocument();
    expect(screen.getByText("📖")).toBeInTheDocument();
    // Settings link with title
    expect(screen.getByRole("link", { name: "⚙ Settings" })).toBeInTheDocument();
  });

  it("renders desktop nav on desktop", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: DESKTOP_WIDTH,
    });

    render(
      <MemoryRouter>
        <Layout>
          <div />
        </Layout>
      </MemoryRouter>,
    );

    // Desktop nav links
    expect(screen.getByText("Lex")).toBeInTheDocument();
    expect(screen.getByText("Translate")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Dictionary")).toBeInTheDocument();
  });

  it("renders navigation links in Russian", () => {
    setLocale("ru");

    render(
      <MemoryRouter>
        <Layout>
          <div />
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByText("Переводчик")).toBeInTheDocument();
    expect(screen.getByText("Повтор")).toBeInTheDocument();
    expect(screen.getByText("Словарь")).toBeInTheDocument();
  });
});