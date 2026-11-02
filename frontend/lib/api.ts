import useSWR, { mutate } from "swr";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PlanStatus = "pending" | "approved" | "rejected";

export type Features = {
  daily_kwh: number | null;
  kwh_7d_mean: number | null;
  kwh_30d_mean: number | null;
  peer_ratio: number | null;
  peer_ratio_7d: number | null;
  night_share: number | null;
  zero_share: number | null;
  power_cut_minutes: number | null;
  avg_voltage: number | null;
};

export type Meter = {
  meter_id: string;
  city: string | null;
  scored_at: string;
  risk_score: number;
  model_version: string | null;
  features: Features | null;
};

export type HistoryDay = {
  scored_at: string;
  risk_score: number;
  model_version: string | null;
  features: Features | null;
};

export type Fleet = {
  dates: string[];
  scores: Record<string, (number | null)[]>;
};

export type PlanRow = {
  plan_id: number;
  week_start: string;
  meter_id: string;
  rank: number;
  reason: string | null;
  status: PlanStatus;
};

export type PlanWeek = {
  week_start: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type Outcome = {
  meter_id: string;
  inspected_on: string;
  theft_found: boolean;
  theft_style: string | null;
  notes: string | null;
};

export type Peers = {
  meter_id: string;
  city: string;
  scored_at: string;
  risk_score: number;
  peer_count: number;
  peer_median_risk_score: number | null;
  risk_score_peer_z: number | null;
  risk_percentile: number | null;
  daily_kwh: number | null;
  peer_median_daily_kwh: number | null;
  peer_ratio: number | null;
  peer_ratio_7d: number | null;
};

export type Status = {
  latest_scored_at: string | null;
  model_version: string | null;
  score_rows: number;
  meters: number;
  test_meters: string[];
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${BASE}`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : `Request failed (${response.status})`;
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

const options = { revalidateOnFocus: false, keepPreviousData: true };

export const useStatus = () => useSWR<Status>("/status", request, options);
export const useMeters = () => useSWR<Meter[]>("/meters", request, options);
export const useFleet = () => useSWR<Fleet>("/fleet/scores?days=60", request, options);
export const useBudget = () => useSWR<{ weekly_budget: number }>("/budget", request, options);
export const useOutcomes = () => useSWR<Outcome[]>("/outcomes", request, options);
export const usePlanWeeks = () => useSWR<PlanWeek[]>("/plans/weeks", request, options);
export const usePlan = (week: string | null) =>
  useSWR<PlanRow[]>(week ? `/plans?week_start=${week}` : null, request, options);
export const useHistory = (meterId: string, days: number) =>
  useSWR<HistoryDay[]>(`/meters/${encodeURIComponent(meterId)}/history?days=${days}`, request, options);
export const usePeers = (meterId: string) =>
  useSWR<Peers>(`/meters/${encodeURIComponent(meterId)}/peers`, request, options);

function refreshPlans(week: string) {
  mutate(`/plans?week_start=${week}`);
  mutate("/plans/weeks");
}

export async function decidePlan(row: PlanRow, status: "approved" | "rejected") {
  const verb = status === "approved" ? "approve" : "reject";
  try {
    return await request<PlanRow>(`/plans/${row.plan_id}/${verb}`, { method: "POST" });
  } finally {
    refreshPlans(row.week_start);
  }
}

export async function runPlan(week: string, method: "agent" | "baseline") {
  const rows = await request<PlanRow[]>("/plans/run", {
    method: "POST",
    body: JSON.stringify({ week_start: week, method }),
  });
  refreshPlans(week);
  return rows;
}

export async function saveBudget(weekly_budget: number) {
  const saved = await request<{ weekly_budget: number }>("/budget", {
    method: "PUT",
    body: JSON.stringify({ weekly_budget }),
  });
  mutate("/budget", saved, { revalidate: false });
  return saved;
}

export async function recordOutcome(outcome: {
  meter_id: string;
  theft_found: boolean;
  inspected_on?: string;
  theft_style?: string | null;
  notes?: string | null;
}) {
  const saved = await request<Outcome>("/outcomes", { method: "POST", body: JSON.stringify(outcome) });
  mutate("/outcomes");
  return saved;
}
