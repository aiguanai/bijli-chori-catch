from shared.config import get_test_meters, load_settings
from shared.db import get_engine


def test_load_settings_reads_env():
    settings = load_settings()
    assert settings.postgres_db
    assert settings.postgres_port > 0


def test_get_engine_uses_psycopg():
    assert get_engine().dialect.driver == "psycopg"


def test_test_meters_are_17_split_by_city_and_sorted():
    meters = get_test_meters()
    assert len(meters) == len(set(meters)) == 17
    assert sum(m.startswith("MH") for m in meters) == 8
    assert sum(m.startswith("BR") for m in meters) == 9
    assert meters == sorted(meters)
