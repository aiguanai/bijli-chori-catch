import type { ReactNode } from "react";

/** Illustration: a pole, a line, and a kunda hooked over it. */
export function KundaArt({ width = 340 }: { width?: number }) {
  return (
    <svg viewBox="0 0 340 170" style={{ width, maxWidth: "100%", height: "auto" }} aria-hidden fill="none" stroke="var(--foreground)" strokeWidth="1.5">
      <path d="M36 168V18M16 26h40M22 40h28" />
      <path d="M36 18l-14 8M36 18l14 8" strokeWidth="1" />
      <path d="M304 168V18M284 26h40M290 40h28" />
      <path d="M304 18l-14 8M304 18l14 8" strokeWidth="1" />
      <path d="M16 26Q170 96 284 26" />
      <path d="M22 40Q170 112 290 40" />
      <path d="M56 26Q170 92 324 26" strokeWidth="1" stroke="var(--ink-3)" />
      <g stroke="var(--signal)" strokeWidth="2">
        <path d="M176 76c0-12 16-12 16 0" />
        <path d="M176 76c-2 34-26 26-36 54-5 14 8 20 2 38" />
      </g>
      <g fill="var(--signal)" stroke="none">
        <path d="M204 56l-8 14h6l-5 12 12-16h-6l5-10z" />
      </g>
      <path d="M0 168h340" />
    </svg>
  );
}

/** Illustration: a wire snapped in two, for when the API is down. */
function BrokenWire() {
  return (
    <svg viewBox="0 0 320 90" width={320} height={90} aria-hidden fill="none">
      <path d="M0 20C50 30 100 38 138 34c6 8 2 18 8 30" stroke="var(--foreground)" strokeWidth="1.5" />
      <path d="M320 20C270 30 220 38 188 34c-6 8 0 16-10 26" stroke="var(--foreground)" strokeWidth="1.5" />
      <path d="M150 74l6-10 2 8 8-12" stroke="var(--signal)" strokeWidth="2" />
    </svg>
  );
}

export function Offline({ message }: { message: string }) {
  return (
    <div className="sheet mx-auto mt-10 flex max-w-xl flex-col items-center gap-4 p-8 text-center">
      <BrokenWire />
      <h1 className="display text-4xl">No supply from the API</h1>
      <p className="text-ink-2">{message}</p>
      <code className="num bg-secondary px-3 py-2 text-sm">uvicorn api.main:app --reload</code>
      <p className="plate">Run from the repo root, with Postgres up</p>
    </div>
  );
}

export function Warming({ children = "Reading the meters" }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-16" role="status">
      <svg width="120" height="8" aria-hidden>
        <line x1="0" y1="4" x2="120" y2="4" stroke="var(--rule)" strokeWidth="1" />
        <line x1="0" y1="4" x2="120" y2="4" stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" className="wire-pulse" />
      </svg>
      <span className="plate">{children}</span>
    </div>
  );
}
