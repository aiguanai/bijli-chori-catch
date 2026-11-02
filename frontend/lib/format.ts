const IST = "Asia/Kolkata";

export const THEFT_STYLES = [
  "fixed scaling",
  "random scaling",
  "peak-hour cut",
  "hours zeroed",
  "threshold cut",
  "flat reading",
  "on-off theft",
  "voltage rise",
] as const;

// Dates from the API are plain days; parse at midday so no timezone can move them.
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00+05:30`);

export function formatDay(iso: string) {
  return day(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
}

export function formatShortDay(iso: string) {
  return day(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });
}

export function addDays(iso: string, days: number) {
  const moved = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** The first Monday strictly after a date: the week a plan on that data covers. */
export function nextMonday(iso: string) {
  const weekday = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay();
  return addDays(iso, (8 - weekday) % 7 || 7);
}

export function score(value: number | null | undefined) {
  return value == null ? "n/a" : value.toFixed(2);
}

export function fixed(value: number | null | undefined, digits = 1) {
  return value == null ? "n/a" : value.toFixed(digits);
}

export function percent(value: number | null | undefined) {
  return value == null ? "n/a" : `${Math.round(value * 100)}%`;
}

export function cityOf(meterId: string) {
  return meterId.startsWith("MH") ? "Mathura" : "Bareilly";
}
