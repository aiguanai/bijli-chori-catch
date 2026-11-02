"use client";

import { useRef, useState } from "react";

const SWEEP = 135;
const TICKS = Array.from({ length: 21 }, (_, index) => -SWEEP + (index * SWEEP) / 10);

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  label: string;
  size?: number;
};

/** Rotary control. Drag round it or use the arrow keys. */
export function Knob({ value, min, max, onChange, onCommit, label, size = 132 }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  const angleOf = (next: number) => ((next - min) / (max - min)) * SWEEP * 2 - SWEEP;

  function fromPointer(event: React.PointerEvent) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return value;
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const bounded = Math.max(-SWEEP, Math.min(SWEEP, angle));
    return clamp(min + ((bounded + SWEEP) / (SWEEP * 2)) * (max - min));
  }

  return (
    <svg
      ref={ref}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className="shrink-0 touch-none select-none"
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        onChange(fromPointer(event));
      }}
      onPointerMove={(event) => {
        if (dragging) onChange(fromPointer(event));
      }}
      onPointerUp={(event) => {
        setDragging(false);
        onCommit(fromPointer(event));
      }}
      onKeyDown={(event) => {
        const step = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 } as Record<string, number>)[event.key];
        if (step) {
          event.preventDefault();
          const next = clamp(value + step);
          onChange(next);
          onCommit(next);
        }
      }}
    >
      {TICKS.map((angle, index) => {
        const lit = angle <= angleOf(value);
        return (
          <line
            key={index}
            x1="60"
            x2="60"
            y1="4"
            y2={index % 5 === 0 ? 13 : 10}
            stroke={lit ? "var(--signal)" : "var(--ink-3)"}
            strokeWidth={lit ? 2 : 1}
            transform={`rotate(${angle} 60 60)`}
          />
        );
      })}
      <circle cx="60" cy="60" r="40" fill="var(--secondary)" stroke="var(--foreground)" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="33" fill="var(--dial-face)" stroke="var(--foreground)" strokeWidth="0.75" />
      <line x1="60" x2="60" y1="21" y2="33" stroke="var(--signal)" strokeWidth="3" transform={`rotate(${angleOf(value)} 60 60)`} />
      <text x="60" y="69" textAnchor="middle" fontSize="25" fontWeight="600" fill="var(--foreground)" fontFamily="var(--font-plex-sans)">
        {value}
      </text>
    </svg>
  );
}
