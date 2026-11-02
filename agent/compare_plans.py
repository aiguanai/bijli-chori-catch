"""Run the baseline and the agent on the fake data and compare what they pick.

Run from the repo root: python -m agent.compare_plans

Replaces pending rows for DEMO_WEEK. The agent's plan is left in the table, or
the baseline's if the agent cannot run.
"""

from datetime import date

from agent.planner import PlannerNotConfigured, PlanningFailed, plan_baseline, plan_inspections
from shared.seed_fake_data import RISING_METERS, SPIKE_METER, STEADY_METER

DEMO_WEEK = date(2021, 2, 22)  # first Monday after the fake data ends


def report(name: str, rows: list[dict]) -> None:
    picked = {row["meter_id"] for row in rows}
    print(f"\n{name}: {len(rows)} meters picked")
    print(f"  planted rising meters: {len(picked & set(RISING_METERS))} of {len(RISING_METERS)}")
    print(f"  decoy {STEADY_METER} picked: {STEADY_METER in picked}")
    print(f"  decoy {SPIKE_METER} picked: {SPIKE_METER in picked}")
    print(f"  other meters picked: {len(picked - {*RISING_METERS, SPIKE_METER, STEADY_METER})}")


def main() -> None:
    baseline = plan_baseline(DEMO_WEEK)
    report("Baseline", baseline)

    try:
        agent = plan_inspections(DEMO_WEEK)
    except PlannerNotConfigured as error:
        print(f"\nAgent skipped: {error}")
        return
    except PlanningFailed as error:
        print(f"\nAgent failed: {error}")
        return

    report("Agent", agent)
    print("\nAgent reasons:")
    for row in agent:
        print(f"  {row['rank']:>2}. {row['meter_id']}: {row['reason']}")


if __name__ == "__main__":
    main()
