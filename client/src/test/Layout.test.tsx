import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { setLocale } from "@/i18n";

describe("Layout", () => {
  beforeEach(() => {
    setLocale("en");
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

  it("renders footer with version", () => {
    render(
      <MemoryRouter>
        <Layout>
          <div />
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Lex v1\.1\.0/)).toBeInTheDocument();
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