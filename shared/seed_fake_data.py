"""Fill risk_scores with fake data so part C can run before the stream exists.

Run from the repo root: python -m shared.seed_fake_data

Each meter's kWh level comes from its real CEEW mean; everything else is
synthetic. Re-running replaces only rows with model_version = 'fake-v0'.
The falling kWh on rising meters exists to give the agent something to explain;
it is not a claim about real thieves (SGCC thieves do not show a drop).
"""

import json
from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import text

from shared.config import DATA_DIR, IST
from shared.db import get_engine

SEED = 42
MODEL_VERSION = "fake-v0"
CITIES = ("MH", "BR")

# Last 60 days on which both cities have real data.
END_DATE = date(2021, 2, 20)
DAYS = 60
BURN_IN_DAYS = 30  # extra days so 30-day means are complete on day one

RISING_METERS = ("MH07", "MH21", "MH36", "BR11", "BR29", "BR44")
SPIKE_METER = "BR18"  # one bad day mid-window, normal again by the end
SPIKE_DAY = 40
STEADY_METER = "MH12"  # medium score all window, never rising


def read_base_kwh() -> dict[str, float]:
    """Mean daily kWh per meter: from the window if covered, else all time."""
    frames = [pd.read_csv(DATA_DIR / f"SM Cleaned Data {city} Aggregated.csv") for city in CITIES]
    daily = pd.concat(frames)
    start = (END_DATE - timedelta(days=DAYS - 1)).isoformat()
    window_mean = daily[daily["Date"].between(start, END_DATE.isoformat())].groupby("meter")["t_kWh"].mean()
    overall_mean = daily.groupby("meter")["t_kWh"].mean()
    return window_mean.reindex(overall_mean.index).fillna(overall_mean).to_dict()


def simulate_kwh(meters: list[str], base_kwh: dict[str, float], rng: np.random.Generator) -> pd.DataFrame:
    """Daily kWh, one column per meter, with shared city weather and meter noise."""
    n_days = DAYS + BURN_IN_DAYS
    dates = pd.date_range(end=END_DATE, periods=n_days, freq="D")
    kwh = pd.DataFrame(index=dates, columns=meters, dtype=float)
    city_weather = {city: rng.normal(1.0, 0.08, n_days) for city in CITIES}
    for meter in meters:
        noise = rng.lognormal(mean=0.0, sigma=0.25, size=n_days)
        kwh[meter] = base_kwh[meter] * city_weather[meter[:2]] * noise
    return kwh


def simulate_scores(meters: list[str], rng: np.random.Generator) -> tuple[pd.DataFrame, dict[str, int]]:
    """Daily risk scores for the 60-day window, plus each rising meter's start day."""
    dates = pd.date_range(end=END_DATE, periods=DAYS, freq="D")
    scores = pd.DataFrame(index=dates, columns=meters, dtype=float)
    for meter in meters:
        level = rng.uniform(0.05, 0.28)
        scores[meter] = level + rng.normal(0.0, 0.025, DAYS)

    rise_starts = {}
    for meter in RISING_METERS:
        start, peak = int(rng.integers(25, 38)), rng.uniform(0.82, 0.95)
        rise_starts[meter] = start
        ramp = np.clip((np.arange(DAYS) - start) / (DAYS - 1 - start), 0.0, 1.0)
        base = scores[meter].to_numpy()
        scores[meter] = base + ramp * (peak - base)

    scores.loc[dates[SPIKE_DAY], SPIKE_METER] = 0.91
    scores[STEADY_METER] = 0.5 + rng.normal(0.0, 0.02, DAYS)
    return scores.clip(0.0, 1.0), rise_starts


def apply_rise_to_kwh(kwh: pd.DataFrame, rise_starts: dict[str, int]) -> None:
    window_days = kwh.index[-DAYS:]
    for meter, start in rise_starts.items():
        drop = np.clip((np.arange(DAYS) - start) / (DAYS - 1 - start), 0.0, 1.0) * 0.55
        kwh.loc[window_days, meter] *= 1.0 - drop


def build_rows(
    kwh: pd.DataFrame, scores: pd.DataFrame, rise_starts: dict[str, int], rng: np.random.Generator
) -> list[dict]:
    peer_ratio = pd.DataFrame(index=kwh.index, columns=kwh.columns, dtype=float)
    for city in CITIES:
        city_meters = [m for m in kwh.columns if m[:2] == city]
        peer_ratio[city_meters] = kwh[city_meters].div(kwh[city_meters].median(axis=1), axis=0)

    kwh_7d = kwh.rolling(7, min_periods=1).mean()
    kwh_30d = kwh.rolling(30, min_periods=1).mean()
    ratio_7d = peer_ratio.rolling(7, min_periods=1).mean()

    rows = []
    for meter in kwh.columns:
        night_share_level = rng.uniform(0.22, 0.38)
        for i, day in enumerate(scores.index):
            rising = np.clip((i - rise_starts[meter]) / (DAYS - 1 - rise_starts[meter]), 0, 1) if meter in rise_starts else 0.0
            features = {
                "daily_kwh": round(float(kwh.at[day, meter]), 3),
                "kwh_7d_mean": round(float(kwh_7d.at[day, meter]), 3),
                "kwh_30d_mean": round(float(kwh_30d.at[day, meter]), 3),
                "peer_ratio": round(float(peer_ratio.at[day, meter]), 3),
                "peer_ratio_7d": round(float(ratio_7d.at[day, meter]), 3),
                "night_share": round(float(np.clip(night_share_level + rng.normal(0, 0.03), 0, 1)), 3),
                "zero_share": round(float(np.clip(rng.normal(0.06, 0.02) + 0.2 * rising, 0, 1)), 3),
                "power_cut_minutes": int(np.clip(rng.normal(87, 45), 0, 600)),
                "avg_voltage": round(float(rng.normal(243, 6)), 2),
            }
            rows.append(
                {
                    "meter_id": meter,
                    "scored_at": datetime.combine(day.date(), time(23, 59), IST),
                    "risk_score": round(float(scores.at[day, meter]), 4),
                    "model_version": MODEL_VERSION,
                    "features": json.dumps(features),
                }
            )
    return rows


def main() -> None:
    rng = np.random.default_rng(SEED)
    base_kwh = read_base_kwh()
    meters = sorted(base_kwh)
    special = {*RISING_METERS, SPIKE_METER, STEADY_METER}
    if not special <= set(meters):
        raise ValueError(f"Unknown meters in seed constants: {sorted(special - set(meters))}")

    kwh = simulate_kwh(meters, base_kwh, rng)
    scores, rise_starts = simulate_scores(meters, rng)
    apply_rise_to_kwh(kwh, rise_starts)
    rows = build_rows(kwh, scores, rise_starts, rng)

    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM risk_scores WHERE model_version = :v"), {"v": MODEL_VERSION})
        conn.execute(
            text(
                "INSERT INTO risk_scores (meter_id, scored_at, risk_score, model_version, features) "
                "VALUES (:meter_id, :scored_at, :risk_score, :model_version, CAST(:features AS jsonb))"
            ),
            rows,
        )
        conn.execute(
            text(
                "INSERT INTO settings (key, value) VALUES ('weekly_budget', '20') "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
            )
        )

    print(f"Seeded {len(rows)} rows for {len(meters)} meters, {scores.index[0].date()} to {END_DATE}.")
    print(f"Rising: {RISING_METERS}; spike: {SPIKE_METER}; steady: {STEADY_METER}")


if __name__ == "__main__":
    main()
