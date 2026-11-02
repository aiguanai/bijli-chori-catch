"use client";

import { ArrowRight, ArrowUpRight, Minus, ArrowDownRight } from "@phosphor-icons/react";
import Link from "next/link";
import { Dial } from "@/components/instruments/Dial";
import { Spark } from "@/components/instruments/Spark";
import type { Meter } from "@/lib/api";
import { cityOf, fixed, score } from "@/lib/format";

type Props = {
  meterId: string;
  series: (number | null)[];
  day: number;
  threshold: number;
  latest: Meter | undefined;
  heldOut: boolean;
  fast: boolean;
};

/** The instrument clipped to the side of the panel: a closer read of one meter. */
export function Inspector({ meterId, series, day, threshold, latest, heldOut, fast }: Props) {
  const value = series[day] ?? null;
  const weekAgo = series[Math.max(0, day - 7)] ?? null;
  const change = value != null && weekAgo != null ? value - weekAgo : null;
  const Trend = change == null || Math.abs(change) < 0.03 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const city = cityOf(meterId);
  const features = latest?.features;

  return (
    <aside data-tour="inspector" className="box lg:sticky lg:top-4" aria-label={`Reading for ${meterId}`}>
      <header className="box-head">
        <h2 className="text-[15px] font-semibold leading-tight">Selected meter</h2>
      </header>
      <div className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="plate">{city}</p>
          <h2 className="display text-5xl">{meterId}</h2>
        </div>
        {heldOut && (
          <span className="plate border border-rule px-1.5 py-0.5" title="One of the 17 test meters. Nobody trains or tunes on it.">
            Test meter
          </span>
        )}
      </div>

      <div className="mt-3 flex justify-center bg-[var(--dial-face)] py-3">
        <Dial value={value} threshold={threshold} size={230} labels fast={fast} />
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <p className="text-4xl font-semibold">{score(value)}</p>
        <p className="flex items-center gap-1 text-sm text-ink-2">
          <Trend size={15} weight="bold" aria-hidden />
          {change == null ? "no change data" : `${change >= 0 ? "+" : ""}${change.toFixed(2)} on 7 days before`}
        </p>
      </div>

      <div className="mt-3 border-t border-rule pt-3">
        <p className="plate mb-1">Risk score, 60 days</p>
        <Spark values={series} width={264} height={56} marker={day} threshold={threshold} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-rule pt-3">
        <div>
          <dt className="plate">kWh a day</dt>
          <dd className="num text-[15px] font-medium">{fixed(features?.kwh_7d_mean)}</dd>
        </div>
        <div>
          <dt className="plate">Vs city</dt>
          <dd className="num text-[15px] font-medium">{features?.peer_ratio_7d == null ? "n/a" : `${features.peer_ratio_7d.toFixed(2)}x`}</dd>
        </div>
        <div>
          <dt className="plate">Power cut</dt>
          <dd className="num text-[15px] font-medium">{features?.power_cut_minutes == null ? "n/a" : `${features.power_cut_minutes} min`}</dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-ink-2">Usage is the latest 7-day figure, not the replay day.</p>

      <Link href={`/meters/${meterId}`} className="press mt-4 w-full">
        See full history
        <ArrowRight size={15} weight="bold" aria-hidden />
      </Link>
      </div>
    </aside>
  );
}
