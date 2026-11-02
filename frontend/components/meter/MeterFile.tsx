"use client";

import { ArrowLeft, ArrowRight, CheckCircle, NotePencil, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PeerStrip } from "@/components/charts/PeerStrip";
import { Tracks } from "@/components/charts/Tracks";
import { Dial } from "@/components/instruments/Dial";
import { Stamp } from "@/components/instruments/Stamp";
import { OutcomeDialog } from "@/components/plan/OutcomeDialog";
import { Box } from "@/components/shell/Box";
import { Offline, Warming } from "@/components/shell/States";
import { useHistory, useMeters, useOutcomes, usePeers, usePlan, useStatus } from "@/lib/api";
import { cityOf, fixed, formatDay, nextMonday, percent, score } from "@/lib/format";

const RANGES = [14, 28, 60];

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border border-rule px-3 py-2">
      <p className="plate">{label}</p>
      <p className="text-2xl font-semibold leading-tight">{value}</p>
      {detail && <p className="text-xs text-ink-2">{detail}</p>}
    </div>
  );
}

export function MeterFile() {
  const params = useParams<{ id: string }>();
  const meterId = decodeURIComponent(params.id);
  const [range, setRange] = useState(28);
  const [table, setTable] = useState(false);

  const { data: days, error } = useHistory(meterId, range);
  const { data: peers } = usePeers(meterId);
  const { data: meters } = useMeters();
  const { data: status } = useStatus();
  const { data: outcomes } = useOutcomes();
  const week = status?.latest_scored_at ? nextMonday(status.latest_scored_at) : null;
  const { data: plan } = usePlan(week);

  const city = cityOf(meterId);
  const prefix = meterId.slice(0, 2);
  const cityMeters = useMemo(() => (meters ?? []).filter((meter) => meter.meter_id.startsWith(prefix)), [meters, prefix]);

  if (error && !days) {
    return <Offline message={error.status === 404 ? `No meter called ${meterId}.` : error.message} />;
  }
  if (!days) return <Warming>Opening the file</Warming>;

  const first = days[0];
  const latest = days.at(-1);
  const ranked = meters ?? [];
  const position = ranked.findIndex((meter) => meter.meter_id === meterId);
  const previous = position > 0 ? ranked[position - 1].meter_id : null;
  const following = position >= 0 && position < ranked.length - 1 ? ranked[position + 1].meter_id : null;
  const planRow = plan?.find((row) => row.meter_id === meterId);
  const history = (outcomes ?? []).filter((outcome) => outcome.meter_id === meterId);
  const heldOut = status?.test_meters.includes(meterId);

  const scorePoints = cityMeters.map((meter) => ({ id: meter.meter_id, value: meter.risk_score }));
  const usePoints = cityMeters.flatMap((meter) =>
    meter.features?.peer_ratio_7d == null ? [] : [{ id: meter.meter_id, value: meter.features.peer_ratio_7d }],
  );
  const topRatio = Math.ceil(Math.max(2, ...usePoints.map((point) => point.value)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="plate flex items-center gap-1.5 hover:text-foreground">
          <ArrowLeft size={13} weight="bold" aria-hidden />
          Back to all meters
        </Link>
        <div className="flex items-center gap-4">
          {position >= 0 && <span className="plate">Rank {position + 1} of {ranked.length}</span>}
          {previous && (
            <Link href={`/meters/${previous}`} className="press !min-h-8 !px-2" aria-label={`Previous by risk: ${previous}`}>
              <ArrowLeft size={13} weight="bold" aria-hidden />
              {previous}
            </Link>
          )}
          {following && (
            <Link href={`/meters/${following}`} className="press !min-h-8 !px-2" aria-label={`Next by risk: ${following}`}>
              {following}
              <ArrowRight size={13} weight="bold" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      <header data-tour="summary" className="sheet grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <p className="plate flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5" style={{ background: prefix === "MH" ? "var(--city-mh)" : "var(--city-br)" }} />
              {city}
            </p>
            <h1 className="display text-[88px] leading-[0.9]">{meterId}</h1>
            {heldOut && <p className="plate mt-1">Test meter, held out of training</p>}
          </div>
          <Dial value={latest?.risk_score ?? null} size={210} labels />
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Risk score" value={score(latest?.risk_score)} detail={first ? `was ${score(first.risk_score)} ${range} days back` : undefined} />
            <Stat
              label="City median"
              value={score(peers?.peer_median_risk_score)}
              detail={peers?.risk_percentile == null ? undefined : `above ${Math.round(peers.risk_percentile)}% of ${city}`}
            />
            <Stat label="Use, 7 days" value={`${fixed(latest?.features?.kwh_7d_mean)} kWh`} detail={`${fixed(latest?.features?.peer_ratio_7d, 2)}x the city median`} />
            <Stat label="Zero readings" value={percent(latest?.features?.zero_share)} detail="latest day, supply on" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
            {planRow ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <Stamp status={planRow.status} />
                  <span className="plate">
                    Rank {planRow.rank} for {formatDay(planRow.week_start)}
                  </span>
                </div>
                {planRow.reason && <p className="mt-2 max-w-[75ch] text-sm leading-relaxed text-ink-2">{planRow.reason}</p>}
              </div>
            ) : (
              <p className="text-sm text-ink-2">Not on the list for {week ? formatDay(week) : "the coming week"}.</p>
            )}
            <OutcomeDialog meterId={meterId}>
              <button type="button" className="press" data-tour="record">
                <NotePencil size={15} weight="bold" aria-hidden />
                Record result
              </button>
            </OutcomeDialog>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section data-tour="tracks" aria-label="History" className="box">
          <div className="box-head">
            <div>
              <h2 className="text-[15px] font-semibold leading-tight">History</h2>
              <p className="text-[13px] text-ink-2">Move your pointer across a chart to read that day in the left column.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="seg" role="group" aria-label="Days shown">
                {RANGES.map((option) => (
                  <button key={option} type="button" aria-pressed={range === option} onClick={() => setRange(option)}>
                    {option} days
                  </button>
                ))}
              </div>
              <div className="seg" role="group" aria-label="Chart or table">
                <button type="button" aria-pressed={!table} onClick={() => setTable(false)}>
                  Chart
                </button>
                <button type="button" aria-pressed={table} onClick={() => setTable(true)}>
                  Table
                </button>
              </div>
            </div>
          </div>
          <div className="p-4">
          {days.length === 0 ? (
            <p className="py-8 text-ink-2">No scores in this period.</p>
          ) : table ? (
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="plate text-left">
                    {["Day", "Risk", "kWh", "7d kWh", "Vs city", "Zero", "Night", "Cut min", "Volts"].map((head) => (
                      <th key={head} className="border-b border-foreground py-1 pr-3 font-normal">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num">
                  {[...days].reverse().map((day) => (
                    <tr key={day.scored_at} className="border-b border-rule">
                      <td className="whitespace-nowrap py-1 pr-3">{formatDay(day.scored_at)}</td>
                      <td className="pr-3">{score(day.risk_score)}</td>
                      <td className="pr-3">{fixed(day.features?.daily_kwh, 2)}</td>
                      <td className="pr-3">{fixed(day.features?.kwh_7d_mean, 2)}</td>
                      <td className="pr-3">{fixed(day.features?.peer_ratio_7d, 2)}</td>
                      <td className="pr-3">{fixed(day.features?.zero_share, 2)}</td>
                      <td className="pr-3">{fixed(day.features?.night_share, 2)}</td>
                      <td className="pr-3">{day.features?.power_cut_minutes ?? "n/a"}</td>
                      <td className="pr-3">{fixed(day.features?.avg_voltage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Tracks days={days} />
          )}
          </div>
        </section>

        <aside data-tour="peers" className="space-y-4">
          <Box title={`Risk score vs ${city}`} hint="Red dot is this meter. Click a dot to open it.">
            {scorePoints.length > 0 && <PeerStrip points={scorePoints} focus={meterId} domain={[0, 1]} />}
          </Box>
          <Box title="Electricity use vs city" hint="7-day use as a multiple of the city median.">
            {usePoints.length > 0 && <PeerStrip points={usePoints} focus={meterId} domain={[0, topRatio]} unit="x" />}
            <p className="mt-2 text-xs leading-snug text-ink-2">Usage neither makes nor clears a case. SGCC thieves used more than honest homes, not less.</p>
          </Box>
          <Box title="Inspection history">
            {history.length === 0 ? (
              <p className="text-sm text-ink-2">Nobody has inspected this meter yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((outcome) => (
                  <li key={`${outcome.inspected_on}-${outcome.notes}`} className="flex items-start gap-2 text-sm">
                    {outcome.theft_found ? (
                      <Warning size={16} weight="bold" className="mt-0.5 text-signal" aria-hidden />
                    ) : (
                      <CheckCircle size={16} weight="bold" className="mt-0.5 text-ok" aria-hidden />
                    )}
                    <span>
                      {formatDay(outcome.inspected_on)}: {outcome.theft_found ? `theft found${outcome.theft_style ? `, ${outcome.theft_style}` : ""}` : "all clear"}
                      {outcome.notes && <span className="block text-ink-2">{outcome.notes}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        </aside>
      </div>
    </div>
  );
}
