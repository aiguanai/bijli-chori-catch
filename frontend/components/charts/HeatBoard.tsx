"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Fleet } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { useWidth } from "@/lib/useWidth";

const ROW = 11;
const GUTTER = 44;
const STEPS = 7;

function stepOf(value: number) {
  return Math.min(STEPS - 1, Math.floor(value * STEPS));
}

/** One row per meter, one column per day, darker is riskier. Drawn on canvas: 5,000 cells. */
export function HeatBoard({
  fleet,
  order,
  day,
  selected,
  onSelect,
}: {
  fleet: Fleet;
  order: string[];
  day: number;
  selected: string | null;
  onSelect: (meterId: string) => void;
}) {
  const [box, width] = useWidth<HTMLDivElement>(900);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [theme, setTheme] = useState(0);
  const height = order.length * ROW;
  const cell = (width - GUTTER) / fleet.dates.length;

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme((count) => count + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext("2d");
    if (!node || !context || width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    node.width = width * ratio;
    node.height = height * ratio;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    const css = getComputedStyle(document.documentElement);
    const ramp = Array.from({ length: STEPS }, (_, step) => css.getPropertyValue(`--heat-${step}`));
    const ink = css.getPropertyValue("--foreground");
    const ink2 = css.getPropertyValue("--ink-2");
    context.font = `10px ${css.getPropertyValue("--font-plex-mono")}, monospace`;
    context.textBaseline = "middle";
    order.forEach((meterId, row) => {
      context.fillStyle = meterId === selected ? ink : ink2;
      context.fillText(meterId, 0, row * ROW + ROW / 2);
      fleet.scores[meterId]?.forEach((value, col) => {
        if (value == null) return;
        context.fillStyle = ramp[stepOf(value)];
        context.fillRect(GUTTER + col * cell, row * ROW, Math.max(cell - 1, 1), ROW - 1);
      });
    });
    context.fillStyle = ink;
    context.fillRect(GUTTER + day * cell - 1, 0, 2, height);
    const selectedRow = selected ? order.indexOf(selected) : -1;
    if (selectedRow >= 0) {
      context.strokeStyle = ink;
      context.lineWidth = 1.5;
      context.strokeRect(GUTTER, selectedRow * ROW - 0.5, width - GUTTER - 1, ROW);
    }
  }, [fleet, order, day, selected, width, height, cell, theme]);

  function locate(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const col = Math.floor((event.clientX - rect.left - GUTTER) / cell);
    const row = Math.floor((event.clientY - rect.top) / ROW);
    if (col < 0 || col >= fleet.dates.length || row < 0 || row >= order.length) return null;
    return { row, col };
  }

  const readout = useMemo(() => {
    if (!hover) return null;
    const meterId = order[hover.row];
    const value = fleet.scores[meterId]?.[hover.col];
    return `${meterId} on ${formatDay(fleet.dates[hover.col])}: ${value == null ? "no score" : value.toFixed(2)}`;
  }, [hover, order, fleet]);

  return (
    <div ref={box}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="plate">Score 0</span>
          <span className="flex">
            {Array.from({ length: STEPS }, (_, step) => (
              <span key={step} className="h-3 w-6" style={{ background: `var(--heat-${step})` }} />
            ))}
          </span>
          <span className="plate">1</span>
        </div>
        <span className="plate h-4 text-foreground">{readout}</span>
      </div>
      <canvas
        ref={canvas}
        style={{ width, height }}
        className="block cursor-pointer"
        role="img"
        aria-label={`Daily risk scores for ${order.length} meters. Switch to dials for one reading per meter.`}
        onPointerMove={(event) => setHover(locate(event))}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          const spot = locate(event as unknown as React.PointerEvent<HTMLCanvasElement>);
          if (spot) onSelect(order[spot.row]);
        }}
      />
    </div>
  );
}
