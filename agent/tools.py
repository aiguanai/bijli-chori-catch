"""Read-only tools for the inspection planner.

"Now" is always the newest scored_at in risk_scores, never the wall clock,
because scores come from replayed historic data. All results are JSON-friendly.
"""

from datetime import datetime
from statistics import median

from sqlalchemy import text

from shared.config import IST
from shared.db import get_engine

CITY_NAMES = {"MH": "Mathura", "BR": "Bareilly"}
DEFAULT_WEEKLY_BUDGET = 20

# A meter counts as current if it scored within this many days. Gaps of a day
# or two are normal, and a meter that stopped reporting must not stay ranked.
LOOKBACK_DAYS = 7


def _iso(moment: datetime) -> str:
    return moment.astimezone(IST).isoformat()


def _city_code(meter_id: str) -> str:
    code = meter_id[:2]
    if code not in CITY_NAMES:
        raise ValueError(f"Unknown city in meter id: {meter_id!r}")
    return code


def get_top_risky_meters(n: int) -> list[dict]:
    """The n current meters with the highest latest risk score, highest first."""
    if n <= 0:
        raise ValueError("n must be positive")

    query = text(
        """
        SELECT * FROM (
            SELECT DISTINCT ON (meter_id) meter_id, scored_at, risk_score, model_version, features
            FROM risk_scores
            WHERE scored_at > (SELECT max(scored_at) FROM risk_scores) - make_interval(days => :lookback)
            ORDER BY meter_id, scored_at DESC
        ) latest
        ORDER BY risk_score DESC, meter_id
        LIMIT :n
        """
    )
    with get_engine().connect() as conn:
        rows = conn.execute(query, {"lookback": LOOKBACK_DAYS, "n": n}).mappings().all()

    return [
        {
            "meter_id": row["meter_id"],
            "city": CITY_NAMES.get(row["meter_id"][:2]),
            "scored_at": _iso(row["scored_at"]),
            "risk_score": row["risk_score"],
            "model_version": row["model_version"],
            "features": row["features"],
        }
        for row in rows
    ]


def compare_with_peers(meter_id: str) -> dict:
    """Compare a meter's latest score and usage with the other meters in its city."""
    code = _city_code(meter_id)

    latest_query = text(
        "SELECT scored_at, risk_score, features FROM risk_scores "
        "WHERE meter_id = :meter_id ORDER BY scored_at DESC LIMIT 1"
    )
    peers_query = text(
        """
        SELECT DISTINCT ON (meter_id) meter_id, risk_score, features
        FROM risk_scores
        WHERE meter_id LIKE :prefix AND meter_id <> :meter_id
          AND scored_at <= :scored_at
          AND scored_at > CAST(:scored_at AS timestamptz) - make_interval(days => :lookback)
        ORDER BY meter_id, scored_at DESC
        """
    )
    with get_engine().connect() as conn:
        latest = conn.execute(latest_query, {"meter_id": meter_id}).mappings().first()
        if latest is None:
            raise ValueError(f"No scores for meter: {meter_id!r}")
        peers = (
            conn.execute(
                peers_query,
                {
                    "prefix": f"{code}%",
                    "meter_id": meter_id,
                    "scored_at": latest["scored_at"],
                    "lookback": LOOKBACK_DAYS,
                },
            )
            .mappings()
            .all()
        )

    features = latest["features"] or {}
    peer_scores = [peer["risk_score"] for peer in peers]
    peer_kwh = [peer["features"]["daily_kwh"] for peer in peers if (peer["features"] or {}).get("daily_kwh") is not None]

    return {
        "meter_id": meter_id,
        "city": CITY_NAMES[code],
        "scored_at": _iso(latest["scored_at"]),
        "risk_score": latest["risk_score"],
        "peer_count": len(peers),
        "peer_median_risk_score": median(peer_scores) if peer_scores else None,
        "risk_percentile": round(100 * sum(s < latest["risk_score"] for s in peer_scores) / len(peer_scores), 1)
        if peer_scores
        else None,
        "daily_kwh": features.get("daily_kwh"),
        "peer_median_daily_kwh": median(peer_kwh) if peer_kwh else None,
        "peer_ratio": features.get("peer_ratio"),
        "peer_ratio_7d": features.get("peer_ratio_7d"),
    }


def get_meter_history(meter_id: str, days: int) -> list[dict]:
    """Daily scores and features for the last `days` days, oldest first.

    Comes from risk_scores only: there is no raw readings table. Empty if the
    meter has no scores in that period.
    """
    if days <= 0:
        raise ValueError("days must be positive")

    query = text(
        """
        SELECT scored_at, risk_score, model_version, features
        FROM risk_scores
        WHERE meter_id = :meter_id
          AND scored_at > (SELECT max(scored_at) FROM risk_scores) - make_interval(days => :days)
        ORDER BY scored_at
        """
    )
    with get_engine().connect() as conn:
        rows = conn.execute(query, {"meter_id": meter_id, "days": days}).mappings().all()

    return [
        {
            "scored_at": _iso(row["scored_at"]),
            "risk_score": row["risk_score"],
            "model_version": row["model_version"],
            "features": row["features"],
        }
        for row in rows
    ]


def get_weekly_budget() -> int:
    """Inspections allowed per week, from settings."""
    query = text("SELECT value FROM settings WHERE key = 'weekly_budget'")
    with get_engine().connect() as conn:
        value = conn.execute(query).scalar_one_or_none()
    return DEFAULT_WEEKLY_BUDGET if value is None else int(value)
