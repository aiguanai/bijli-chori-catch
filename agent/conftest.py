"""Tests expect a budget of 20, whatever the dashboard's setting is."""

import pytest
from sqlalchemy import text

from shared.db import get_engine

SET_BUDGET = text(
    "INSERT INTO settings (key, value) VALUES ('weekly_budget', :value) "
    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
)


@pytest.fixture(autouse=True)
def fixed_budget():
    with get_engine().begin() as conn:
        saved = conn.execute(text("SELECT value FROM settings WHERE key = 'weekly_budget'")).scalar_one_or_none()
        conn.execute(SET_BUDGET, {"value": "20"})
    yield
    with get_engine().begin() as conn:
        if saved is None:
            conn.execute(text("DELETE FROM settings WHERE key = 'weekly_budget'"))
        else:
            conn.execute(SET_BUDGET, {"value": saved})
