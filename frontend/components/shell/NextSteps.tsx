"use client";

import { CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useOutcomes, usePlan, useStatus } from "@/lib/api";
import { formatDay, nextMonday } from "@/lib/format";

/** The weekly job in three steps, with live counts, so every page says what to do next. */
export function NextSteps() {
  const { data: status } = useStatus();
  const week = status?.latest_scored_at ? nextMonday(status.latest_scored_at) : null;
  const { data: rows } = usePlan(week);
  const { data: outcomes } = useOutcomes();
  if (!status || !rows) return <div className="h-[74px] border-b border-rule" />;

  const reported = new Set((outcomes ?? []).map((outcome) => outcome.meter_id));
  const pending = rows.filter((row) => row.status === "pending").length;
  const waiting = rows.filter((row) => row.status === "approved" && !reported.has(row.meter_id)).length;
  const decided = rows.length > 0 && pending === 0;
  const current = !decided ? 2 : waiting > 0 ? 3 : null;

  const steps = [
    {
      n: 1,
      title: "See which meters look suspicious",
      detail: `${status.meters} meters scored up to ${status.latest_scored_at ? formatDay(status.latest_scored_at) : "today"}`,
      href: "/",
      done: true,
    },
    {
      n: 2,
      title: "Decide who gets inspected",
      detail: rows.length === 0 ? "No list yet. Run the planner." : pending > 0 ? `${pending} ${pending === 1 ? "meter needs" : "meters need"} a yes or no` : "All decided",
      href: "/plan",
      done: decided,
    },
    {
      n: 3,
      title: "Record what the inspector found",
      detail: waiting > 0 ? `${waiting} ${waiting === 1 ? "result" : "results"} to enter` : decided ? "All entered" : "After step 2",
      href: waiting > 0 ? "/plan" : "/ledger",
      done: decided && waiting === 0,
    },
  ];

  return (
    <nav aria-label="Weekly steps" data-tour="steps" className="border-b border-rule bg-card">
      <ol className="mx-auto grid max-w-[1500px] sm:grid-cols-3 md:px-8">
        {steps.map(({ n, title, detail, href, done }) => {
          const next = n === current;
          return (
            <li key={n} className="border-b border-rule last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <Link
                href={href}
                aria-current={next ? "step" : undefined}
                className="flex h-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary"
                style={next ? { background: "var(--signal-wash)" } : undefined}
              >
                {done ? (
                  <CheckCircle size={24} weight="fill" className="shrink-0 text-ok" aria-hidden />
                ) : (
                  <span
                    aria-hidden
                    className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] text-xs font-semibold"
                    style={next ? { background: "var(--signal)", borderColor: "var(--signal)", color: "var(--card)" } : { borderColor: "var(--ink-3)", color: "var(--ink-2)" }}
                  >
                    {n}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">
                    {title}
                    {next && <span className="plate ml-2 !text-signal">Do this next</span>}
                  </span>
                  <span className="block text-xs text-ink-2">{detail}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
