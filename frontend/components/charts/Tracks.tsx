"use client";

import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useMemo, useState } from "react";
import type { Features, HistoryDay } from "@/lib/api";
import { formatDay, formatShortDay } from "@/lib/format";
import { useWidth } from "@/lib/useWidth";

const RAIL = 168;
const NARROW_RAIL = 92;
const NARROW_AT = 560; // below this the notes go, so the plot keeps its width
const ROW = 104;
const PAD = 8;

type Series = { id: string; get: (day: HistoryDay) => number | null; width?: number; color?: string };

type TrackSpec = {
  title: string;
  unit: string;
  digits: number;
  domain: (days: HistoryDay[]) => [number, number];
  primary: (day: HistoryDay) => number | null;
  bars?: boolean;
  wash?: boolean;
  lines?: Series[];
  band?: [number, number];
  bandLabel?: string;
  reference?: { at: number; label: string };
  note?: string;
};

const feature = (key: keyof Features) => (day: HistoryDay) => day.features?.[key] ?? null;

function ceiling(days: HistoryDay[], get: (day: HistoryDay) => number | null, floor: number) {
  return Math.max(floor, ...days.map((day) => get(day) ?? 0)) * 1.08;
}

const TRACKS: TrackSpec[] = [
  {
    title: "Risk score",
    unit: "",
    digits: 2,
    domain: () => [0, 1],
    primary: (day) => day.risk_score,
    wash: true,
    lines: [{ id: "risk", get: (day) => day.risk_score, width: 2, color: "var(--signal)" }],
  },
  {
    title: "Daily use",
    unit: "kWh",
    digits: 2,
    domain: (days) => [0, ceiling(days, feature("daily_kwh"), 1)],
    primary: feature("daily_kwh"),
    bars: true,
    lines: [
      { id: "7d", get: feature("kwh_7d_mean"), width: 2, color: "var(--foreground)" },
      { id: "30d", get: feature("kwh_30d_mean"), width: 1, color: "var(--foreground)" },
    ],
    note: "Bars: each day. Heavy line: 7-day mean. Thin line: 30-day mean.",
  },
  {
    title: "Use vs city",
    unit: "x",
    digits: 2,
    domain: (days) => [0, ceiling(days, feature("peer_ratio_7d"), 2)],
    primary: feature("peer_ratio_7d"),
    lines: [{ id: "ratio", get: feature("peer_ratio_7d"), width: 2, color: "var(--foreground)" }],
    reference: { at: 1, label: "city median" },
    note: "7-day mean of daily use as a multiple of the city median.",
  },
  {
    title: "Zero readings",
    unit: "share",
    digits: 2,
    domain: (days) => [0, ceiling(days, feature("zero_share"), 0.3)],
    primary: feature("zero_share"),
    lines: [{ id: "zero", get: feature("zero_share"), width: 2, color: "var(--foreground)" }],
    note: "Share of supply-on readings at zero.",
  },
  {
    title: "Night share",
    unit: "share",
    digits: 2,
    domain: () => [0, 1],
    primary: feature("night_share"),
    lines: [{ id: "night", get: feature("night_share"), width: 2, color: "var(--foreground)" }],
    note: "Share of the day's kWh used from 22:00 to 06:00.",
  },
  {
    title: "Power cuts",
    unit: "min",
    digits: 0,
    domain: (days) => [0, ceiling(days, feature("power_cut_minutes"), 120)],
    primary: feature("power_cut_minutes"),
    bars: true,
    note: "A supply event, not customer behaviour.",
  },
  {
    title: "Voltage",
    unit: "V",
    digits: 1,
    domain: () => [200, 270],
    primary: feature("avg_voltage"),
    lines: [{ id: "voltage", get: feature("avg_voltage"), width: 2, color: "var(--foreground)" }],
    band: [207, 253],
    bandLabel: "207 to 253 V",
    note: "Most honest homes sit high, so this alone proves nothing.",
  },
];

function Track({ spec, days, width, rail, hover }: { spec: TrackSpec; days: HistoryDay[]; width: number; rail: number; hover: number | null }) {
  const x = scaleLinear().domain([0, Math.max(days.length - 1, 1)]).range([6, width - 6]);
  const y = scaleLinear().domain(spec.domain(days)).range([ROW - PAD, PAD]);
  const bar = Math.max(Math.min(((width - 12) / days.length) * 0.65, 12), 1.5);
  const reading = spec.primary(days[hover ?? days.length - 1]);
  const [low] = y.domain();
  const wash = spec.wash
    ? area<HistoryDay>().x((_, index) => x(index)).y0(y(low)).y1((day) => y(spec.primary(day) ?? 0))(days)
    : null;

  return (
    <div className="grid border-b border-rule" style={{ gridTemplateColumns: `${rail}px minmax(0,1fr)`, height: ROW }}>
      <div className="flex flex-col justify-center border-r border-rule pr-3">
        <p className="plate">{spec.title}</p>
        <p className="num text-xl font-medium leading-tight">
          {reading == null ? "n/a" : reading.toFixed(spec.digits)}
          {reading != null && spec.unit && spec.unit !== "share" && <span className="ml-1 text-xs text-ink-2">{spec.unit}</span>}
        </p>
        {spec.note && rail === RAIL && <p className="text-[11px] leading-tight text-ink-2">{spec.note}</p>}
      </div>
      <svg width={width} height={ROW} className="block overflow-visible" aria-hidden>
        {spec.band && <rect x={0} width={width} y={y(spec.band[1])} height={y(spec.band[0]) - y(spec.band[1])} fill="var(--secondary)" />}
        {spec.band && (
          <text x={width - 4} y={y(spec.band[1]) + 11} textAnchor="end" fontSize="10" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
            {spec.bandLabel}
          </text>
        )}
        <line x1={0} x2={width} y1={y(low)} y2={y(low)} stroke="var(--rule)" />
        {spec.reference && (
          <>
            <line x1={0} x2={width} y1={y(spec.reference.at)} y2={y(spec.reference.at)} stroke="var(--ink-3)" />
            <text x={width - 4} y={y(spec.reference.at) - 4} textAnchor="end" fontSize="10" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
              {spec.reference.label}
            </text>
          </>
        )}
        {wash && <path d={wash} fill="var(--signal)" opacity="0.1" />}
        {spec.bars &&
          days.map((day, index) => {
            const value = spec.primary(day);
            if (value == null) return null;
            return (
              <rect
                key={day.scored_at}
                x={x(index) - bar / 2}
                width={bar}
                y={y(value)}
                height={Math.max(y(low) - y(value), 0)}
                fill={index === hover ? "var(--foreground)" : "var(--ink-3)"}
                opacity={spec.lines ? 0.45 : 1}
              />
            );
          })}
        {spec.lines?.map((series) => {
          const path = line<HistoryDay>()
            .defined((day) => series.get(day) != null)
            .x((_, index) => x(index))
            .y((day) => y(series.get(day) ?? 0))(days);
          return <path key={series.id} d={path ?? ""} fill="none" stroke={series.color} strokeWidth={series.width} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {hover != null && spec.lines?.slice(0, 1).map((series) => {
          const value = series.get(days[hover]);
          return value == null ? null : <circle key={series.id} cx={x(hover)} cy={y(value)} r="4" fill={series.color} stroke="var(--card)" strokeWidth="2" />;
        })}
      </svg>
    </div>
  );
}

/** Stacked tracks on one time axis, one crosshair. Values read out in the left rail. */
export function Tracks({ days }: { days: HistoryDay[] }) {
  const [box, full] = useWidth<HTMLDivElement>(800);
  const [hover, setHover] = useState<number | null>(null);
  const rail = full < NARROW_AT ? NARROW_RAIL : RAIL;
  const width = Math.max(full - rail, 120);
  const x = useMemo(() => scaleLinear().domain([0, Math.max(days.length - 1, 1)]).range([6, width - 6]), [days.length, width]);
  const ticks = days.flatMap((day, index) => (index % Math.max(1, Math.ceil(days.length / 6)) === 0 ? [{ day, index }] : []));
  const shown = days[hover ?? days.length - 1];

  return (
    <div ref={box} className="relative">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="plate">{hover == null ? "Latest day" : "Day under the cursor"}</p>
        <p className="text-sm font-semibold">{formatDay(shown.scored_at)}</p>
      </div>
      <div className="border-t border-foreground">
        {TRACKS.map((spec) => (
          <Track key={spec.title} spec={spec} days={days} width={width} rail={rail} hover={hover} />
        ))}
      </div>
      <svg width={width} height={22} className="block" style={{ marginLeft: rail }} aria-hidden>
        {ticks.map(({ day, index }) => (
          <text key={day.scored_at} x={x(index)} y={15} textAnchor={index === 0 ? "start" : "middle"} fontSize="11" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
            {formatShortDay(day.scored_at)}
          </text>
        ))}
      </svg>
      <div
        className="absolute bottom-[22px] touch-none"
        style={{ left: rail, width, top: 36 }}
        onPointerMove={(event) => {
          const left = event.currentTarget.getBoundingClientRect().left;
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(x.invert(event.clientX - left)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {hover != null && <span className="pointer-events-none absolute inset-y-0 w-px bg-foreground" style={{ left: x(hover) }} />}
      </div>
    </div>
  );
}
