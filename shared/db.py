"""Database connection. Everyone gets their engine from here."""

from functools import lru_cache

from sqlalchemy import URL, Engine, create_engine

from shared.config import load_settings


@lru_cache
def get_engine() -> Engine:
    settings = load_settings()
    url = URL.create(
        "postgresql+psycopg",
        username=settings.postgres_user,
        password=settings.postgres_password,
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
    )
    return create_engine(url, pool_pre_ping=True)
