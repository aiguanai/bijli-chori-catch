"use client";

import { Lightning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AgentIcon, DatabaseIcon, MeterIcon, ClipboardCheckIcon } from "@/components/icons";
import { runPlan } from "@/lib/api";

const AGENT_STEPS = [
  { Icon: DatabaseIcon, text: "Reads the budget and the top scores" },
  { Icon: MeterIcon, text: "Opens each meter: history and city peers" },
  { Icon: AgentIcon, text: "Keeps only meters with a real case" },
  { Icon: ClipboardCheckIcon, text: "Checks every number, then writes the list" },
];

const BASELINE_STEPS = [
  { Icon: DatabaseIcon, text: "Reads the budget and the top scores" },
  { Icon: ClipboardCheckIcon, text: "Lists the highest scores, up to the budget" },
];

export function RunPlanner({ week, pending }: { week: string; pending: number }) {
  const [method, setMethod] = useState<"agent" | "baseline">("agent");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<{ text: string; failed: boolean } | null>(null);
  const running = startedAt != null;

  useEffect(() => {
    if (startedAt == null) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  async function run() {
    setStartedAt(Date.now());
    setElapsed(0);
    setNote(null);
    try {
      const rows = await runPlan(week, method);
      setNote({
        text: rows.length ? `Wrote ${rows.length} ${rows.length === 1 ? "meter" : "meters"} to the list.` : "No new meter had a case, so nothing was added.",
        failed: false,
      });
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : "The run failed.", failed: true });
    } finally {
      setStartedAt(null);
    }
  }

  const steps = method === "agent" ? AGENT_STEPS : BASELINE_STEPS;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium">Method</p>
        <div className="seg" role="group" aria-label="Planner method">
          <button type="button" aria-pressed={method === "agent"} onClick={() => setMethod("agent")} disabled={running}>
            AI agent
          </button>
          <button type="button" aria-pressed={method === "baseline"} onClick={() => setMethod("baseline")} disabled={running}>
            Top scores
          </button>
        </div>
      </div>
      <ol className="mt-3 space-y-0">
        {steps.map(({ Icon, text }, index) => (
          <li key={text} className="relative flex gap-3 pb-3 last:pb-0">
            {index < steps.length - 1 && <span aria-hidden className="absolute bottom-0 left-[9px] top-5 w-px bg-rule" />}
            <Icon size={19} className={running ? "shrink-0 text-signal" : "shrink-0"} />
            <span className="text-sm leading-snug text-ink-2">{text}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="press mt-4 w-full" data-tone="ink" disabled={running} onClick={run}>
        <Lightning size={15} weight="fill" aria-hidden />
        {running ? `Running ${elapsed}s` : "Run planner"}
      </button>
      <p className="mt-2 text-xs text-ink-2">
        {method === "agent" ? "Can take minutes. " : ""}
        {pending > 0 ? `Replaces the ${pending} pending ${pending === 1 ? "row" : "rows"}. ` : ""}Decided rows stay.
      </p>
      {note && (
        <p role="status" className={`mt-2 text-sm ${note.failed ? "text-signal" : "text-foreground"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
