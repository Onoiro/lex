export type MascotEmotion =
  | "base"
  | "happy"
  | "sad"
  | "hint"
  | "thinking"
  | "sleeping"
  | "tired"
  | "celebrate"
  | "empty"
  | "training"
  | "reading"
  | "mail";

export type MascotSize = "hero" | "inline" | "micro";

const SIZES: Record<MascotSize, number> = {
  hero: 140,
  inline: 48,
  micro: 32,
};

interface MascotProps {
  emotion: MascotEmotion;
  size: MascotSize;
  /** Play the bounce animation on emotion change (default true) */
  animated?: boolean;
}

/**
 * Decorative parrot mascot. Purely visual: aria-hidden, no text.
 * The `key` on the img remounts it on emotion change so the
 * bounce animation replays.
 */
export function Mascot({ emotion, size, animated = true }: MascotProps) {
  return (
    <img
      key={emotion}
      src={`/mascot/${emotion}.webp`}
      alt=""
      aria-hidden="true"
      data-testid="mascot"
      loading={size === "hero" ? "eager" : "lazy"}
      className={`mascot mascot-${size}${animated ? " mascot-bounce" : ""}`}
      style={{ width: SIZES[size], height: SIZES[size] }}
    />
  );
}
