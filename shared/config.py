"""Project settings, read from the one .env file at the repo root."""

import json
import os
from dataclasses import dataclass, field
from datetime import timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
TEST_METERS_PATH = ROOT / "shared" / "test_meters.json"

IST = timezone(timedelta(hours=5, minutes=30), "IST")


@dataclass(frozen=True)
class Settings:
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_host: str
    postgres_port: int
    llm_provider: str = ""
    llm_api_key: str = field(default="", repr=False)
    llm_model: str = ""


def load_settings() -> Settings:
    load_dotenv(ROOT / ".env")
    return Settings(
        postgres_user=os.environ["POSTGRES_USER"],
        postgres_password=os.environ["POSTGRES_PASSWORD"],
        postgres_db=os.environ["POSTGRES_DB"],
        postgres_host=os.environ.get("POSTGRES_HOST", "localhost"),
        postgres_port=int(os.environ.get("POSTGRES_PORT", "5432")),
        llm_provider=os.environ.get("LLM_PROVIDER", ""),
        llm_api_key=os.environ.get("LLM_API_KEY", ""),
        llm_model=os.environ.get("LLM_MODEL", ""),
    )


def get_test_meters() -> list[str]:
    """Held-back meters. Nobody trains, tunes or augments on these."""
    return json.loads(TEST_METERS_PATH.read_text())
