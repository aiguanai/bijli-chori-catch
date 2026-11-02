# BijliChori: Real-Time Electricity Theft Detection

4th-year BTech AI/ML major project (RVCE, Dept. of AI & ML, mentor: Vijayalakshmi M N).
Official theme: "Real-Time Fuel Theft Detection"; the guide approved treating electricity as the fuel.

Team: Diptanshu Kumar, Garv Agarwalla, Ishita Goyal.

## What the system does

1. Smart-meter readings are replayed in time order into Redpanda.
2. Apache Flink computes rolling features and a peer baseline per meter, and writes a daily theft-risk score (0 to 1) to PostgreSQL.
3. An agentic AI planner reads the scores each week, investigates high-risk meters with tools, and proposes a budgeted inspection list with a reason per meter.
4. A human approves or rejects the list in a React dashboard (via FastAPI).
5. Inspection outcomes are written back and used to retrain the model (stretch goal).

The LLM never sees the raw stream. Flink scores every reading; the agent only plans a few dozen inspections a week.

## Current phase (Phase 2)

Phase 1 (review presentation, EDA on 4 datasets, literature survey) is done.
Feedback from the Phase 1 review, which drives Phase 2:
- **Train on the Indian CEEW dataset.**
- **Augment it using patterns learned from the Chinese SGCC dataset** (SGCC has real thieves, CEEW has none).
- Mix theft styles, including on-off theft (theft on some days only).
- Test the teacher's "voltage rise as a theft indicator" idea as one style (see caveats below).

Timeline: finish in about 2 to 3 days. All three parts are built in parallel.

## Ownership

| Part | Owner | Covers |
|---|---|---|
| A. Data, augmentation, detection model | Teammate | CEEW cleaning, power-cut removal, SGCC pattern measurement, theft injection, model training, evaluation per theft style |
| B. Stream processing and backend | Teammate | Replay, Redpanda, Flink features and peer baseline, live scoring, PostgreSQL tables, feedback loop |
| C. Agentic AI and frontend | Ishita | Agent planner and tools, FastAPI endpoints, React dashboard |

Until B's stream is ready, C builds against a fake `risk_scores` table, and A works offline.

## Tech stack (agreed, do not change without telling the team)

| Area | Tool |
|---|---|
| Language | Python 3.11 |
| Data and model | pandas, numpy, scikit-learn (HistGradientBoosting), joblib |
| Message stream | Redpanda (Kafka-compatible), Docker |
| Stream processing | Apache Flink via PyFlink |
| Database | PostgreSQL 16, Docker; SQLAlchemy + psycopg |
| Agent | LangGraph (or plain tool-calling) with an LLM API |
| API | FastAPI |
| Frontend | React (Next.js) + Tailwind + shadcn/ui |
| Settings | one `.env` read by `shared/config.py` |
| Run everything | `docker-compose.yml` at the repo root |
| Code sharing | one GitHub repo, one branch per person, merge to `main` |

Rule: the React frontend only talks to FastAPI, never to the database directly.

## Folder structure

```
BijliChori/
  shared/          config.py, db.py, schema.sql, test_meters.json
  data/            raw CEEW and SGCC files (gitignored)
  augmentation/    inject.py, features.py, train.py, evaluate.py
  streaming/       replay.py, flink_job.py
  agent/           tools.py, planner.py
  api/             main.py (FastAPI endpoints)
  frontend/        Next.js React app
  models/          saved model files
  docker-compose.yml
  .env
```

Everyone imports database and settings code from `shared/`. Nobody writes their own connection code.

Note: the raw data files currently sit at the root of this folder, together with Phase 1 material (EDA notebook, `eda_outputs/`, `eda_cache/`, decks). Only CEEW (Mathura, Bareilly) and SGCC (`data.csv`, plus its original download `ElectricityTheftDetection-master.zip`) are kept; the STEG and Low Carbon London datasets were deleted, so the EDA notebook's STEG and London sections no longer run. Move raw data into `data/` and keep it out of git. `_prep_cache.py` and `_w` are leftover junk and can be deleted.

## Database tables (`shared/schema.sql`)

```sql
CREATE TABLE risk_scores (          -- written by streaming, read by agent
  meter_id      text        NOT NULL,   -- CEEW ID, e.g. MH02
  scored_at     timestamptz NOT NULL,
  risk_score    double precision NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
  model_version text,
  features      jsonb                   -- inputs used, for explanations
);

CREATE TABLE inspection_plan (      -- written by agent, updated by dashboard
  plan_id    serial PRIMARY KEY,
  week_start date NOT NULL,          -- Monday of the planned week
  meter_id   text NOT NULL,
  rank       int  NOT NULL,          -- 1 = top priority
  reason     text,                   -- agent's explanation
  status     text NOT NULL DEFAULT 'pending'  -- pending | approved | rejected
);

CREATE TABLE inspection_outcomes (  -- written by dashboard, read for retraining
  meter_id     text NOT NULL,
  inspected_on date NOT NULL,
  theft_found  boolean NOT NULL,
  theft_style  text,                 -- injected style, if known
  notes        text
);

CREATE TABLE settings (             -- written by dashboard, read by agent
  key   text PRIMARY KEY,            -- e.g. weekly_budget
  value text NOT NULL                -- e.g. 20
);
```

## Shared formats

- **Meter IDs:** exactly as in the CEEW file (e.g. `MH02`, Bareilly IDs as given), stored as text.
- **Time:** Indian Standard Time, ISO 8601 (`2021-03-15T18:30:00+05:30`).
- **Risk score:** float 0 to 1, higher = more suspicious, updated once a day per meter.
- **Weekly budget:** set in the dashboard, default 20, stored in `settings` (`weekly_budget`).
- **Test meters:** 17 of the 84 CEEW meters (about 20%), split in proportion to city size (8 Mathura, 9 Bareilly), picked once with seed 42, saved in `shared/test_meters.json`. Nobody trains, tunes or augments on them.
- **`risk_scores.features`:** a JSON object with exactly these keys, one row per meter per day. Use `null` for a value that cannot be computed; do not drop the key. The agent tools read these names.

| Key | Meaning |
|---|---|
| `daily_kwh` | kWh used that day, with power-cut readings removed |
| `kwh_7d_mean` | mean daily kWh over the last 7 days, including that day |
| `kwh_30d_mean` | mean daily kWh over the last 30 days, including that day |
| `peer_ratio` | `daily_kwh` divided by the median `daily_kwh` of the meter's city that day (city comes from the ID prefix, MH or BR) |
| `peer_ratio_7d` | mean `peer_ratio` over the last 7 days, including that day |
| `night_share` | share of the day's kWh used between 22:00 and 06:00 IST, 0 to 1 |
| `zero_share` | share of readings with supply on where `t_kWh` is 0, 0 to 1 |
| `power_cut_minutes` | minutes with zero voltage that day |
| `avg_voltage` | mean voltage with supply on, in volts |

## Standard entry points (internal helpers can be named freely)

- `shared/`: `get_engine()`, `load_settings()`, `get_test_meters()`
- `augmentation/`: `load_ceew(path)`, `remove_power_cuts(df)`, `inject_theft(df, style, params)` (returns data plus a theft log), `build_features(df)`, `train_model(features, labels)`, `score_meters(features)`, `evaluate(scores, log)`
- `streaming/`: `replay_readings(speed)`, `run_flink_job()`
- `agent/` (tools): `get_top_risky_meters(n)`, `compare_with_peers(meter_id)`, `get_meter_history(meter_id, days)`, `get_weekly_budget()`; runner: `plan_inspections(week_start)` writes `inspection_plan`
- `api/`: `approve_plan(plan_id)`, `reject_plan(plan_id)`, `record_outcome(meter_id, theft_found, notes)`, `set_weekly_budget(n)`

## Data facts (from the Phase 1 EDA; trust these, they were computed)

### CEEW (India): the training dataset
- Files: `CEEW - Smart meter data {Mathura 2019, Mathura 2020, Bareilly 2020, Bareilly 2021}.csv`, `SM Cleaned Data BR2019.csv`, `SM Cleaned Data MH2021.csv`, plus daily `SM Cleaned Data {BR,MH} Aggregated.csv`. Read `CEEW -  ReadMe.txt` (two spaces in the name).
- Columns: `x_Timestamp`, `t_kWh` (energy in that 3-minute interval), `z_Avg Voltage (Volt)`, `z_Avg Current (Amp)`, `y_Freq (Hz)`, `meter`.
- 84 meters: 38 Mathura (2019-05-01 to 2021-02-20), 46 Bareilly (2019-05-09 to 2021-10-31). About 21.4 M readings, one every 3 minutes.
- No theft labels, no temperature, no household details.
- Daily sums of 3-minute kWh match the Aggregated files exactly (corr 1.000).
- Power cuts: 8.2% of readings have zero voltage; 88% of meter-days include a cut (median 87 min). Cuts read as zero usage, so remove them before features.
- Voltage with supply on: mean about 243 V, 29% above 253 V, 4% below 207 V.
- Seasonality: June is 4.5x the winter low in Mathura, 3.1x in Bareilly (cooling load).
- Peers: median correlation of a meter with its city median is 0.75; dividing by the peer median cuts day-to-day CV from 0.57 to 0.41 (-28%). Peer-relative features are how weather is handled.
- Coverage: the typical meter has data on 82% of days in its span.
- `t_kWh` resolution is 0.001; single zero readings while powered are common at light load.
- Frequency is grid-wide, useless per home.
- The 2020 COVID lockdown is inside the span: a good false-alarm test (a city-wide drop must not flag everyone).

### SGCC (China): pattern source with real labels
- File: `data.csv`. Columns: `CONS_NO`, `FLAG` (1 = thief), then 1,034 daily kWh columns (2014-01-01 to 2016-10-31) stored **out of date order**; sort them.
- 42,372 consumers, 3,615 thieves (8.5%). One flag per consumer, no theft dates, no location or household data.
- 25.6% of readings missing (thieves 31.5% vs normal 25.1%); keep missingness as a feature.
- Corrupt day 2014-10-03 (58x a normal day); max reading 800,003 kWh (cap); 2,109 all-zero and 5 all-NaN accounts dropped.
- Thieves do **not** show the expected drop: largest-monthly-drop AUC 0.51. Thieves use more and grow more (+53% vs +12%). Separating features: average use (0.64), consistency (0.63), growth (0.62). 14 features combined: AUC 0.79; 89 of top 100 are thieves.

STEG (Tunisia) and Low Carbon London were Phase 1 only; their files have been deleted and they are not used in Phase 2.

## Augmentation rules (part A, but everyone should know them)

Recipe: measure thief behaviour on SGCC daily data, sum CEEW to daily, choose thief homes and theft days using the SGCC statistics, spread each day's cut back over the 3-minute readings, check that injected thieves resemble real SGCC thieves, then train and test.

Theft styles (from Jokar et al. 2016 and follow-ups): fixed scaling, random scaling, peak-hour cut (close to Indian *kunda* hooking), hours zeroed, threshold cut, flat reading, on-off theft (severity 0 to 1 = chance theft applies to a reading), and the teacher's voltage rise.

Hard rules:
- **Split meters first.** Test meters are never used to tune or generate anything.
- **Log every injected theft** (meter, style, params, start time) so detection delay can be measured.
- **Lower kWh and current together** when injecting. If only kWh is cut, the kWh / (V x I) ratio gives the model a shortcut: in our test it caught register-style injection in 24 of 29 meters (median 3 days) but real bypass/hooking in only 2 of 29.
- **Report per theft style**, and run an ablation with voltage and current features switched off.
- **Never pool** real-label results (SGCC) with synthetic results (CEEW).
- Voltage rise is tested as its own style and reported separately; "high voltage = theft" alone would flag most honest homes.

Key paper: Altamimi et al., "How effective are synthetic attack models to detect real-world energy theft?", Energy vol. 335 (2025). Models do well on synthetic attacks and worse on real theft, and no single synthetic style matches SGCC thieves. This is the justification for tuning injection to SGCC.

## Reference docs (claude.ai)

- Team contract (decisions, names, stack): https://claude.ai/artifact/BthRHwt9QY1u4jUMfaqu84
- Phase 2 handoff (theft patterns, augmentation plan, research tasks): https://claude.ai/artifact/CUNb5sUEGzw2kL2QVt6scS. Its team table still says Streamlit; the agreed frontend is React + FastAPI.
- `Electricity theft detection project specification.md` in this folder: earlier full project spec.

## Working conventions

- Keep the shared table names, column names and entry-point names above exactly as written; other code can be named freely.
- Never commit raw data, `.env` or model files.
- Every claimed number should come from code that was run on the data; don't state results that were not computed.
- When writing for the team or the teacher, use plain language and no em dashes.
