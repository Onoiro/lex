/* Inline SVG icons. Rules for this file:
   - stroke="currentColor" so icons follow the theme and the text color;
   - fill="none", 24x24 viewBox, stroke-width 1.8 — one visual weight;
   - aria-hidden: every icon is decorative, the accessible name comes from
     the surrounding button/link (aria-label or visible text);
   - no icon packages: these shapes are simple geometry, kept in-repo so the
     bundle stays dependency-free and offline-safe. */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 20,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-6h4v6" />
    </Svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </Svg>
  );
}

export function BrainIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4.5A2.5 2.5 0 0 0 6.5 7 2.5 2.5 0 0 0 4 9.5c0 .9.5 1.7 1.2 2.1A2.6 2.6 0 0 0 5 14c0 1.4 1.1 2.5 2.5 2.5.2 1.1 1.2 2 2.4 2 .7 0 1.3-.3 1.7-.8V5.6A2.4 2.4 0 0 0 9 4.5Z" />
      <path d="M15 4.5A2.5 2.5 0 0 1 17.5 7 2.5 2.5 0 0 1 20 9.5c0 .9-.5 1.7-1.2 2.1.2.4.2.9.2 1.4 0 1.4-1.1 2.5-2.5 2.5-.2 1.1-1.2 2-2.4 2-.7 0-1.3-.3-1.7-.8" />
      <path d="M12 5.6V18" />
    </Svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z" />
      <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v3H5.5A1.5 1.5 0 0 1 4 19.5Z" />
      <path d="M8 7.5h7" />
    </Svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </Svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function SwapIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h13" />
      <path d="M14 5l3 3-3 3" />
      <path d="M20 16H7" />
      <path d="M10 13l-3 3 3 3" />
    </Svg>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9.5h3L12 5v14l-5-4.5H4v-5Z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </Svg>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9.5h3L12 5v14l-5-4.5H4v-5Z" />
      <path d="M16.5 10l4 4M20.5 10l-4 4" />
    </Svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 2.5 5 13.5h5l-1 8 8-11h-5l1-8Z" />
    </Svg>
  );
}

export function BulbIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 17a6 6 0 1 1 6 0v1.5H9V17Z" />
      <path d="M10 21h4" />
    </Svg>
  );
}

export function WarnIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 21.5 20H2.5L12 3.5Z" />
      <path d="M12 9.5v5" />
      <path d="M12 17.2h.01" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function ExportIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15V4" />
      <path d="M8.5 7.5 12 4l3.5 3.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Svg>
  );
}

export function ImportIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v11" />
      <path d="M8.5 11.5 12 15l3.5-3.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </Svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20V4" />
      <path d="M6 10l6-6 6 6" />
    </Svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v16" />
      <path d="M6 14l6 6 6-6" />
    </Svg>
  );
}

export function FireIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3s4 3.5 4 8a4 4 0 0 1-8 0c0-1.2.5-2.2 1-3-.3 1.3.4 2.3 1.2 2.5C9.5 8 12 6 12 3Z" />
      <path d="M8.5 13.5A5.5 5.5 0 0 0 12 21a5.5 5.5 0 0 0 3.5-7.5" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function HourglassIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3h10M7 21h10" />
      <path d="M8 3v3.5L12 11l4-4.5V3" />
      <path d="M8 21v-3.5L12 13l4 4.5V21" />
    </Svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V7M17 20v-9" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5.5h16v11H9l-5 4v-15Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </Svg>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 2-1.8 0-1.3 1-1.9 2.2-1.9h1.6c1.8 0 2.7-1.2 2.7-3.1A8.5 8.5 0 0 0 12 3.5Z" />
      <path d="M8 9.5h.01M12 7.5h.01M15.5 9.5h.01M7.5 13.5h.01" />
    </Svg>
  );
}
