"use client";

import { ArrowRight, MagnifyingGlass, Minus, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DayScrubber } from "@/components/charts/DayScrubber";
import { HeatBoard } from "@/components/charts/HeatBoard";
import { RiskHistogram } from "@/components/charts/RiskHistogram";
import { PylonIcon } from "@/components/icons";
import { DialKey } from "@/components/panel/DialKey";
import { CityBus } from "@/components/panel/MeterWall";
import { Inspector } from "@/components/panel/Inspector";
import { Box, Control, PageHeader } from "@/components/shell/Box";
import { Offline, Warming } from "@/components/shell/States";
import { useBudget, useFleet, useMeters, useStatus } from "@/lib/api";

const REPLAY_STEP_MS = 160;

type Order = "id" | "risk" | "rise";
type View = "dials" | "board";

export function Panel() {
  const { data: fleet, error } = useFleet();
  const { data: meters } = useMeters();
  const { data: budget } = useBudget();
  const { data: status } = useStatus();

  const [picked, setPicked] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(0.6);
  const [playing, setPlaying] = useState(false);
  const [playFrom, setPlayFrom] = useState(0);
  const [order, setOrder] = useState<Order>("id");
  const [view, setView] = useState<View>("dials");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const last = (fleet?.dates.length ?? 1) - 1;
  const day = picked ?? last;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setPicked((current) => {
        const next = (current ?? last) + 1;
        if (next >= last) setPlaying(false);
        return Math.min(next, last);
      });
    }, REPLAY_STEP_MS);
    return () => clearInterval(timer);
  }, [playing, last]);

  const nudge = (by: number) => setThreshold((current) => Math.round(Math.min(0.99, Math.max(0.05, current + by)) * 100) / 100);

  const togglePlay = useCallback(() => {
    if (playing) return setPlaying(false);
    const from = day >= last ? 0 : day;
    setPicked(from);
    setPlayFrom(from);
    setPlaying(true);
  }, [playing, day, last]);

  const allIds = useMemo(() => Object.keys(fleet?.scores ?? {}).sort(), [fleet]);

  const values = useMemo(() => {
    const today: Record<string, number | null> = {};
    for (const meterId of allIds) today[meterId] = fleet?.scores[meterId][day] ?? null;
    return today;
  }, [fleet, allIds, day]);

  const present = useMemo(() => Object.values(values).filter((value): value is number => value != null), [values]);
  const over = present.filter((value) => value >= threshold).length;

  const overByDay = useMemo(
    () =>
      (fleet?.dates ?? []).map((_, index) =>
        Object.values(fleet?.scores ?? {}).filter((series) => (series[index] ?? 0) >= threshold).length,
      ),
    [fleet, threshold],
  );

  // Hold the order still during a replay, or the wall would reshuffle every frame.
  const sortDay = playing ? playFrom : day;
  const sorted = useMemo(() => {
    const rank = (meterId: string) => {
      const series = fleet?.scores[meterId] ?? [];
      if (order === "risk") return -(series[sortDay] ?? -1);
      return -((series[sortDay] ?? 0) - (series[Math.max(0, sortDay - 7)] ?? 0));
    };
    return order === "id" ? allIds : [...allIds].sort((a, b) => rank(a) - rank(b));
  }, [allIds, order, fleet, sortDay]);

  const visible = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return needle ? sorted.filter((meterId) => meterId.includes(needle)) : sorted;
  }, [sorted, query]);

  const fallbackId = meters?.[0]?.meter_id ?? allIds[0] ?? null;
  const selected = selectedId ?? fallbackId;
  const select = useCallback((meterId: string) => setSelectedId(meterId), []);

  if (error && !fleet) return <Offline message={error.message} />;
  if (!fleet) return <Warming />;
  if (allIds.length === 0) {
    return <Warming>No scores yet. Run python -m shared.seed_fake_data or start the stream.</Warming>;
  }

  const weeklyBudget = budget?.weekly_budget;
  const fit =
    weeklyBudget == null
      ? ""
      : over <= weeklyBudget
        ? `All of them fit the weekly budget of ${weeklyBudget}.`
        : `${over - weeklyBudget} more than the weekly budget of ${weeklyBudget}.`;

  const mathura = visible.filter((meterId) => meterId.startsWith("MH"));
  const bareilly = visible.filter((meterId) => meterId.startsWith("BR"));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meters"
        summary="Every home gets a theft risk score from 0 to 1. Higher looks more like theft, but a score is only a reason to check."
        action={
          <Link href="/plan" className="press" data-tone="ink">
            Go to inspection list
            <ArrowRight size={15} weight="bold" aria-hidden />
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <Box title="Right now" tour="count" className="lg:col-span-4">
          <div className="flex items-end gap-4">
            <p className="display text-[104px] leading-[0.8] text-signal" aria-live="polite">
              {over}
            </p>
            <p className="pb-1 text-xl font-medium leading-[1.15]">
              of {present.length} meters
              <br />
              look suspicious
            </p>
          </div>
          <p className="mt-3 text-sm text-ink-2">
            Counting scores of {threshold.toFixed(2)} or above. {fit}
          </p>
          <div className="mt-3 grid grid-cols-2 border border-rule text-sm">
            <span className="flex items-center gap-2 border-r border-rule px-2 py-1.5">
              <PylonIcon size={16} style={{ color: "var(--city-mh)" }} />
              Mathura {allIds.filter((id) => id.startsWith("MH") && (values[id] ?? 0) >= threshold).length} of{" "}
              {allIds.filter((id) => id.startsWith("MH")).length}
            </span>
            <span className="flex items-center gap-2 px-2 py-1.5">
              <PylonIcon size={16} style={{ color: "var(--city-br)" }} />
              Bareilly {allIds.filter((id) => id.startsWith("BR") && (values[id] ?? 0) >= threshold).length} of{" "}
              {allIds.filter((id) => id.startsWith("BR")).length}
            </span>
          </div>
        </Box>
        <Box
          title="Alert level"
          hint="Choose the score that counts as suspicious. Drag the black flag, or use the buttons."
          tour="histogram"
          className="lg:col-span-8"
          action={
            <div className="seg items-center" role="group" aria-label="Alert level">
              <button type="button" aria-label="Lower alert level" onClick={() => nudge(-0.05)}>
                <Minus size={13} weight="bold" aria-hidden />
              </button>
              <span className="num border-x-[1.5px] border-foreground bg-card px-3 py-1 text-sm font-semibold">{threshold.toFixed(2)}</span>
              <button type="button" aria-label="Raise alert level" className="!border-l-0" onClick={() => nudge(0.05)}>
                <Plus size={13} weight="bold" aria-hidden />
              </button>
            </div>
          }
        >
          <RiskHistogram values={present} threshold={threshold} onThreshold={setThreshold} />
        </Box>
      </div>

      <Box title="Timeline" hint="How many meters looked suspicious each day. Press Replay, or drag across the chart to pick a day." tour="replay">
        <DayScrubber
          dates={fleet.dates}
          counts={overByDay}
          day={day}
          playing={playing}
          onDay={(next) => {
            setPlaying(false);
            setPicked(next);
          }}
          onPlay={togglePlay}
        />
      </Box>

      <Box title="All meters" hint="Click a meter to read it. Each one shows the day picked on the timeline." tour="wall" bodyClassName="">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-foreground px-4 py-2.5">
          <Control label="Show as">
            <div className="seg" role="group" aria-label="Show as">
              {(["dials", "board"] as const).map((option) => (
                <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>
                  {option === "dials" ? "Dials" : "Day by day"}
                </button>
              ))}
            </div>
          </Control>
          <Control label="Sort by">
            <div className="seg" role="group" aria-label="Sort by">
              {(
                [
                  ["id", "Meter ID"],
                  ["risk", "Highest risk"],
                  ["rise", "Rising fastest"],
                ] as const
              ).map(([option, label]) => (
                <button key={option} type="button" aria-pressed={order === option} onClick={() => setOrder(option)}>
                  {label}
                </button>
              ))}
            </div>
          </Control>
          <label className="flex items-center gap-2">
            <span className="text-[13px] font-medium">Find</span>
            <span className="flex items-center gap-2 border-[1.5px] border-foreground bg-card px-2">
              <MagnifyingGlass size={14} weight="bold" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. MH07"
                className="num w-24 bg-transparent py-1 text-sm outline-none placeholder:text-ink-3"
              />
            </span>
          </label>
        </div>

        <DialKey threshold={threshold} />
        <div className="grid items-start gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_312px]">
          <div className="min-w-0 space-y-6">
            {visible.length === 0 && <p className="text-ink-2">No meter matches that ID.</p>}
            {view === "dials" ? (
              <>
                {mathura.length > 0 && (
                  <CityBus
                    name="Mathura"
                    color="var(--city-mh)"
                    meterIds={mathura}
                    values={values}
                    threshold={threshold}
                    selected={selected}
                    fast={playing}
                    animate={!playing}
                    onSelect={select}
                  />
                )}
                {bareilly.length > 0 && (
                  <CityBus
                    name="Bareilly"
                    color="var(--city-br)"
                    meterIds={bareilly}
                    values={values}
                    threshold={threshold}
                    selected={selected}
                    fast={playing}
                    animate={!playing}
                    onSelect={select}
                  />
                )}
              </>
            ) : (
              visible.length > 0 && <HeatBoard fleet={fleet} order={visible} day={day} selected={selected} onSelect={select} />
            )}
          </div>
          {selected && fleet.scores[selected] && (
            <Inspector
              meterId={selected}
              series={fleet.scores[selected]}
              day={day}
              threshold={threshold}
              latest={meters?.find((meter) => meter.meter_id === selected)}
              heldOut={status?.test_meters.includes(selected) ?? false}
              fast={playing}
            />
          )}
        </div>
      </Box>
    </div>
  );
}
