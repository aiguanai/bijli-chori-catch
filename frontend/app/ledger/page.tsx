"use client";

import { CheckCircle, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { KundaArt, Offline, Warming } from "@/components/shell/States";
import { useOutcomes } from "@/lib/api";
import { formatDay } from "@/lib/format";

export default function LedgerPage() {
  const { data: outcomes, error } = useOutcomes();
  if (error && !outcomes) return <Offline message={error.message} />;
  if (!outcomes) return <Warming>Opening the results</Warming>;

  if (outcomes.length === 0) {
    return (
      <div className="sheet mx-auto mt-6 flex max-w-2xl flex-col items-center gap-4 p-10 text-center">
        <KundaArt width={420} />
        <h1 className="display text-5xl">No results yet</h1>
        <p className="max-w-md text-ink-2">
          Results appear here once an inspector reports back on an approved meter. Each one becomes a real label for the next retrain.
        </p>
        <Link href="/plan" className="press" data-tone="ink">
          Go to the inspection list
        </Link>
      </div>
    );
  }

  const found = outcomes.filter((outcome) => outcome.theft_found);
  const rate = found.length / outcomes.length;
  const styles = new Map<string, number>();
  for (const outcome of found) {
    const style = outcome.theft_style ?? "not known";
    styles.set(style, (styles.get(style) ?? 0) + 1);
  }
  const tally = [...styles].sort((a, b) => b[1] - a[1]);
  const widest = tally[0]?.[1] ?? 1;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="sheet p-5">
          <p className="plate">Hit rate</p>
          <p className="mt-1 text-7xl font-semibold leading-none">{Math.round(rate * 100)}%</p>
          <p className="mt-2 text-sm text-ink-2">
            {found.length} of {outcomes.length} inspections found theft.
          </p>
          <div className="mt-4 flex flex-wrap gap-[3px]" role="img" aria-label={`${found.length} theft, ${outcomes.length - found.length} clear`}>
            {outcomes.map((outcome, index) => (
              <span key={index} className="h-3.5 w-3.5" style={{ background: outcome.theft_found ? "var(--signal)" : "var(--ink-3)" }} />
            ))}
          </div>
          <ul className="plate mt-2 flex gap-3">
            <li className="flex items-center gap-1">
              <span aria-hidden className="h-2.5 w-2.5 bg-signal" /> Theft
            </li>
            <li className="flex items-center gap-1">
              <span aria-hidden className="h-2.5 w-2.5 bg-ink-3" /> Clear
            </li>
          </ul>
        </section>
        {tally.length > 0 && (
          <section className="sheet p-5">
            <p className="plate">Theft found, by style</p>
            <ul className="mt-3 space-y-2">
              {tally.map(([style, count]) => (
                <li key={style}>
                  <div className="flex justify-between text-sm">
                    <span>{style}</span>
                    <span className="num">{count}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 bg-signal" style={{ width: `${(count / widest) * 100}%` }} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <section className="sheet min-w-0 overflow-x-auto p-4">
        <h1 className="display mb-3 text-4xl">Inspection results</h1>
        <table className="w-full text-sm">
          <thead>
            <tr className="plate text-left">
              {["Date", "Meter", "Result", "Style", "Notes"].map((head) => (
                <th key={head} className="border-b border-foreground py-1 pr-4 font-normal">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outcomes.map((outcome, index) => (
              <tr key={index} className="border-b border-rule">
                <td className="num whitespace-nowrap py-2 pr-4">{formatDay(outcome.inspected_on)}</td>
                <td className="pr-4">
                  <Link href={`/meters/${outcome.meter_id}`} className="num font-medium underline-offset-4 hover:underline">
                    {outcome.meter_id}
                  </Link>
                </td>
                <td className="pr-4">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {outcome.theft_found ? (
                      <Warning size={15} weight="bold" className="text-signal" aria-hidden />
                    ) : (
                      <CheckCircle size={15} weight="bold" className="text-ok" aria-hidden />
                    )}
                    {outcome.theft_found ? "Theft found" : "All clear"}
                  </span>
                </td>
                <td className="pr-4 text-ink-2">{outcome.theft_style ?? ""}</td>
                <td className="text-ink-2">{outcome.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
