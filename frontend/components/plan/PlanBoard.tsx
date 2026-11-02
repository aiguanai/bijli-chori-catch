"use client";

import { CaretLeft, CaretRight, Check, Clock, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Knob } from "@/components/instruments/Knob";
import { RunPlanner } from "@/components/plan/RunPlanner";
import { Slip, UNDO_MS } from "@/components/plan/Slip";
import { Box, PageHeader } from "@/components/shell/Box";
import { KundaArt, Offline, Warming } from "@/components/shell/States";
import { type PlanRow, decidePlan, saveBudget, useBudget, useFleet, useMeters, usePlan, usePlanWeeks, useStatus } from "@/lib/api";
import { addDays, formatDay, formatShortDay, nextMonday } from "@/lib/format";

type Decision = "approved" | "rejected";

/** Budget as a row of fuses: approved ones are spent, pending ones are spoken for. */
function FuseStrip({ budget, approved, pending }: { budget: number; approved: number; pending: number }) {
  const cells = Math.max(budget, approved + pending);
  return (
    <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${approved} approved and ${pending} pending out of a budget of ${budget}`}>
      {Array.from({ length: cells }, (_, index) => {
        const state = index < approved ? "approved" : index < approved + pending ? "pending" : "free";
        return (
          <span
            key={index}
            className="flex h-6 w-2.5 items-center justify-center border"
            style={{
              borderColor: state === "free" ? "var(--rule)" : state === "approved" ? "var(--ok)" : "var(--amber)",
              background: state === "approved" ? "var(--ok)" : "transparent",
              marginLeft: index === budget ? 6 : 0,
            }}
          >
            {state === "pending" && <span className="h-full w-px bg-amber" />}
          </span>
        );
      })}
    </div>
  );
}

export function PlanBoard() {
  const { data: status, error: statusError } = useStatus();
  const { data: weeks } = usePlanWeeks();
  const { data: budget } = useBudget();
  const { data: fleet } = useFleet();
  const { data: meters } = useMeters();

  const defaultWeek = status?.latest_scored_at ? nextMonday(status.latest_scored_at) : null;
  const [chosen, setChosen] = useState<string | null>(null);
  const week = chosen ?? defaultWeek;
  const { data: rows, error } = usePlan(week);

  const [draft, setDraft] = useState<number | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);

  const [queued, setQueued] = useState<Record<number, Decision>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [focus, setFocus] = useState(0);
  const slips = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const release = useCallback((planId: number) => {
    const timer = timers.current.get(planId);
    if (timer) clearTimeout(timer);
    timers.current.delete(planId);
    setQueued((current) => Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== planId)));
  }, []);

  // A decision is final on the server, so it waits here long enough to be taken back.
  const decide = useCallback(
    (row: PlanRow, status: Decision) => {
      setProblem(null);
      setQueued((current) => ({ ...current, [row.plan_id]: status }));
      timers.current.set(
        row.plan_id,
        setTimeout(async () => {
          try {
            await decidePlan(row, status);
          } catch (failure) {
            setProblem(failure instanceof Error ? failure.message : "Could not save the decision");
          } finally {
            release(row.plan_id);
          }
        }, UNDO_MS),
      );
    },
    [release],
  );

  const list = useMemo(() => rows ?? [], [rows]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [role=dialog]") || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "j" || key === "k") {
        event.preventDefault();
        const next = Math.max(0, Math.min(list.length - 1, focus + (key === "j" ? 1 : -1)));
        setFocus(next);
        const row = list[next];
        if (row) slips.current.get(row.plan_id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }
      const row = list[focus];
      if (!row) return;
      if (key === "u" && queued[row.plan_id]) release(row.plan_id);
      if (row.status !== "pending" || queued[row.plan_id]) return;
      if (key === "a") decide(row, "approved");
      if (key === "r") decide(row, "rejected");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, focus, queued, decide, release]);

  if ((statusError && !status) || (error && !rows)) return <Offline message={(statusError ?? error).message} />;
  if (!week) return <Warming />;

  const counts = { approved: 0, rejected: 0, pending: 0 };
  for (const row of list) counts[queued[row.plan_id] ?? row.status] += 1;
  const weeklyBudget = draft ?? budget?.weekly_budget ?? 20;
  const scores = (meterId: string) => fleet?.scores[meterId] ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inspection list"
        summary="The planner suggests which meters to inspect, most urgent first. Read each reason, then approve to send an inspector or reject to skip."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Box title="Week" hint="Lists are made per week, starting on a Monday." bodyClassName="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-3">
          <div className="flex items-center gap-2">
            <button type="button" className="press !min-h-9 !px-2" aria-label="Previous week" onClick={() => setChosen(addDays(week, -7))}>
              <CaretLeft size={15} weight="bold" aria-hidden />
            </button>
            <p className="display min-w-[190px] text-center text-3xl">{formatDay(week)}</p>
            <button type="button" className="press !min-h-9 !px-2" aria-label="Next week" onClick={() => setChosen(addDays(week, 7))}>
              <CaretRight size={15} weight="bold" aria-hidden />
            </button>
            {weeks && weeks.length > 0 && (
              <div className="seg ml-2" role="group" aria-label="Weeks with a list">
                {weeks.slice(0, 6).map((entry) => (
                  <button key={entry.week_start} type="button" aria-pressed={entry.week_start === week} onClick={() => setChosen(entry.week_start)}>
                    {formatShortDay(entry.week_start)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="flex border border-rule text-sm">
            <li className="flex items-center gap-1.5 border-r border-rule px-2.5 py-1.5">
              <Clock size={15} weight="bold" className="text-amber" aria-hidden />
              {counts.pending} pending
            </li>
            <li className="flex items-center gap-1.5 border-r border-rule px-2.5 py-1.5">
              <Check size={15} weight="bold" className="text-ok" aria-hidden />
              {counts.approved} approved
            </li>
            <li className="flex items-center gap-1.5 px-2.5 py-1.5">
              <X size={15} weight="bold" className="text-ink-2" aria-hidden />
              {counts.rejected} rejected
            </li>
          </ul>
        </Box>

        {problem && (
          <p role="alert" className="border-l-4 border-signal bg-signal-wash px-3 py-2 text-sm">
            {problem}
          </p>
        )}

        <div data-tour="slips" className="space-y-3" style={{ opacity: rows ? 1 : 0.5 }}>
          {list.length === 0 && rows && (
            <div className="sheet flex flex-col items-center gap-3 px-6 py-10 text-center">
              <KundaArt width={320} />
              <h2 className="display text-3xl">No list for this week yet</h2>
              <p className="max-w-md text-ink-2">Run the planner. If no meter has a real case the agent will leave the list empty, and that is a valid answer.</p>
            </div>
          )}
          {list.map((row, index) => (
            <Slip
              key={row.plan_id}
              ref={(node) => {
                if (node) slips.current.set(row.plan_id, node);
                else slips.current.delete(row.plan_id);
              }}
              row={row}
              series={scores(row.meter_id)}
              focused={index === focus}
              queued={queued[row.plan_id] ?? null}
              onFocus={() => setFocus(index)}
              onDecide={(decision) => decide(row, decision)}
              onUndo={() => release(row.plan_id)}
            />
          ))}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4">
        <Box title="Weekly budget" hint="How many inspections you can afford." tour="budget">
          <div className="flex items-center gap-4">
            <Knob
              value={weeklyBudget}
              min={1}
              max={Math.max(meters?.length ?? 84, weeklyBudget)}
              label="Inspections allowed each week"
              onChange={setDraft}
              onCommit={async (value) => {
                setSaveProblem(null);
                try {
                  await saveBudget(value);
                } catch (failure) {
                  setSaveProblem(failure instanceof Error ? failure.message : "Could not save the budget");
                } finally {
                  setDraft(null);
                }
              }}
            />
            <p className="text-sm leading-snug text-ink-2">Drag round the knob to change it. Saved as soon as you let go.</p>
          </div>
          {saveProblem && <p className="mt-1 text-sm text-signal">{saveProblem}</p>}
          <div className="mt-3 border-t border-rule pt-3">
            <FuseStrip budget={weeklyBudget} approved={counts.approved} pending={counts.pending} />
            <ul className="plate mt-2 flex flex-wrap gap-x-3">
              <li className="flex items-center gap-1">
                <span aria-hidden className="h-2.5 w-2 bg-ok" /> Approved
              </li>
              <li className="flex items-center gap-1">
                <span aria-hidden className="h-2.5 w-2 border border-amber" /> Pending
              </li>
              <li className="flex items-center gap-1">
                <span aria-hidden className="h-2.5 w-2 border border-rule" /> Free
              </li>
            </ul>
          </div>
        </Box>

        <Box title="Make a new list" hint="Writes this week's suggestions." tour="planner">
          <RunPlanner week={week} pending={counts.pending} />
        </Box>

        <Box title="Keyboard shortcuts" className="hidden lg:block" bodyClassName="p-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm text-ink-2">
            {[
              ["J K", "next, previous"],
              ["A", "approve"],
              ["R", "reject"],
              ["U", "undo"],
            ].map(([keys, meaning]) => (
              <div key={keys} className="contents">
                <dt className="num text-foreground">{keys}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </Box>
      </aside>
      </div>
    </div>
  );
}
