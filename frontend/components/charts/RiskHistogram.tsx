"use client";

import { scaleLinear } from "d3-scale";
import { useMemo, useRef, useState } from "react";
import { useWidth } from "@/lib/useWidth";

const BINS = 20;
const HEIGHT = 216;
const M = { top: 26, right: 12, bottom: 24, left: 12 };

type Props = {
  values: number[];
  threshold: number;
  onThreshold: (value: number) => void;
};

/** How many meters sit at each score. Drag the line to move the alert level. */
export function RiskHistogram({ values, threshold, onThreshold }: Props) {
  const [box, width] = useWidth<HTMLDivElement>(640);
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const bins = useMemo(() => {
    const counts = new Array<number>(BINS).fill(0);
    for (const value of values) counts[Math.min(BINS - 1, Math.floor(value * BINS))] += 1;
    return counts;
  }, [values]);

  const x = scaleLinear().domain([0, 1]).range([M.left, width - M.right]);
  const y = scaleLinear().domain([0, Math.max(...bins, 1)]).range([HEIGHT - M.bottom, M.top]);
  const slot = (x(1) - x(0)) / BINS;
  const barWidth = Math.min(slot - 2, 24);

  function fromPointer(event: React.PointerEvent) {
    const left = svg.current?.getBoundingClientRect().left ?? 0;
    const value = x.invert(event.clientX - left);
    onThreshold(Math.round(Math.min(0.99, Math.max(0.05, value)) * 100) / 100);
  }

  const readout =
    hover == null
      ? null
      : `${(hover / BINS).toFixed(2)} to ${((hover + 1) / BINS).toFixed(2)}: ${bins[hover]} ${bins[hover] === 1 ? "meter" : "meters"}`;

  return (
    <div ref={box} className="relative">
      <div className="plate absolute right-0 top-0 h-4 text-right text-foreground" aria-live="polite">
        {readout}
      </div>
      <svg
        ref={svg}
        width={width}
        height={HEIGHT}
        className="block touch-none select-none"
        role="group"
        aria-label={`Histogram of risk scores for ${values.length} meters`}
        onPointerMove={(event) => {
          if (dragging) fromPointer(event);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <text key={tick} x={x(tick)} y={HEIGHT - 6} textAnchor={tick === 0 ? "start" : tick === 1 ? "end" : "middle"} fontSize="11" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
            {tick}
          </text>
        ))}
        <line x1={x(0)} x2={x(1)} y1={y(0)} y2={y(0)} stroke="var(--foreground)" />
        {bins.map((count, index) => {
          const left = x(index / BINS) + (slot - barWidth) / 2;
          const over = (index + 0.5) / BINS >= threshold;
          const top = count ? Math.min(y(count), y(0) - 3) : y(0);
          return (
            <g key={index} onPointerEnter={() => setHover(index)}>
              <rect x={x(index / BINS)} y={M.top} width={slot} height={y(0) - M.top} fill="transparent" />
              {count > 0 && (
                <path
                  d={`M${left} ${y(0)}V${top + 2}q0 -2 2 -2H${left + barWidth - 2}q2 0 2 2V${y(0)}z`}
                  fill={over ? "var(--signal)" : "var(--ink-3)"}
                  opacity={hover == null || hover === index ? 1 : 0.7}
                />
              )}
              {over && count > 0 && (
                <text x={left + barWidth / 2} y={top - 5} textAnchor="middle" fontSize="11" fill="var(--foreground)" fontFamily="var(--font-plex-mono)">
                  {count}
                </text>
              )}
            </g>
          );
        })}
        <g
          role="slider"
          tabIndex={0}
          aria-label="Alert line"
          aria-valuemin={0.05}
          aria-valuemax={0.99}
          aria-valuenow={threshold}
          style={{ cursor: "ew-resize" }}
          onPointerDown={(event) => {
            setDragging(true);
            svg.current?.setPointerCapture(event.pointerId);
          }}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" ? 0.01 : event.key === "ArrowLeft" ? -0.01 : 0;
            if (step) {
              event.preventDefault();
              onThreshold(Math.round(Math.min(0.99, Math.max(0.05, threshold + step)) * 100) / 100);
            }
          }}
        >
          <rect x={x(threshold) - 14} y={0} width={28} height={y(0)} fill="transparent" />
          <line x1={x(threshold)} x2={x(threshold)} y1={16} y2={y(0)} stroke="var(--foreground)" strokeWidth="2" />
          <rect x={x(threshold) - 22} y={0} width={44} height={18} fill="var(--foreground)" />
          <path d={`M${x(threshold) - 28} 4l-6 5 6 5zM${x(threshold) + 28} 4l6 5-6 5z`} fill="var(--foreground)" />
          <text x={x(threshold)} y={13} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--card)" fontFamily="var(--font-plex-mono)">
            {threshold.toFixed(2)}
          </text>
        </g>
      </svg>
    </div>
  );
}
