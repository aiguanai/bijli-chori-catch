"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { scaleLinear } from "d3-scale";
import { area, curveStepAfter, line } from "d3-shape";
import { useRef } from "react";
import { formatDay, formatShortDay } from "@/lib/format";
import { useWidth } from "@/lib/useWidth";

const HEIGHT = 86;
const M = { top: 10, bottom: 20 };

type Props = {
  dates: string[];
  counts: number[];
  day: number;
  playing: boolean;
  onDay: (day: number) => void;
  onPlay: () => void;
};

/** The replay control: a timeline of how many meters sat above the line each day. */
export function DayScrubber({ dates, counts, day, playing, onDay, onPlay }: Props) {
  const [box, width] = useWidth<HTMLDivElement>(900);
  const dragging = useRef(false);
  const last = dates.length - 1;
  const x = scaleLinear().domain([0, last]).range([1, width - 1]);
  const y = scaleLinear().domain([0, Math.max(...counts, 1)]).range([HEIGHT - M.bottom, M.top]);
  const fill = area<number>().x((_, index) => x(index)).y0(y(0)).y1((count) => y(count)).curve(curveStepAfter)(counts);
  const edge = line<number>().x((_, index) => x(index)).y((count) => y(count)).curve(curveStepAfter)(counts);

  function fromPointer(event: React.PointerEvent<SVGSVGElement>) {
    const left = event.currentTarget.getBoundingClientRect().left;
    onDay(Math.max(0, Math.min(last, Math.round(x.invert(event.clientX - left)))));
  }

  const ticks = dates.flatMap((date, index) => (index % 14 === 0 ? [{ date, index }] : []));

  return (
    <div className="flex items-stretch gap-4">
      <div className="flex w-[148px] shrink-0 flex-col justify-between">
        <button type="button" className="press w-full" data-tone="ink" onClick={onPlay} aria-pressed={playing}>
          {playing ? <Pause size={15} weight="fill" aria-hidden /> : <Play size={15} weight="fill" aria-hidden />}
          {playing ? "Pause" : "Replay"}
        </button>
        <div>
          <p className="plate">Showing</p>
          <p className="text-lg font-semibold leading-tight">{formatDay(dates[day])}</p>
        </div>
      </div>
      <div ref={box} className="min-w-0 flex-1">
        <svg
          width={width}
          height={HEIGHT}
          className="block touch-none select-none"
          style={{ cursor: "ew-resize" }}
          role="slider"
          tabIndex={0}
          aria-label="Day shown"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={day}
          aria-valuetext={formatDay(dates[day])}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            fromPointer(event);
          }}
          onPointerMove={(event) => {
            if (dragging.current) fromPointer(event);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (step) {
              event.preventDefault();
              onDay(Math.max(0, Math.min(last, day + step)));
            }
          }}
        >
          <path d={fill ?? ""} fill="var(--signal)" opacity="0.12" />
          <path d={edge ?? ""} fill="none" stroke="var(--signal)" strokeWidth="2" strokeLinejoin="round" />
          <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--foreground)" />
          {ticks.map(({ date, index }) => (
            <g key={date}>
              <line x1={x(index)} x2={x(index)} y1={y(0)} y2={y(0) + 4} stroke="var(--foreground)" />
              <text x={x(index)} y={HEIGHT - 3} textAnchor={index === 0 ? "start" : "middle"} fontSize="11" fill="var(--ink-2)" fontFamily="var(--font-plex-mono)">
                {formatShortDay(date)}
              </text>
            </g>
          ))}
          <line x1={x(day)} x2={x(day)} y1={0} y2={y(0)} stroke="var(--foreground)" strokeWidth="2" />
          <rect x={x(day) - 5} y={0} width={10} height={8} fill="var(--foreground)" />
          <text
            x={Math.min(x(day) + 9, width - 24)}
            y={Math.max(y(counts[day]) - 5, 11)}
            fontSize="12"
            fontWeight="600"
            fill="var(--foreground)"
            fontFamily="var(--font-plex-mono)"
            paintOrder="stroke"
            stroke="var(--card)"
            strokeWidth="3"
          >
            {counts[day]}
          </text>
        </svg>
      </div>
    </div>
  );
}
