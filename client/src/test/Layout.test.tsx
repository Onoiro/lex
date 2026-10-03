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
    // Each item carries an inline SVG icon instead of an emoji
    expect(container.querySelectorAll(".bottom-nav-icon svg")).toHaveLength(5);
    // Labels are plain text now, so the accessible name has no icon prefix
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
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

  it("uses short Russian labels in the mobile bottom nav", () => {
    setLocale("ru");
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: MOBILE_WIDTH,
    });

    render(
      <MemoryRouter>
        <Layout>
          <div />
        </Layout>
      </MemoryRouter>,
    );

    // Long labels do not fit a bottom-nav item on a 360px screen
    expect(screen.getByRole("link", { name: "Перевод" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ещё" })).toBeInTheDocument();
    expect(screen.queryByText("Переводчик")).not.toBeInTheDocument();
  });
});