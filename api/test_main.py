"""Needs Postgres up and shared.seed_fake_data already run. No test calls a real LLM."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import api.main as main
from agent.planner import PlannerNotConfigured, PlanningFailed
from shared.db import get_engine

WEEK = date(2099, 1, 5)  # a Monday no real plan will use
NOTE = "api test row"

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clean_rows():
    def clean():
        with get_engine().begin() as conn:
            conn.execute(text("DELETE FROM inspection_plan WHERE week_start = :w"), {"w": WEEK})
            conn.execute(text("DELETE FROM inspection_outcomes WHERE notes = :n"), {"n": NOTE})

    budget = client.get("/budget").json()
    client.put("/budget", json={"weekly_budget": 20})  # tests must not depend on the dashboard's setting
    clean()
    yield
    clean()
    client.put("/budget", json=budget)


def run_baseline() -> list[dict]:
    response = client.post("/plans/run", json={"week_start": str(WEEK), "method": "baseline"})
    assert response.status_code == 200
    return response.json()


def test_run_baseline_then_get_plan_in_rank_order():
    rows = run_baseline()
    assert len(rows) == 20

    response = client.get("/plans", params={"week_start": str(WEEK)})
    assert response.status_code == 200
    assert [row["plan_id"] for row in response.json()] == [row["plan_id"] for row in rows]
    assert [row["rank"] for row in response.json()] == list(range(1, 21))


def test_get_plan_for_empty_week_is_empty():
    assert client.get("/plans", params={"week_start": str(WEEK)}).json() == []


def test_get_plan_rejects_bad_date():
    assert client.get("/plans", params={"week_start": "soon"}).status_code == 422


def test_run_rejects_non_monday_and_unknown_method():
    response = client.post("/plans/run", json={"week_start": "2099-01-06", "method": "baseline"})
    assert response.status_code == 422
    response = client.post("/plans/run", json={"week_start": str(WEEK), "method": "magic"})
    assert response.status_code == 422


def test_run_agent_calls_plan_inspections(monkeypatch):
    weeks = []
    monkeypatch.setattr(main, "plan_inspections", lambda week: weeks.append(week) or [])
    response = client.post("/plans/run", json={"week_start": str(WEEK), "method": "agent"})
    assert response.status_code == 200
    assert weeks == [WEEK]


@pytest.mark.parametrize(("error", "status"), [(PlannerNotConfigured("x"), 503), (PlanningFailed("x"), 502)])
def test_run_agent_reports_failures(monkeypatch, error, status):
    def fail(week):
        raise error

    monkeypatch.setattr(main, "plan_inspections", fail)
    response = client.post("/plans/run", json={"week_start": str(WEEK), "method": "agent"})
    assert response.status_code == status


@pytest.mark.parametrize(("action", "status"), [("approve", "approved"), ("reject", "rejected")])
def test_decide_plan_row(action, status):
    plan_id = run_baseline()[0]["plan_id"]
    response = client.post(f"/plans/{plan_id}/{action}")
    assert response.status_code == 200
    assert response.json()["status"] == status


def test_decision_is_final():
    plan_id = run_baseline()[0]["plan_id"]
    client.post(f"/plans/{plan_id}/approve")
    response = client.post(f"/plans/{plan_id}/reject")
    assert response.status_code == 409
    assert "already approved" in response.json()["detail"]


def test_decide_unknown_plan_row_is_404():
    assert client.post("/plans/999999999/approve").status_code == 404


def test_rerun_through_api_keeps_approved_row():
    plan_id = run_baseline()[0]["plan_id"]
    client.post(f"/plans/{plan_id}/approve")
    run_baseline()
    rows = client.get("/plans", params={"week_start": str(WEEK)}).json()
    assert {row["plan_id"]: row["status"] for row in rows}[plan_id] == "approved"


def test_record_outcome_writes_a_row():
    body = {"meter_id": "MH07", "theft_found": True, "notes": NOTE, "inspected_on": "2021-02-24", "theft_style": "fixed scaling"}
    response = client.post("/outcomes", json=body)
    assert response.status_code == 201
    with get_engine().connect() as conn:
        row = conn.execute(text("SELECT * FROM inspection_outcomes WHERE notes = :n"), {"n": NOTE}).mappings().one()
    assert row["meter_id"] == "MH07"
    assert row["theft_found"] is True
    assert row["inspected_on"] == date(2021, 2, 24)
    assert row["theft_style"] == "fixed scaling"


def test_record_outcome_defaults_to_today():
    response = client.post("/outcomes", json={"meter_id": "MH07", "theft_found": False, "notes": NOTE})
    assert response.status_code == 201
    assert response.json()["inspected_on"]


def test_record_outcome_rejects_unknown_meter():
    response = client.post("/outcomes", json={"meter_id": "MH99", "theft_found": False, "notes": NOTE})
    assert response.status_code == 404


def test_budget_get_and_put():
    assert client.put("/budget", json={"weekly_budget": 7}).json() == {"weekly_budget": 7}
    assert client.get("/budget").json() == {"weekly_budget": 7}
    assert len(run_baseline()) == 7


def test_budget_must_be_positive():
    assert client.put("/budget", json={"weekly_budget": 0}).status_code == 422


def test_meter_history():
    rows = client.get("/meters/MH07/history", params={"days": 5}).json()
    assert len(rows) == 5
    assert rows[0]["scored_at"].endswith("+05:30")


def test_meter_history_unknown_meter_is_404():
    assert client.get("/meters/MH99/history").status_code == 404


def test_meter_history_rejects_bad_days():
    assert client.get("/meters/MH07/history", params={"days": 0}).status_code == 422


def test_cors_allows_the_frontend_only():
    allowed = client.options(
        "/budget", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "PUT"}
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    blocked = client.options(
        "/budget", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "PUT"}
    )
    assert "access-control-allow-origin" not in blocked.headers


def test_status_reports_latest_scores():
    body = client.get("/status").json()
    assert body["latest_scored_at"].endswith("+05:30")
    assert body["meters"] == 84
    assert body["model_version"]
    assert len(body["test_meters"]) == 17


def test_list_meters_highest_first():
    rows = client.get("/meters").json()
    assert len(rows) == 84
    scores = [row["risk_score"] for row in rows]
    assert scores == sorted(scores, reverse=True)
    assert set(rows[0]["features"]) >= {"daily_kwh", "peer_ratio_7d"}


def test_fleet_scores_lines_up_days_and_meters():
    body = client.get("/fleet/scores", params={"days": 5}).json()
    assert len(body["dates"]) == 5
    assert body["dates"] == sorted(body["dates"])
    assert len(body["scores"]) == 84
    assert all(len(series) == 5 for series in body["scores"].values())


def test_fleet_scores_rejects_bad_days():
    assert client.get("/fleet/scores", params={"days": 0}).status_code == 422


def test_meter_peers():
    body = client.get("/meters/MH07/peers").json()
    assert body["city"] == "Mathura"
    assert body["peer_count"] > 0
    assert client.get("/meters/MH99/peers").status_code == 404


def test_outcomes_list_shows_a_recorded_outcome():
    client.post("/outcomes", json={"meter_id": "MH07", "theft_found": True, "notes": NOTE})
    rows = client.get("/outcomes").json()
    assert any(row["meter_id"] == "MH07" and row["notes"] == NOTE for row in rows)


def test_plan_weeks_counts_by_status():
    run_baseline()
    weeks = {row["week_start"]: row for row in client.get("/plans/weeks").json()}
    assert weeks[str(WEEK)]["total"] == 20
    assert weeks[str(WEEK)]["pending"] == 20
