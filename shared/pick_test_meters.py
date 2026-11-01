"""Pick the held-back test meters once and save them to shared/test_meters.json.

Run from the repo root: python -m shared.pick_test_meters
Refuses to run again, because the split must never change.
"""

import json
import random
import sys

import pandas as pd

from shared.config import DATA_DIR, TEST_METERS_PATH

SEED = 42
HOLD_BACK = {"MH": 8, "BR": 9}


def read_meter_ids() -> dict[str, list[str]]:
    return {
        city: sorted(
            pd.read_csv(DATA_DIR / f"SM Cleaned Data {city} Aggregated.csv", usecols=["meter"])["meter"].unique()
        )
        for city in HOLD_BACK
    }


def main() -> None:
    if TEST_METERS_PATH.exists():
        sys.exit(f"{TEST_METERS_PATH} already exists; the test split is picked once.")

    rng = random.Random(SEED)
    meters_by_city = read_meter_ids()
    picked = sorted(m for city, k in HOLD_BACK.items() for m in rng.sample(meters_by_city[city], k))
    TEST_METERS_PATH.write_text(json.dumps(picked, indent=2) + "\n")
    print(f"Saved {len(picked)} test meters: {picked}")


if __name__ == "__main__":
    main()
