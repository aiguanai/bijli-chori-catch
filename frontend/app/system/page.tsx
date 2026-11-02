"use client";

import { useReducedMotion } from "motion/react";
import { type ComponentType, useState } from "react";
import { AgentIcon, BreakerIcon, ClipboardCheckIcon, DatabaseIcon, MeterIcon, StreamIcon, WaveIcon } from "@/components/icons";
import { useStatus } from "@/lib/api";

type Stage = {
  id: string;
  title: string;
  Icon: ComponentType<{ size?: number }>;
  x: number;
  y: number;
  owner: string;
  what: string;
  why: string;
  stream?: boolean;
};

const READINGS_PER_DAY = (24 * 60) / 3;

const STAGES: Stage[] = [
  {
    id: "meters",
    title: "Smart meters",
    Icon: MeterIcon,
    x: 90,
    y: 110,
    owner: "Part B",
    what: "CEEW readings from 84 homes in Mathura and Bareilly, one every 3 minutes, replayed in time order.",
    why: "The replay stands in for live meters, so the stream behaves like the real thing without a utility feed.",
    stream: true,
  },
  {
    id: "redpanda",
    title: "Redpanda",
    Icon: StreamIcon,
    x: 270,
    y: 110,
    owner: "Part B",
    what: "A Kafka-compatible message stream that holds readings until the processor takes them.",
    why: "It keeps the reader and the writer apart, so a slow step never drops a reading.",
    stream: true,
  },
  {
    id: "flink",
    title: "Flink",
    Icon: WaveIcon,
    x: 450,
    y: 110,
    owner: "Part B",
    what: "Removes power cuts, computes rolling features and the city peer baseline, and scores every meter once a day.",
    why: "Dividing by the city median handles weather: a hot week lifts everyone, so it flags no one.",
    stream: true,
  },
  {
    id: "postgres",
    title: "PostgreSQL",
    Icon: DatabaseIcon,
    x: 630,
    y: 110,
    owner: "Shared",
    what: "Holds risk_scores, inspection_plan, inspection_outcomes and settings.",
    why: "It is the only meeting point between the stream and the agent.",
  },
  {
    id: "agent",
    title: "Agent planner",
    Icon: AgentIcon,
    x: 810,
    y: 110,
    owner: "Part C",
    what: "Each week it reads top scores, opens each meter with tools, and proposes a budgeted list with a reason per meter.",
    why: "Code checks every number in a reason. A pick with no real case is rejected, so the list can be short or empty.",
  },
  {
    id: "human",
    title: "Human review",
    Icon: ClipboardCheckIcon,
    x: 810,
    y: 280,
    owner: "Part C",
    what: "A person approves or rejects each meter on the inspection list here in the dashboard.",
    why: "Each inspection costs a trip, and nobody should be accused on a score alone.",
  },
  {
    id: "outcome",
    title: "Inspection result",
    Icon: BreakerIcon,
    x: 450,
    y: 280,
    owner: "Part C",
    what: "The inspector's finding is written to inspection_outcomes from the ledger or the meter file.",
    why: "These are the first real labels on Indian data. CEEW has none.",
  },
];

const WIRES = [
  { id: "a", d: "M138 110H222", beads: 7, period: 1.6 },
  { id: "b", d: "M318 110H402", beads: 7, period: 1.6 },
  { id: "c", d: "M498 110H582", beads: 2, period: 3 },
  { id: "d", d: "M678 110H762", beads: 1, period: 4 },
  { id: "e", d: "M810 150V240", beads: 1, period: 4 },
  { id: "f", d: "M762 280H498", beads: 1, period: 5 },
  { id: "g", d: "M402 280H210Q90 280 90 200V150", beads: 1, period: 7 },
];

/** The whole system as one wiring diagram. Beads thin out as the volume falls. */
export default function SystemPage() {
  const [selected, setSelected] = useState("agent");
  const reduced = useReducedMotion();
  const { data: status } = useStatus();
  const stage = STAGES.find((entry) => entry.id === selected) ?? STAGES[0];
  const standIn = status?.model_version?.startsWith("fake");
  const dailyReadings = (status?.meters ?? 84) * READINGS_PER_DAY;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-6xl">One wire, three volumes</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Flink scores every reading. The LLM never sees the raw stream. It only plans a few dozen inspections a week. Press any block to read about it.
        </p>
      </div>

      <section data-tour="diagram" className="sheet overflow-x-auto p-4">
        <svg viewBox="0 0 900 350" className="block min-w-[760px]" role="group" aria-label="System diagram">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="var(--rule)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="900" height="350" fill="url(#grid)" opacity="0.6" />

          <path d="M562 20V342" stroke="var(--signal)" strokeWidth="1.5" />
          <rect x="562" y="14" width="196" height="18" fill="var(--signal)" />
          <text x="572" y="27" fontSize="11" fill="var(--card)" fontFamily="var(--font-plex-mono)">
            NO RAW STREAM PAST THIS LINE
          </text>

          {WIRES.map((wire) => (
            <g key={wire.id}>
              <path id={`wire-${wire.id}`} d={wire.d} fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
              {!reduced &&
                Array.from({ length: wire.beads }, (_, index) => (
                  <circle key={index} r="3" fill="var(--signal)">
                    <animateMotion dur={`${wire.period}s`} begin={`${(index * wire.period) / wire.beads}s`} repeatCount="indefinite">
                      <mpath href={`#wire-${wire.id}`} />
                    </animateMotion>
                  </circle>
                ))}
            </g>
          ))}

          <text x="180" y="96" fontSize="11" textAnchor="middle" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
            {dailyReadings.toLocaleString("en-IN")} a day
          </text>
          <text x="503" y="96" fontSize="11" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
            {status?.meters ?? 84} a day
          </text>
          <text x="720" y="96" fontSize="11" textAnchor="middle" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
            weekly
          </text>
          <text x="300" y="272" fontSize="11" textAnchor="middle" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
            retrain (stretch goal)
          </text>

          {STAGES.map((entry) => {
            const active = entry.id === selected;
            return (
              <g
                key={entry.id}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={entry.title}
                className="cursor-pointer"
                onClick={() => setSelected(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(entry.id);
                  }
                }}
              >
                <rect
                  x={entry.x - 48}
                  y={entry.y - 40}
                  width={96}
                  height={80}
                  fill={active ? "var(--foreground)" : "var(--card)"}
                  stroke="var(--foreground)"
                  strokeWidth="1.5"
                />
                <foreignObject x={entry.x - 13} y={entry.y - 30} width={26} height={26} style={{ color: active ? "var(--card)" : "var(--foreground)" }}>
                  <entry.Icon size={26} />
                </foreignObject>
                <text
                  x={entry.x}
                  y={entry.y + 18}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill={active ? "var(--card)" : "var(--foreground)"}
                  fontFamily="var(--font-plex-sans)"
                >
                  {entry.title.split(" ")[0]}
                </text>
                {entry.title.includes(" ") && (
                  <text
                    x={entry.x}
                    y={entry.y + 32}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="600"
                    fill={active ? "var(--card)" : "var(--foreground)"}
                    fontFamily="var(--font-plex-sans)"
                  >
                    {entry.title.split(" ")[1]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </section>

      <section className="grid gap-6 lg:grid-cols-12" aria-live="polite">
        <div className="sheet p-4 lg:col-span-4">
          <p className="plate">{stage.owner}</p>
          <h2 className="display mt-1 text-5xl">{stage.title}</h2>
          {stage.stream && standIn && (
            <p className="plate mt-3 flex items-center gap-1.5 !text-amber">
              <BreakerIcon size={14} />
              Stand-in: scores now come from the fake seed
            </p>
          )}
        </div>
        <div className="sheet p-4 lg:col-span-4">
          <p className="plate">What it does</p>
          <p className="mt-1 text-lg leading-snug">{stage.what}</p>
        </div>
        <div className="sheet p-4 lg:col-span-4">
          <p className="plate">Why it is there</p>
          <p className="mt-1 text-lg leading-snug">{stage.why}</p>
        </div>
      </section>
    </div>
  );
}
