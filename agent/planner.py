"""Weekly inspection planning: an LLM agent and a no-LLM baseline.

Both write inspection_plan rows through _write_plan. week_start only labels the
plan: the tools always read the newest scores, so plan the week after the data.
"""

import json
import re
from datetime import date
from itertools import count
from statistics import fmean, pstdev

from openai import OpenAI, OpenAIError
from sqlalchemy import text

from agent.tools import MIN_SPREAD, compare_with_peers, get_meter_history, get_top_risky_meters, get_weekly_budget
from shared.config import load_settings
from shared.db import get_engine

MAX_TURNS = 12
MAX_SENTENCES = 3
PERIODS_IN_DAYS = {7, 30}  # names of the rolling windows, allowed in reasons

# A pick must clear one of these. Both are relative to noise, not fixed scores,
# so they should carry over to the real model; recheck them when it arrives.
MIN_RISE_VS_WOBBLE = 3
MIN_PEER_Z = 3
INTERNAL_CHECKS = {"risk_score_rise_vs_wobble", "risk_score_peer_z"}  # never quoted in a reason

SYSTEM_PROMPT = """You plan weekly electricity theft inspections for a utility in Uttar Pradesh, India.
A person will read your list and approve or reject each meter, so every claim must be checkable.

How to work:
1. Call get_weekly_budget, then get_top_risky_meters with about twice the meters you can inspect.
2. For every meter you might pick, call compare_with_peers and get_meter_history with days=28.
3. Call submit_plan once. It is the only way to finish.

Choosing meters:
- The budget is a ceiling, not a target. A list of 3 or even 0 is right if that is how many meters have a case.
  Every inspection costs a person a trip, so never add a meter just because it is next in the ranking.
- A meter has a case only if at least one of these holds. Picks with neither are rejected.
  a) sustained rise: risk_score_rise_vs_wobble in its summary is at least 3 (last week's mean score minus the first
     week's, in units of its normal day-to-day wobble). One odd day does not count.
  b) stands apart: risk_score_peer_z from compare_with_peers is at least 3 (spreads above the city median).
- If no meter has a case, submit an empty list.
- Those two checks are for your decision only. Do not quote them or use words like z score or standard deviation in a
  reason; say what happened in plain numbers instead, such as the score and the city median score.
- Usage alone neither makes nor clears a case. Real thieves are often heavy users, so usage above peers proves nothing
  either way, and low usage may just be a small home. Use usage to explain a case, not to create one.

Writing the reason, in plain language with no feature names and no dashes used as punctuation:
- Each result names its meter_id. Use only that meter's own figures in its reason.
- Cite only numbers from the summary in get_meter_history and from compare_with_peers, as given. daily_risk_scores is
  for judging the trend; do not quote it. Numbers from anywhere else are rejected. Give no dates, and do not say
  today or yesterday; say "over 28 days" or "the last 7 days".
- own_past: one sentence on how both the risk score and the usage changed against this meter's own past, with numbers.
- peers: one sentence on whether this meter's usage is above or below its city peers, judged from peer_ratio_7d_now
  (the 7-day usage as a multiple of the city median), not from one day. Do not call a meter above its peers because of
  its risk score.
- other_evidence: at most one optional sentence on anything else that matters, such as power cuts.
- A rising score does not mean usage is below peers. Big homes can stay above their peers after dropping.
  Read the numbers for each comparison separately and report what they show, even if the two point different ways.
- Power cuts are supply events, not customer behaviour."""

TOOL_FUNCTIONS = {
    "get_top_risky_meters": get_top_risky_meters,
    "compare_with_peers": compare_with_peers,
    "get_meter_history": get_meter_history,
    "get_weekly_budget": get_weekly_budget,
}


def _function_spec(name: str, description: str, properties: dict) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": [key for key in properties if key != "other_evidence"],
            },
        },
    }


METER_ID = {"type": "string", "description": "Meter ID, e.g. MH02"}

TOOL_SPECS = [
    _function_spec(
        "get_top_risky_meters",
        "Current meters with the highest latest risk score, highest first.",
        {"n": {"type": "integer", "description": "How many meters to return"}},
    ),
    _function_spec(
        "compare_with_peers",
        "A meter's latest score and usage against the other meters in its city.",
        {"meter_id": METER_ID},
    ),
    _function_spec(
        "get_meter_history",
        "A summary of a meter's change over the period, plus its daily scores and features, oldest first.",
        {"meter_id": METER_ID, "days": {"type": "integer", "description": "How many days back to read"}},
    ),
    _function_spec("get_weekly_budget", "How many inspections the utility allows per week.", {}),
    _function_spec(
        "submit_plan",
        "Submit the final inspection list, most important meter first.",
        {
            "picks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "meter_id": METER_ID,
                        "own_past": {"type": "string"},
                        "peers": {"type": "string"},
                        "other_evidence": {"type": "string"},
                    },
                    "required": ["meter_id", "own_past", "peers"],
                },
            }
        },
    ),
]


class PlannerNotConfigured(RuntimeError):
    """LLM settings in .env are missing or name an unsupported provider."""


class PlanningFailed(RuntimeError):
    """The agent did not produce a valid plan. Nothing was written."""


def _check_monday(week_start: date) -> None:
    if week_start.weekday() != 0:
        raise ValueError(f"week_start must be a Monday, got {week_start}")


def _read_decided(week_start: date) -> list[dict]:
    query = text(
        "SELECT meter_id, rank, status FROM inspection_plan "
        "WHERE week_start = :week_start AND status <> 'pending'"
    )
    with get_engine().connect() as conn:
        return [dict(row) for row in conn.execute(query, {"week_start": week_start}).mappings()]


def _write_plan(week_start: date, picks: list[dict]) -> list[dict]:
    """Replace the week's pending rows. Approved and rejected rows are never touched.

    Decided meters are not picked again, approved rows use up budget, and new
    rows take the ranks the decided rows left free.
    """
    budget = get_weekly_budget()
    with get_engine().begin() as conn:
        # Two runs for one week must not interleave their deletes and inserts.
        conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": week_start.toordinal()})
        conn.execute(
            text("DELETE FROM inspection_plan WHERE week_start = :week_start AND status = 'pending'"),
            {"week_start": week_start},
        )
        decided = (
            conn.execute(
                text("SELECT meter_id, rank, status FROM inspection_plan WHERE week_start = :week_start"),
                {"week_start": week_start},
            )
            .mappings()
            .all()
        )
        decided_meters = {row["meter_id"] for row in decided}
        used_ranks = {row["rank"] for row in decided}
        room = max(budget - sum(row["status"] == "approved" for row in decided), 0)
        fresh = [pick for pick in picks if pick["meter_id"] not in decided_meters][:room]
        free_ranks = (rank for rank in count(1) if rank not in used_ranks)

        written = []
        for pick in fresh:
            row = conn.execute(
                text(
                    "INSERT INTO inspection_plan (week_start, meter_id, rank, reason) "
                    "VALUES (:week_start, :meter_id, :rank, :reason) "
                    "RETURNING plan_id, week_start, meter_id, rank, reason, status"
                ),
                {"week_start": week_start, "rank": next(free_ranks), **pick},
            )
            written.append(dict(row.mappings().one()))
    return written


def _format(value: float | None) -> str:
    return "not available" if value is None else f"{value:.2f}"


def _baseline_reason(meter: dict) -> str:
    features = meter["features"] or {}
    return (
        f"Latest risk score is {meter['risk_score']:.2f}. "
        f"Against its own past, usage averaged {_format(features.get('kwh_7d_mean'))} kWh a day over 7 days "
        f"and {_format(features.get('kwh_30d_mean'))} kWh a day over 30 days. "
        f"Against city peers, its 7-day usage is {_format(features.get('peer_ratio_7d'))} times the city median."
    )


def plan_baseline(week_start: date) -> list[dict]:
    """No LLM: the top-scored current meters, up to the budget."""
    _check_monday(week_start)
    decided = _read_decided(week_start)
    meters = get_top_risky_meters(get_weekly_budget() + len(decided))
    return _write_plan(
        week_start,
        [{"meter_id": meter["meter_id"], "reason": _baseline_reason(meter)} for meter in meters],
    )


def _make_client() -> tuple[OpenAI, str]:
    settings = load_settings()
    if settings.llm_provider != "openai":
        raise PlannerNotConfigured(f"LLM_PROVIDER must be openai, got {settings.llm_provider!r}")
    if not settings.llm_api_key or not settings.llm_model:
        raise PlannerNotConfigured("LLM_API_KEY and LLM_MODEL must be set in .env")
    return OpenAI(api_key=settings.llm_api_key, timeout=120), settings.llm_model


def _rounded(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


def _rise_vs_wobble(scores: list[float]) -> float | None:
    """Last week's mean score minus the first week's, in units of daily wobble."""
    if len(scores) < 14:
        return None
    wobble = pstdev(later - earlier for earlier, later in zip(scores, scores[1:]))
    return round((fmean(scores[-7:]) - fmean(scores[:7])) / max(wobble, MIN_SPREAD), 1)


def summarise_history(days: list[dict]) -> dict:
    """The changes a reason may cite, worked out here so the model never does
    sums or copies figures out of a long list. In a test run it misquoted both."""
    first, last = days[0], days[-1]
    first_features, last_features = first["features"] or {}, last["features"] or {}
    kwh_start, kwh_now = first_features.get("kwh_7d_mean"), last_features.get("kwh_7d_mean")
    cuts = [(day["features"] or {}).get("power_cut_minutes") for day in days[-7:]]
    cuts = [minutes for minutes in cuts if minutes is not None]
    return {
        "days_covered": len(days),
        "risk_score_start": _rounded(first["risk_score"]),
        "risk_score_now": _rounded(last["risk_score"]),
        "risk_score_change": _rounded(last["risk_score"] - first["risk_score"]),
        "risk_score_rise_vs_wobble": _rise_vs_wobble([day["risk_score"] for day in days]),
        "kwh_7d_mean_start": _rounded(kwh_start),
        "kwh_7d_mean_now": _rounded(kwh_now),
        "kwh_7d_change_pct": round(100 * (kwh_now - kwh_start) / kwh_start) if kwh_start and kwh_now is not None else None,
        "kwh_30d_mean_now": _rounded(last_features.get("kwh_30d_mean")),
        "peer_ratio_7d_start": _rounded(first_features.get("peer_ratio_7d")),
        "peer_ratio_7d_now": _rounded(last_features.get("peer_ratio_7d")),
        "power_cut_minutes_7d_mean": round(sum(cuts) / len(cuts)) if cuts else None,
    }


def _has_case(summary: dict, peers: dict) -> bool:
    rise = summary.get("risk_score_rise_vs_wobble") or 0
    peer_z = peers.get("risk_score_peer_z") or 0
    return rise >= MIN_RISE_VS_WOBBLE or peer_z >= MIN_PEER_Z


def _numbers_in(result: dict) -> list[float]:
    return [
        abs(value)
        for key, value in result.items()
        if key not in INTERNAL_CHECKS and isinstance(value, (int, float)) and not isinstance(value, bool)
    ]


def _find_unknown_numbers(reason: str, known: list[float]) -> list[str]:
    """Numbers in a reason that match no known value, allowing for rounding."""
    unknown = []
    for found in re.findall(r"(?<![\w.])\d+(?:\.\d+)?", reason):
        decimals = len(found.partition(".")[2])
        if decimals == 0 and int(found) in PERIODS_IN_DAYS:
            continue
        tolerance = 0.5 * 10**-decimals + 1e-9
        if not any(abs(float(found) - value) <= tolerance for value in known):
            unknown.append(found)
    return unknown


def _count_sentences(reason: str) -> int:
    return len(re.findall(r"[.!?](?:\s|$)", reason))


def _build_reason(pick: dict) -> str:
    parts = (pick["own_past"], pick["peers"], pick.get("other_evidence"))
    return " ".join(part.strip() for part in parts if part and part.strip())


def _find_problems(
    picks: list[dict], room: int, decided_meters: set[str], looked_at: dict[str, dict[str, dict]]
) -> list[str]:
    problems = []
    if len(picks) > room:
        problems.append(f"{len(picks)} meters submitted but only {room} places are left")
    meter_ids = [pick.get("meter_id") for pick in picks]
    if len(set(meter_ids)) != len(meter_ids):
        problems.append("a meter appears more than once")
    for pick in picks:
        meter_id = pick.get("meter_id")
        if meter_id in decided_meters:
            problems.append(f"{meter_id} already has a decision this week")
        for tool, seen in looked_at.items():
            if meter_id not in seen:
                problems.append(f"{meter_id}: call {tool} before picking it")
        for part in ("own_past", "peers"):
            if not re.search(r"\d", pick.get(part) or ""):
                problems.append(f"{meter_id}: {part} must cite a number from the tools")
        if pick.get("own_past") and pick.get("peers"):
            reason = _build_reason(pick)
            if _count_sentences(reason) > MAX_SENTENCES:
                problems.append(f"{meter_id}: reason must be 2 or 3 sentences")
            known = [value for seen in looked_at.values() for value in _numbers_in(seen.get(meter_id, {}))]
            unknown = _find_unknown_numbers(reason, known)
            if unknown:
                problems.append(f"{meter_id}: {unknown} not in its summary or peer comparison; cite those only, as given")
        summary = looked_at["get_meter_history"].get(meter_id)
        peers = looked_at["compare_with_peers"].get(meter_id)
        if summary is not None and peers is not None and not _has_case(summary, peers):
            problems.append(f"{meter_id}: no case, neither a sustained rise nor a score that stands apart. Remove it.")
    return problems


def _run_tool(name: str, raw_args: str, looked_at: dict[str, dict[str, dict]]) -> object:
    try:
        args = json.loads(raw_args or "{}")
        result = TOOL_FUNCTIONS[name](**args)
    except (ValueError, TypeError, KeyError) as error:
        return {"error": str(error)}
    if name == "compare_with_peers":
        looked_at[name][args["meter_id"]] = result
    elif name == "get_meter_history" and result:
        summary = summarise_history(result)
        looked_at[name][args["meter_id"]] = summary
        # Results arrive in parallel batches, so each must say which meter it is.
        return {
            "meter_id": args["meter_id"],
            "summary": summary,
            "daily_risk_scores": [round(day["risk_score"], 2) for day in result],
        }
    return result


def plan_inspections(week_start: date) -> list[dict]:
    """Run the agent and write its plan. Writes nothing unless the plan is valid."""
    _check_monday(week_start)
    client, model = _make_client()

    decided = _read_decided(week_start)
    decided_meters = {row["meter_id"] for row in decided}
    room = max(get_weekly_budget() - sum(row["status"] == "approved" for row in decided), 0)
    looked_at: dict[str, dict[str, dict]] = {"compare_with_peers": {}, "get_meter_history": {}}
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Plan the week starting {week_start}. You may pick up to {room} meters. "
                f"These already have a decision, so leave them out: {sorted(decided_meters) or 'none'}."
            ),
        },
    ]

    for _ in range(MAX_TURNS):
        try:
            reply = (
                client.chat.completions.create(model=model, messages=messages, tools=TOOL_SPECS, tool_choice="required")
                .choices[0]
                .message
            )
        except OpenAIError as error:
            raise PlanningFailed(f"LLM call failed: {error}") from error

        calls = reply.tool_calls or []
        if not calls:
            raise PlanningFailed("The model replied without calling a tool")
        messages.append(
            {
                "role": "assistant",
                "content": reply.content,
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {"name": call.function.name, "arguments": call.function.arguments},
                    }
                    for call in calls
                ],
            }
        )

        for call in calls:
            if call.function.name == "submit_plan":
                try:
                    picks = json.loads(call.function.arguments or "{}").get("picks", [])
                except ValueError as error:
                    result: object = {"error": f"Bad JSON: {error}"}
                else:
                    problems = _find_problems(picks, room, decided_meters, looked_at)
                    if not problems:
                        return _write_plan(
                            week_start,
                            [{"meter_id": pick["meter_id"], "reason": _build_reason(pick)} for pick in picks],
                        )
                    result = {
                        "error": "Plan rejected. Fix these and submit again. Keep every meter you still think "
                        "should be inspected: correct its reason, do not remove it to pass this check.",
                        "problems": problems,
                    }
            else:
                result = _run_tool(call.function.name, call.function.arguments, looked_at)
            messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, separators=(",", ":"))})

    raise PlanningFailed(f"No valid plan after {MAX_TURNS} turns")
