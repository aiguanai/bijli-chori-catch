"use client";

import { ArrowCounterClockwise, Check, NotePencil, X } from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { Fragment, type ReactNode, type Ref } from "react";
import { Dial } from "@/components/instruments/Dial";
import { Spark } from "@/components/instruments/Spark";
import { Stamp } from "@/components/instruments/Stamp";
import { OutcomeDialog } from "@/components/plan/OutcomeDialog";
import type { PlanRow } from "@/lib/api";
import { cityOf } from "@/lib/format";

export const UNDO_MS = 5000;

/** Numbers in a reason are the claims a reviewer must check, so they stand out. */
function markNumbers(reason: string): ReactNode {
  return reason.split(/(\d+(?:\.\d+)?%?)(?![\d.]*[ -]day)/).map((part, index) => (
    <Fragment key={index}>{index % 2 ? <b className="num font-semibold text-foreground">{part}</b> : part}</Fragment>
  ));
}

type Props = {
  row: PlanRow;
  series: (number | null)[];
  focused: boolean;
  queued: "approved" | "rejected" | null;
  onFocus: () => void;
  onDecide: (status: "approved" | "rejected") => void;
  onUndo: () => void;
  ref?: Ref<HTMLElement>;
};

/** One work order on the list, torn along a perforated line. */
export function Slip({ row, series, focused, queued, onFocus, onDecide, onUndo, ref }: Props) {
  const current = series.at(-1) ?? null;
  const city = cityOf(row.meter_id);
  return (
    <motion.article
      ref={ref}
      layout="position"
      onPointerDown={onFocus}
      className="relative grid grid-cols-[52px_12px_minmax(0,1fr)] border-[1.5px] border-foreground bg-card sm:grid-cols-[76px_14px_minmax(0,1fr)]"
      style={{ outline: focused ? "2px solid var(--signal)" : undefined }}
    >
      <div className="flex flex-col items-center justify-start gap-1 py-3">
        <span className="plate !text-[10px]">Rank</span>
        <span className="display text-4xl sm:text-5xl">{row.rank}</span>
      </div>
      <div className="perforated" aria-hidden />
      <div className="min-w-0">
        <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <Dial value={current} size={62} title={`${row.meter_id} latest score`} />
            <div>
              <Link href={`/meters/${row.meter_id}`} className="num text-xl font-semibold underline-offset-4 hover:underline">
                {row.meter_id}
              </Link>
              <p className="flex items-center gap-1.5 text-xs text-ink-2">
                <span aria-hidden className="h-2 w-2" style={{ background: city === "Mathura" ? "var(--city-mh)" : "var(--city-br)" }} />
                {city}
              </p>
            </div>
          </div>
          <div className="hidden sm:block">
            <Spark values={series.slice(-28)} width={130} height={36} />
            <p className="plate !text-[10px]">Score, 28 days</p>
          </div>
          <div className="ml-auto">
            <Stamp status={queued ?? row.status} />
          </div>
        </div>

        <p className="mt-3 max-w-[72ch] text-[15px] leading-relaxed text-ink-2">{row.reason ? markNumbers(row.reason) : "No reason recorded."}</p>
        </div>

        {queued ? (
          <div className="border-t border-foreground bg-secondary px-3 py-2 sm:px-4">
            <div className="flex items-center gap-3">
              <button type="button" className="press !min-h-9" onClick={onUndo}>
                <ArrowCounterClockwise size={15} weight="bold" aria-hidden />
                Undo
              </button>
              <p className="text-sm text-ink-2">Sending. A decision is final once sent.</p>
            </div>
            <motion.div
              className="mt-2 h-0.5 origin-left bg-foreground"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: UNDO_MS / 1000, ease: "linear" }}
            />
          </div>
        ) : row.status === "pending" ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-foreground bg-secondary px-3 py-2 sm:px-4">
            <span className="text-[13px] font-medium">Inspect this meter?</span>
            <button type="button" className="press !min-h-9" data-tone="ink" onClick={() => onDecide("approved")}>
              <Check size={15} weight="bold" aria-hidden />
              Approve
            </button>
            <button type="button" className="press !min-h-9" onClick={() => onDecide("rejected")}>
              <X size={15} weight="bold" aria-hidden />
              Reject
            </button>
          </div>
        ) : row.status === "approved" ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-foreground bg-secondary px-3 py-2 sm:px-4">
            <span className="text-[13px] font-medium">After the visit:</span>
            <OutcomeDialog meterId={row.meter_id}>
              <button type="button" className="press !min-h-9">
                <NotePencil size={15} weight="bold" aria-hidden />
                Record result
              </button>
            </OutcomeDialog>
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}
