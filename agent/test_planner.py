"""Needs Postgres up and shared.seed_fake_data already run. No test calls a real LLM."""

import json
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import text

import agent.planner as planner
from agent.planner import PlannerNotConfigured, PlanningFailed, plan_baseline, plan_inspections, summarise_history
from agent.tools import get_meter_history
from shared.config import Settings
from shared.db import get_engine
from shared.seed_fake_data import RISING_METERS, STEADY_METER

WEEK = date(2099, 1, 5)  # a Monday no real plan will use


@pytest.fixture(autouse=True)
def clean_week():
    def clean():
        with get_engine().begin() as conn:
            conn.execute(text("DELETE FROM inspection_plan WHERE week_start = :w"), {"w": WEEK})

    clean()
    yield
    clean()


def week_rows() -> dict[str, dict]:
    with get_engine().connect() as conn:
        rows = conn.execute(text("SELECT * FROM inspection_plan WHERE week_start = :w"), {"w": WEEK}).mappings()
        return {row["meter_id"]: dict(row) for row in rows}


def set_status(meter_id: str, status: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE inspection_plan SET status = :s WHERE week_start = :w AND meter_id = :m"),
            {"s": status, "w": WEEK, "m": meter_id},
        )


def tool_call(name: str, call_id: str, **args) -> SimpleNamespace:
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=json.dumps(args)))


def use_fake_llm(monkeypatch, turns: list[list[SimpleNamespace]]) -> list[list[dict]]:
    """Script the model's tool calls, one list per turn. Returns the messages it was sent."""
    remaining = iter(turns)
    sent = []

    def create(**kwargs):
        sent.append(list(kwargs["messages"]))
        message = SimpleNamespace(content=None, tool_calls=next(remaining))
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(planner, "_make_client", lambda: (client, "fake-model"))
    return sent


def own_past(meter_id: str) -> str:
    summary = summarise_history(get_meter_history(meter_id, 28))
    return (
        f"Over {summary['days_covered']} days its score moved from {summary['risk_score_start']} "
        f"to {summary['risk_score_now']} and 7-day usage changed by {abs(summary['kwh_7d_change_pct'])}%."
    )


def peers(meter_id: str) -> str:
    return f"Its 7-day usage is {summarise_history(get_meter_history(meter_id, 28))['peer_ratio_7d_now']} times the city median."


def good_pick(meter_id: str) -> dict:
    return {"meter_id": meter_id, "own_past": own_past(meter_id), "peers": peers(meter_id)}


def investigate(meter_id: str) -> list[SimpleNamespace]:
    return [
        tool_call("compare_with_peers", f"c-{meter_id}", meter_id=meter_id),
        tool_call("get_meter_history", f"h-{meter_id}", meter_id=meter_id, days=28),
    ]


def submit(meter_id: str, call_id: str = "s", **changes) -> SimpleNamespace:
    pick = {**good_pick(meter_id), **changes}
    return tool_call("submit_plan", call_id, picks=[pick])


def tool_results(messages: list[dict]) -> list[str]:
    return [message["content"] for message in messages if message["role"] == "tool"]


def test_baseline_takes_top_meters_up_to_budget():
    rows = plan_baseline(WEEK)
    assert len(rows) == 20
    assert [row["rank"] for row in rows] == list(range(1, 21))
    assert {row["meter_id"] for row in rows[:6]} == set(RISING_METERS)
    assert rows[6]["meter_id"] == STEADY_METER
    assert all(row["status"] == "pending" for row in rows)


def test_baseline_reason_keeps_own_past_and_peers_separate():
    reason = plan_baseline(WEEK)[0]["reason"]
    assert "Against its own past" in reason
    assert "Against city peers" in reason


def test_rerun_replaces_pending_but_keeps_decided_rows():
    first = plan_baseline(WEEK)
    approved, rejected = first[0], first[1]
    set_status(approved["meter_id"], "approved")
    set_status(rejected["meter_id"], "rejected")

    plan_baseline(WEEK)
    rows = week_rows()

    assert rows[approved["meter_id"]]["plan_id"] == approved["plan_id"]
    assert rows[approved["meter_id"]]["status"] == "approved"
    assert rows[rejected["meter_id"]]["plan_id"] == rejected["plan_id"]
    assert rows[rejected["meter_id"]]["status"] == "rejected"
    assert first[2]["plan_id"] not in {row["plan_id"] for row in rows.values()}


def test_rerun_has_no_duplicate_meters_or_ranks_and_approved_uses_budget():
    first = plan_baseline(WEEK)
    set_status(first[1]["meter_id"], "approved")
    set_status(first[2]["meter_id"], "rejected")

    plan_baseline(WEEK)
    rows = list(week_rows().values())
    ranks = [row["rank"] for row in rows]

    assert len(ranks) == len(set(ranks))
    assert sum(row["status"] != "rejected" for row in rows) == 20


def test_planners_reject_a_week_start_that_is_not_monday():
    with pytest.raises(ValueError):
        plan_baseline(date(2099, 1, 6))
    with pytest.raises(ValueError):
        plan_inspections(date(2099, 1, 6))


def test_agent_writes_a_reason_from_its_parts(monkeypatch):
    use_fake_llm(
        monkeypatch,
        [investigate("MH07"), [submit("MH07", other_evidence="Supply was good.")]],
    )
    rows = plan_inspections(WEEK)
    assert [(row["meter_id"], row["rank"], row["status"]) for row in rows] == [("MH07", 1, "pending")]
    assert rows[0]["reason"] == f"{own_past('MH07')} {peers('MH07')} Supply was good."


def test_agent_must_investigate_before_picking(monkeypatch):
    sent = use_fake_llm(
        monkeypatch,
        [[submit("MH07")], investigate("MH07"), [submit("MH07")]],
    )
    assert [row["meter_id"] for row in plan_inspections(WEEK)] == ["MH07"]
    error = tool_results(sent[1])[0]
    assert "compare_with_peers" in error and "get_meter_history" in error


@pytest.mark.parametrize(
    ("changes", "expected"),
    [
        ({"own_past": "Risk score went up a lot."}, "own_past must cite a number"),
        ({"peers": "It sits above its peers."}, "peers must cite a number"),
        ({"other_evidence": "Usage fell. It kept falling."}, "2 or 3 sentences"),
        ({"other_evidence": "Its score was 0.6015 on one day."}, "not in its summary or peer comparison"),
        ({"other_evidence": "Cuts reached 119 minutes."}, "not in its summary or peer comparison"),
        ({"other_evidence": "This began on 2021 02 10."}, "not in its summary or peer comparison"),
    ],
)
def test_agent_reasons_are_checked(monkeypatch, changes, expected):
    sent = use_fake_llm(
        monkeypatch,
        [investigate("MH07"), [submit("MH07", **changes)], [submit("MH07")]],
    )
    plan_inspections(WEEK)
    assert expected in tool_results(sent[2])[-1]


def test_agent_cannot_exceed_budget(monkeypatch):
    monkeypatch.setattr(planner, "get_weekly_budget", lambda: 1)
    picks = [good_pick(m) for m in ("MH07", "MH21")]
    sent = use_fake_llm(
        monkeypatch,
        [[*investigate("MH07"), *investigate("MH21")], [tool_call("submit_plan", "s", picks=picks)], [submit("MH07")]],
    )
    assert len(plan_inspections(WEEK)) == 1
    assert "only 1 places are left" in tool_results(sent[2])[-1]


def test_agent_cannot_pick_a_meter_already_decided(monkeypatch):
    plan_baseline(WEEK)
    set_status("MH07", "rejected")
    sent = use_fake_llm(
        monkeypatch,
        [investigate("MH07"), [submit("MH07")], investigate("MH21"), [submit("MH21")]],
    )
    plan_inspections(WEEK)
    rows = week_rows()
    assert rows["MH07"]["status"] == "rejected"
    assert "MH21" in rows
    assert "already has a decision" in tool_results(sent[2])[-1]


def test_bad_tool_call_goes_back_to_the_model(monkeypatch):
    sent = use_fake_llm(
        monkeypatch,
        [[tool_call("compare_with_peers", "bad", meter_id="XX01")], [submit("MH07")], investigate("MH07"), [submit("MH07", "s2")]],
    )
    plan_inspections(WEEK)
    assert "Unknown city" in tool_results(sent[1])[0]


def test_failed_agent_writes_nothing_and_keeps_old_plan(monkeypatch):
    before = {row["plan_id"] for row in plan_baseline(WEEK)}
    use_fake_llm(monkeypatch, [investigate("MH07")] * planner.MAX_TURNS)
    with pytest.raises(PlanningFailed):
        plan_inspections(WEEK)
    assert {row["plan_id"] for row in week_rows().values()} == before


@pytest.mark.parametrize(
    ("provider", "key", "model"),
    [("", "k", "m"), ("gemini", "k", "m"), ("openai", "", "m"), ("openai", "k", "")],
)
def test_missing_llm_settings_are_reported(monkeypatch, provider, key, model):
    settings = Settings("u", "p", "d", "h", 5432, provider, key, model)
    monkeypatch.setattr(planner, "load_settings", lambda: settings)
    with pytest.raises(PlannerNotConfigured):
        plan_inspections(WEEK)


def test_summary_uses_first_and_last_day_and_recent_cuts():
    days = [
        {"risk_score": 0.2, "features": {"kwh_7d_mean": 10.0, "peer_ratio_7d": 1.5, "power_cut_minutes": 500}},
        *[{"risk_score": 0.4, "features": {"power_cut_minutes": 70}}] * 7,
        {"risk_score": 0.904, "features": {"kwh_7d_mean": 6.0, "kwh_30d_mean": 8.0, "peer_ratio_7d": 1.1, "power_cut_minutes": None}},
    ]
    summary = summarise_history(days)
    assert summary["days_covered"] == 9
    assert (summary["risk_score_start"], summary["risk_score_now"]) == (0.2, 0.9)
    assert summary["risk_score_change"] == 0.7
    assert summary["kwh_7d_change_pct"] == -40
    assert summary["power_cut_minutes_7d_mean"] == 70


def test_summary_survives_missing_features():
    summary = summarise_history([{"risk_score": 0.5, "features": None}])
    assert summary["kwh_7d_change_pct"] is None
    assert summary["power_cut_minutes_7d_mean"] is None


def test_history_result_for_the_model_names_its_meter(monkeypatch):
    sent = use_fake_llm(monkeypatch, [investigate("MH07"), [submit("MH07")]])
    plan_inspections(WEEK)
    history = json.loads(tool_results(sent[1])[1])
    assert history["meter_id"] == "MH07"
    assert len(history["daily_risk_scores"]) == 28
    assert "days" not in history


def test_agent_cannot_pick_a_meter_with_no_case(monkeypatch):
    sent = use_fake_llm(
        monkeypatch,
        [investigate("MH10"), [submit("MH10")], investigate("MH07"), [submit("MH07")]],
    )
    assert [row["meter_id"] for row in plan_inspections(WEEK)] == ["MH07"]
    assert "MH10: no case" in tool_results(sent[2])[-1]


@pytest.mark.parametrize(
    ("rise", "peer_z", "expected"),
    [(3, 0, True), (0, 3, True), (2.9, 2.9, False), (None, None, False), (-5, 3, True)],
)
def test_a_case_needs_a_rise_or_a_gap_from_peers(rise, peer_z, expected):
    assert planner._has_case({"risk_score_rise_vs_wobble": rise}, {"risk_score_peer_z": peer_z}) is expected


def test_planner_accepts_an_empty_plan(monkeypatch):
    use_fake_llm(monkeypatch, [[tool_call("submit_plan", "s", picks=[])]])
    assert plan_inspections(WEEK) == []


def test_internal_checks_cannot_be_quoted_in_a_reason():
    known = planner._numbers_in({"risk_score_now": 0.93, "risk_score_peer_z": 6.8, "risk_score_rise_vs_wobble": 25.9})
    assert planner._find_unknown_numbers("Peer z score of 6.8, rise of 25.9.", known) == ["6.8", "25.9"]
