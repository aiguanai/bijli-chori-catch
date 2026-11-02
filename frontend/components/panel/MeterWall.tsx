"use client";

import { motion } from "motion/react";
import { memo } from "react";
import { Dial, Lamp } from "@/components/instruments/Dial";

type TileProps = {
  meterId: string;
  value: number | null;
  threshold: number;
  selected: boolean;
  fast: boolean;
  animate: boolean;
  onSelect: (meterId: string) => void;
};

const Tile = memo(function Tile({ meterId, value, threshold, selected, fast, animate, onSelect }: TileProps) {
  const over = value != null && value >= threshold;
  return (
    <motion.button
      layout={animate ? "position" : false}
      transition={{ duration: 0.3, ease: "easeOut" }}
      type="button"
      onClick={() => onSelect(meterId)}
      aria-pressed={selected}
      aria-label={`${meterId}, risk score ${value == null ? "not available" : value.toFixed(2)}${over ? ", at or above the alert level" : ""}`}
      className="group relative -ml-px -mt-px flex cursor-pointer flex-col items-center border border-foreground px-1 py-2 transition-colors hover:z-10 hover:bg-secondary hover:outline-2 hover:outline-foreground"
      style={{
        background: selected ? "var(--foreground)" : over ? "var(--signal-wash)" : undefined,
        color: selected ? "var(--card)" : undefined,
      }}
    >
      <span className="num flex w-full items-center justify-between px-1 text-[11px] font-medium">
        {meterId}
        <Lamp on={over} size={7} />
      </span>
      <span className="mt-1 w-full max-w-[84px] px-0.5" style={selected ? { filter: "invert(1) hue-rotate(180deg)" } : undefined}>
        <Dial value={value} threshold={threshold} size={80} fast={fast} title={`${meterId} dial`} />
      </span>
      <span className="num mt-0.5 text-[13px] font-semibold">{value == null ? "n/a" : value.toFixed(2)}</span>
    </motion.button>
  );
});

type WallProps = {
  name: string;
  color: string;
  meterIds: string[];
  values: Record<string, number | null>;
  threshold: number;
  selected: string | null;
  fast: boolean;
  animate: boolean;
  onSelect: (meterId: string) => void;
};

/** One city's bus with its meters hanging off it. */
export function CityBus({ name, color, meterIds, values, threshold, selected, fast, animate, onSelect }: WallProps) {
  const over = meterIds.filter((meterId) => (values[meterId] ?? 0) >= threshold).length;
  return (
    <section aria-label={`${name} meters`}>
      <div className="mb-2 flex items-center gap-3">
        <span aria-hidden className="h-3 w-3" style={{ background: color }} />
        <h3 className="display text-2xl uppercase">{name}</h3>
        <span className="plate">
          {meterIds.length} meters, {over} suspicious
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] pl-px pt-px">
        {meterIds.map((meterId) => (
          <Tile
            key={meterId}
            meterId={meterId}
            value={values[meterId] ?? null}
            threshold={threshold}
            selected={selected === meterId}
            fast={fast}
            animate={animate}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
