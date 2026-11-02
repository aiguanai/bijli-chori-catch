"""FastAPI backend for the dashboard.

Run from the repo root: uvicorn api.main:app --reload
"""

from datetime import date, datetime
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text

from agent.planner import PlannerNotConfigured, PlanningFailed, plan_baseline, plan_inspections
from agent.tools import compare_with_peers, get_meter_history, get_top_risky_meters, get_weekly_budget
from shared.config import IST, get_test_meters
from shared.db import get_engine

MAX_METERS = 1000  # far above the 84 CEEW meters; only there to bound the query
MAX_FLEET_DAYS = 365

app = FastAPI(title="BijliChori API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PlanRun(BaseModel):
    week_start: date
    method: Literal["agent", "baseline"]


class Outcome(BaseModel):
    meter_id: str
    theft_found: bool
    notes: str | None = None
    inspected_on: date | None = None  # today in IST if left out
    theft_style: str | None = None


class WeeklyBudget(BaseModel):
    weekly_budget: int = Field(ge=1)


def _meter_exists(meter_id: str) -> bool:
    query = text("SELECT EXISTS (SELECT 1 FROM risk_scores WHERE meter_id = :meter_id)")
    with get_engine().connect() as conn:
        return conn.execute(query, {"meter_id": meter_id}).scalar_one()


def _decide_plan(plan_id: int, status: str) -> dict:
    """Move a pending row to approved or rejected. A decision is final."""
    with get_engine().begin() as conn:
        row = (
            conn.execute(
                text(
                    "UPDATE inspection_plan SET status = :status "
                    "WHERE plan_id = :plan_id AND status = 'pending' "
                    "RETURNING plan_id, week_start, meter_id, rank, reason, status"
                ),
                {"status": status, "plan_id": plan_id},
            )
            .mappings()
            .first()
        )
        if row is not None:
            return dict(row)
        current = conn.execute(
            text("SELECT status FROM inspection_plan WHERE plan_id = :plan_id"), {"plan_id": plan_id}
        ).scalar_one_or_none()
    if current is None:
        raise HTTPException(404, f"No plan row {plan_id}")
    raise HTTPException(409, f"Plan row {plan_id} is already {current}")


@app.get("/plans")
def get_plan(week_start: date) -> list[dict]:
    query = text(
        "SELECT plan_id, week_start, meter_id, rank, reason, status FROM inspection_plan "
        "WHERE week_start = :week_start ORDER BY rank"
    )
    with get_engine().connect() as conn:
        return [dict(row) for row in conn.execute(query, {"week_start": week_start}).mappings()]


@app.get("/plans/weeks")
def list_plan_weeks() -> list[dict]:
    """One row per planned week, newest first, with counts by status."""
    query = text(
        "SELECT week_start, count(*) AS total, "
        "count(*) FILTER (WHERE status = 'pending') AS pending, "
        "count(*) FILTER (WHERE status = 'approved') AS approved, "
        "count(*) FILTER (WHERE status = 'rejected') AS rejected "
        "FROM inspection_plan GROUP BY week_start ORDER BY week_start DESC"
    )
    with get_engine().connect() as conn:
        return [dict(row) for row in conn.execute(query).mappings()]


@app.post("/plans/run")
def run_plan(run: PlanRun) -> list[dict]:
    """Writes the week's plan. With method=agent this can take minutes."""
    planner = plan_inspections if run.method == "agent" else plan_baseline
    try:
        return planner(run.week_start)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except PlannerNotConfigured as error:
        raise HTTPException(503, str(error)) from error
    except PlanningFailed as error:
        raise HTTPException(502, str(error)) from error


@app.post("/plans/{plan_id}/approve")
def approve_plan(plan_id: int) -> dict:
    return _decide_plan(plan_id, "approved")


@app.post("/plans/{plan_id}/reject")
def reject_plan(plan_id: int) -> dict:
    return _decide_plan(plan_id, "rejected")


@app.post("/outcomes", status_code=201)
def record_outcome(outcome: Outcome) -> dict:
    if not _meter_exists(outcome.meter_id):
        raise HTTPException(404, f"No meter {outcome.meter_id}")
    values = outcome.model_dump()
    values["inspected_on"] = outcome.inspected_on or datetime.now(IST).date()
    query = text(
        "INSERT INTO inspection_outcomes (meter_id, inspected_on, theft_found, theft_style, notes) "
        "VALUES (:meter_id, :inspected_on, :theft_found, :theft_style, :notes)"
    )
    with get_engine().begin() as conn:
        conn.execute(query, values)
    return values


@app.get("/outcomes")
def list_outcomes() -> list[dict]:
    query = text(
        "SELECT meter_id, inspected_on, theft_found, theft_style, notes FROM inspection_outcomes "
        "ORDER BY inspected_on DESC, meter_id"
    )
    with get_engine().connect() as conn:
        return [dict(row) for row in conn.execute(query).mappings()]


@app.get("/budget")
def read_weekly_budget() -> WeeklyBudget:
    return WeeklyBudget(weekly_budget=get_weekly_budget())


@app.put("/budget")
def set_weekly_budget(budget: WeeklyBudget) -> WeeklyBudget:
    query = text(
        "INSERT INTO settings (key, value) VALUES ('weekly_budget', :value) "
        "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
    )
    with get_engine().begin() as conn:
        conn.execute(query, {"value": str(budget.weekly_budget)})
    return budget


@app.get("/status")
def read_status() -> dict:
    """What the dashboard is looking at: how fresh the scores are and which model made them."""
    query = text(
        "SELECT max(scored_at) AS latest, count(*) AS score_rows, count(DISTINCT meter_id) AS meters "
        "FROM risk_scores"
    )
    version_query = text("SELECT model_version FROM risk_scores ORDER BY scored_at DESC LIMIT 1")
    with get_engine().connect() as conn:
        row = conn.execute(query).mappings().one()
        model_version = conn.execute(version_query).scalar_one_or_none()
    latest = row["latest"]
    return {
        "latest_scored_at": latest.astimezone(IST).isoformat() if latest else None,
        "model_version": model_version,
        "score_rows": row["score_rows"],
        "meters": row["meters"],
        "test_meters": sorted(get_test_meters()),
    }


@app.get("/meters")
def list_meters() -> list[dict]:
    """Every current meter with its latest score, highest first."""
    return get_top_risky_meters(MAX_METERS)


@app.get("/fleet/scores")
def read_fleet_scores(days: int = Query(60, ge=1, le=MAX_FLEET_DAYS)) -> dict:
    """Daily scores for all meters, for the replay. One null per day a meter has no score."""
    query = text(
        """
        SELECT meter_id, (scored_at AT TIME ZONE 'Asia/Kolkata')::date AS day, risk_score
        FROM risk_scores
        WHERE scored_at > (SELECT max(scored_at) FROM risk_scores) - make_interval(days => :days)
        ORDER BY day, meter_id
        """
    )
    with get_engine().connect() as conn:
        rows = conn.execute(query, {"days": days}).mappings().all()
    dates = sorted({row["day"] for row in rows})
    position = {day: index for index, day in enumerate(dates)}
    scores: dict[str, list[float | None]] = {}
    for row in rows:
        series = scores.setdefault(row["meter_id"], [None] * len(dates))
        series[position[row["day"]]] = row["risk_score"]
    return {"dates": dates, "scores": scores}


@app.get("/meters/{meter_id}/history")
def read_meter_history(meter_id: str, days: int = Query(30, ge=1)) -> list[dict]:
    if not _meter_exists(meter_id):
        raise HTTPException(404, f"No meter {meter_id}")
    return get_meter_history(meter_id, days)


@app.get("/meters/{meter_id}/peers")
def read_meter_peers(meter_id: str) -> dict:
    if not _meter_exists(meter_id):
        raise HTTPException(404, f"No meter {meter_id}")
    return compare_with_peers(meter_id)
