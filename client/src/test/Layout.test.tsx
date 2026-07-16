import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "@/components/Layout";

describe("Layout", () => {
  it("renders navigation links", () => {
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
    expect(screen.getByText("Settings")).toBeInTheDocument();
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

    expect(screen.getByText(/Lex v0\.1\.0/)).toBeInTheDocument();
  });
});
