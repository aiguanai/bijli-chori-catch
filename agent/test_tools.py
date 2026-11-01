"""Needs Postgres up and shared.seed_fake_data already run."""

from datetime import datetime

import pytest
from sqlalchemy import text

from agent.tools import compare_with_peers, get_meter_history, get_top_risky_meters, get_weekly_budget
from shared.config import IST
from shared.db import get_engine
from shared.seed_fake_data import RISING_METERS, SPIKE_METER, STEADY_METER

FEATURE_KEYS = {
    "daily_kwh",
    "kwh_7d_mean",
    "kwh_30d_mean",
    "peer_ratio",
    "peer_ratio_7d",
    "night_share",
    "zero_share",
    "power_cut_minutes",
    "avg_voltage",
}


def test_seed_has_84_meters_for_60_days():
    with get_engine().connect() as conn:
        rows, meters, days = conn.execute(
            text(
                "SELECT count(*), count(DISTINCT meter_id), count(DISTINCT scored_at) "
                "FROM risk_scores WHERE model_version = 'fake-v0'"
            )
        ).one()
    assert (rows, meters, days) == (84 * 60, 84, 60)


def test_top_risky_meters_finds_the_rising_meters_first():
    top = get_top_risky_meters(7)
    assert {row["meter_id"] for row in top[:6]} == set(RISING_METERS)
    assert top[6]["meter_id"] == STEADY_METER
    assert [row["risk_score"] for row in top] == sorted((row["risk_score"] for row in top), reverse=True)
    assert set(top[0]["features"]) == FEATURE_KEYS
    assert top[0]["scored_at"].endswith("+05:30")


def test_top_risky_meters_ignores_one_day_spike_and_rejects_bad_n():
    assert SPIKE_METER not in {row["meter_id"] for row in get_top_risky_meters(20)}
    with pytest.raises(ValueError):
        get_top_risky_meters(0)


def test_top_risky_meters_drops_meters_that_stopped_reporting():
    stale = {"meter_id": "MH99", "scored_at": datetime(2020, 1, 1, 23, 59, tzinfo=IST)}
    with get_engine().begin() as conn:
        conn.execute(
            text("INSERT INTO risk_scores (meter_id, scored_at, risk_score) VALUES (:meter_id, :scored_at, 0.99)"),
            stale,
        )
    try:
        assert "MH99" not in {row["meter_id"] for row in get_top_risky_meters(84)}
    finally:
        with get_engine().begin() as conn:
            conn.execute(text("DELETE FROM risk_scores WHERE meter_id = 'MH99'"))


def test_compare_with_peers_uses_only_the_same_city():
    assert compare_with_peers("MH07")["peer_count"] == 37
    assert compare_with_peers("BR11")["peer_count"] == 45


def test_compare_with_peers_shows_rising_meter_above_its_peers():
    result = compare_with_peers("MH07")
    assert result["city"] == "Mathura"
    assert result["risk_score"] > result["peer_median_risk_score"]
    assert result["risk_percentile"] >= 90
    assert result["peer_ratio_7d"] < 1


def test_compare_with_peers_rejects_unknown_meters():
    with pytest.raises(ValueError):
        compare_with_peers("XX01")
    with pytest.raises(ValueError):
        compare_with_peers("MH99")


def test_meter_history_is_oldest_first_and_limited_to_days():
    history = get_meter_history("MH07", 14)
    assert len(history) == 14
    assert [row["scored_at"] for row in history] == sorted(row["scored_at"] for row in history)
    assert history[-1]["risk_score"] > history[0]["risk_score"]
    assert set(history[0]["features"]) == FEATURE_KEYS


def test_meter_history_handles_no_data_and_bad_days():
    assert get_meter_history("MH99", 14) == []
    with pytest.raises(ValueError):
        get_meter_history("MH07", 0)


def test_weekly_budget_comes_from_settings():
    assert get_weekly_budget() == 20
