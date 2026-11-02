"use client";

import { scaleLinear } from "d3-scale";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useWidth } from "@/lib/useWidth";

const R = 4;
const HEIGHT = 96;
const BASE = HEIGHT - 22;

type Point = { id: string; value: number };

/** A beeswarm: every peer as a dot, stacked where they would overlap. Click to jump. */
export function PeerStrip({ points, focus, domain, unit = "" }: { points: Point[]; focus: string; domain: [number, number]; unit?: string }) {
  const [box, width] = useWidth<HTMLDivElement>(320);
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const x = useMemo(() => scaleLinear().domain(domain).range([10, width - 10]).clamp(true), [domain, width]);

  const placed = useMemo(() => {
    const taken: { x: number; level: number }[] = [];
    return [...points]
      .sort((a, b) => a.value - b.value)
      .map((point) => {
        const px = x(point.value);
        let level = 0;
        while (taken.some((spot) => spot.level === level && Math.abs(spot.x - px) < R * 2 + 1)) level += 1;
        taken.push({ x: px, level });
        return { ...point, px, py: BASE - 6 - level * (R * 2 - 1) };
      });
  }, [points, x]);

  const active = placed.find((point) => point.id === (hover ?? focus));

  return (
    <div ref={box}>
      <svg width={width} height={HEIGHT} className="block overflow-visible" role="img" aria-label={`${focus} among ${points.length} meters in its city`}>
        <line x1={0} x2={width} y1={BASE} y2={BASE} stroke="var(--foreground)" />
        {placed.map((point) => {
          const isFocus = point.id === focus;
          return (
            <circle
              key={point.id}
              cx={point.px}
              cy={point.py}
              r={isFocus ? R + 1.5 : R}
              fill={isFocus ? "var(--signal)" : point.id === hover ? "var(--foreground)" : "var(--ink-3)"}
              stroke="var(--card)"
              strokeWidth="1.5"
              className="cursor-pointer"
              onPointerEnter={() => setHover(point.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => router.push(`/meters/${point.id}`)}
            />
          );
        })}
        {active && (
          <text
            x={Math.max(30, Math.min(width - 30, active.px))}
            y={12}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="600"
            fill="var(--foreground)"
            fontFamily="var(--font-plex-mono)"
          >
            {active.id} {active.value.toFixed(2)}
            {unit}
          </text>
        )}
        {domain.map((tick, index) => (
          <text key={index} x={x(tick)} y={BASE + 14} textAnchor={index ? "end" : "start"} fontSize="11" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
            {tick}
            {unit}
          </text>
        ))}
      </svg>
    </div>
  );
}
