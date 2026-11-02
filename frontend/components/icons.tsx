import type { SVGProps } from "react";

// Domain icons drawn for this project on a 24px grid, 1.5px line. Phosphor covers
// generic UI; these cover the things it has no word for.
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const MeterIcon = (props: IconProps) => (
  <Glyph {...props}>
    <rect x="4" y="3" width="16" height="18" />
    <path d="M7 12a5 5 0 0 1 10 0" />
    <path d="M12 12l3-3" />
    <path d="M8 16h8M8 18.5h3" />
  </Glyph>
);

export const PylonIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 2L7 22M12 2l5 20" />
    <path d="M5 7h14M7 11h10" />
    <path d="M9 15l6 3M15 15l-6 3" />
  </Glyph>
);

/** A kunda: a hook thrown over a live line. */
export const HookIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M2 6c6 3 14 3 20 0" />
    <path d="M12 7.5V4.8c0-1.6 3-1.6 3 0" />
    <path d="M12 7.5c0 4-5 3-5 7 0 2 2 2 2 4v3" />
  </Glyph>
);

export const TransformerIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="9" cy="12" r="5.5" />
    <circle cx="15" cy="12" r="5.5" />
    <path d="M1 12h2.5M20.5 12H23" />
  </Glyph>
);

export const BreakerIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M2 16h6M16 16h6" />
    <path d="M8 16L15 9" />
    <circle cx="8" cy="16" r="1" />
    <circle cx="16" cy="16" r="1" />
  </Glyph>
);

export const FuseIcon = (props: IconProps) => (
  <Glyph {...props}>
    <rect x="5" y="8" width="14" height="8" />
    <path d="M1 12h4M19 12h4" />
    <path d="M5 12c2-3 4-3 7 0s5 3 7 0" />
  </Glyph>
);

export const WaveIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M2 12c2-6 4-6 5 0s3 6 5 0 3-6 5 0 3 6 5 0" />
  </Glyph>
);

export const ClipboardCheckIcon = (props: IconProps) => (
  <Glyph {...props}>
    <rect x="5" y="4" width="14" height="17" />
    <path d="M9 2.5h6V6H9z" />
    <path d="M8.5 13l2.5 2.5 4.5-5" />
  </Glyph>
);

export const AgentIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M5.5 5.5l3 3M15.5 15.5l3 3M18.5 5.5l-3 3M8.5 15.5l-3 3" />
  </Glyph>
);

export const DatabaseIcon = (props: IconProps) => (
  <Glyph {...props}>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.5" />
    <path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13" />
    <path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" />
  </Glyph>
);

export const StreamIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M2 7h12l3-3M2 12h20M2 17h12l3 3" />
    <path d="M19 9.5L22 12l-3 2.5" />
  </Glyph>
);
