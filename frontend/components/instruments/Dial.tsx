import { memo } from "react";

const SWEEP = 100; // degrees either side of straight up
const CX = 50;
const CY = 52;

function polar(value: number, radius: number) {
  const angle = ((value * 2 - 1) * SWEEP * Math.PI) / 180;
  return [CX + radius * Math.sin(angle), CY - radius * Math.cos(angle)] as const;
}

function arc(from: number, to: number, radius: number) {
  const [x0, y0] = polar(from, radius);
  const [x1, y1] = polar(to, radius);
  const large = (to - from) * SWEEP * 2 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const TICKS = Array.from({ length: 11 }, (_, index) => index / 10);

const Face = memo(function Face({ threshold, labels }: { threshold: number; labels: boolean }) {
  return (
    <>
      <path d={arc(0, 1, 42)} stroke="var(--foreground)" strokeWidth="1" fill="none" />
      <path d={arc(threshold, 1, 39)} stroke="var(--signal)" strokeWidth="5" fill="none" />
      {TICKS.map((tick) => {
        const major = tick === 0 || tick === 0.5 || tick === 1;
        const [x0, y0] = polar(tick, 42);
        const [x1, y1] = polar(tick, major ? 34 : 37);
        return <line key={tick} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--foreground)" strokeWidth={major ? 1.25 : 0.75} />;
      })}
      {labels &&
        [0, 0.5, 1].map((tick) => {
          const [x, y] = polar(tick, 27);
          return (
            <text key={tick} x={x} y={y + 2.5} textAnchor="middle" fontSize="6.5" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
              {tick}
            </text>
          );
        })}
    </>
  );
});

type Props = {
  value: number | null;
  threshold?: number;
  size?: number;
  labels?: boolean;
  fast?: boolean;
  title?: string;
};

/** An analogue meter. The needle carries the score, the red arc is the alert line. */
export function Dial({ value, threshold = 0.6, size = 72, labels = false, fast = false, title }: Props) {
  const angle = value == null ? -SWEEP - 6 : (value * 2 - 1) * SWEEP;
  return (
    <svg
      viewBox="0 0 100 72"
      width={size}
      height={size * 0.72}
      role="img"
      aria-label={title ?? (value == null ? "No score" : `Risk score ${value.toFixed(2)}`)}
      className="block"
    >
      <Face threshold={threshold} labels={labels} />
      <g className="needle" data-fast={fast} style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
        <line x1={CX} y1={CY + 8} x2={CX} y2={CY - 40} stroke="var(--foreground)" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <circle cx={CX} cy={CY} r="4" fill="var(--foreground)" />
      <circle cx={CX} cy={CY} r="1.25" fill="var(--dial-face)" />
    </svg>
  );
}

export function Lamp({ on, size = 8 }: { on: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className={on ? "lamp-on inline-block rounded-full" : "inline-block rounded-full"}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: on ? "var(--signal)" : "transparent",
        border: `1.5px solid ${on ? "var(--signal)" : "var(--ink-3)"}`,
      }}
    />
  );
}
