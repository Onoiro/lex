import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Mascot } from "@/components/Mascot";
import type { MascotEmotion, MascotSize } from "@/components/Mascot";

const EMOTIONS: MascotEmotion[] = [
  "base",
  "happy",
  "sad",
  "hint",
  "thinking",
  "sleeping",
  "tired",
  "celebrate",
  "empty",
  "training",
  "reading",
  "mail",
];

describe("Mascot", () => {
  it("renders every emotion with the right src", () => {
    for (const emotion of EMOTIONS) {
      const { unmount } = render(<Mascot emotion={emotion} size="inline" />);
      const img = screen.getByTestId("mascot");
      expect(img).toHaveAttribute("src", `/mascot/${emotion}.webp`);
      unmount();
    }
  });

  it("applies size dimensions", () => {
    const sizes: Record<MascotSize, number> = { hero: 140, inline: 48, micro: 32 };
    for (const [size, px] of Object.entries(sizes) as [MascotSize, number][]) {
      const { unmount } = render(<Mascot emotion="base" size={size} />);
      const img = screen.getByTestId("mascot");
      expect(img.style.width).toBe(`${px}px`);
      expect(img.style.height).toBe(`${px}px`);
      unmount();
    }
  });

  it("is decorative: aria-hidden and empty alt", () => {
    render(<Mascot emotion="happy" size="hero" />);
    const img = screen.getByTestId("mascot");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("alt", "");
  });

  it("loads hero eagerly and other sizes lazily", () => {
    const { unmount } = render(<Mascot emotion="base" size="hero" />);
    expect(screen.getByTestId("mascot")).toHaveAttribute("loading", "eager");
    unmount();

    render(<Mascot emotion="base" size="inline" />);
    expect(screen.getByTestId("mascot")).toHaveAttribute("loading", "lazy");
  });

  it("adds the bounce class when animated and skips it when disabled", () => {
    const { unmount } = render(<Mascot emotion="base" size="inline" />);
    expect(screen.getByTestId("mascot").className).toContain("mascot-bounce");
    unmount();

    render(<Mascot emotion="base" size="inline" animated={false} />);
    expect(screen.getByTestId("mascot").className).not.toContain("mascot-bounce");
  });
});
