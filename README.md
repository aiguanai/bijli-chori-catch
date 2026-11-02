# BijliChori

Real-time electricity theft detection for smart meters in Mathura and Bareilly. A model scores every meter each day, an AI agent proposes a weekly inspection list with a reason for each meter, and a person approves or rejects it in a dashboard.

**Current state:** the database, API, agent planner and dashboard run. The stream and the model are still being built, so the dashboard shows fake scores from a seed script and labels them "Demo scores".

## What you need

| Tool | Version |
|---|---|
| Python | 3.11 |
| Node.js | 24 (with npm) |
| Docker Desktop | any recent version, and it must be running |

You also need two CEEW files, which are not in git because raw data is never committed. Get them from the team and put them in `data/`:

- `SM Cleaned Data BR Aggregated.csv`
- `SM Cleaned Data MH Aggregated.csv`

## Setup

Run these once, from the repo root. The commands work in PowerShell unless noted.

**1. Make your settings file.**

```bash
cp .env.example .env
```

Open `.env` and replace `change_me` with any password. To use the AI agent, also fill in `LLM_API_KEY`. Everything else works without it.

**2. Start the database.** This also creates the tables.

```bash
docker compose up -d postgres
```

**3. Set up Python.**

```bash
python -m venv .venv
```

```bash
.venv\Scripts\Activate.ps1
```

On macOS or Linux, activate with `source .venv/bin/activate` instead.

```bash
pip install -r requirements.txt
```

**4. Fill the database with demo scores.**

```bash
python -m shared.seed_fake_data
```

You should see `Seeded 5040 rows for 84 meters`.

**5. Install the dashboard.**

```bash
npm --prefix frontend install
```

## Run it

Use two terminals, both at the repo root.

**Terminal 1, the API** (activate `.venv` first):

```bash
uvicorn api.main:app --reload
```

**Terminal 2, the dashboard:**

```bash
npm --prefix frontend run dev
```

Open http://localhost:3000. Use `localhost`, not `127.0.0.1`, because the API only accepts requests from that address.

The first page load can take a few seconds. The guide opens by itself on your first visit, and the Guide button at the top right brings it back on any page.

When you come back later, start Docker Desktop, run `docker compose up -d postgres`, then start the two terminals again.

## Using the dashboard

1. **Meters:** see which meters look suspicious.
2. **Inspection list:** make a list with **Run planner**. **Top scores** needs no key. **AI agent** needs `LLM_API_KEY` and can take minutes. Then approve or reject each meter.
3. **Record result:** after an inspection, save what was found. It appears under **Results**.

## Run the tests

With Postgres running, the seed done and `.venv` active:

```bash
python -m pytest api agent shared
```

No test calls a real LLM.

## Folders

| Folder | What is in it |
|---|---|
| `shared/` | Settings, database connection, table definitions, test meter list |
| `data/` | Raw CEEW and SGCC files (not in git) |
| `agent/` | Planner and its tools |
| `api/` | FastAPI backend |
| `frontend/` | Next.js dashboard |
| `augmentation/` | Theft injection and model training |
| `streaming/` | Replay and Flink job |
| `models/` | Saved models (not in git) |

Project decisions, shared formats and data facts are in [CLAUDE.md](CLAUDE.md). Dashboard design rules are in [frontend/README.md](frontend/README.md).

## If something goes wrong

| What you see | What to do |
|---|---|
| "No supply from the API" | The API is not running. Start Terminal 1. |
| API errors about the password or connection | Check Docker Desktop is running. If you changed the password in `.env` after the first start, the old one is still stored. Run `docker compose down -v` to reset, which **deletes all database data**, then repeat steps 2 and 4. |
| Port 5432 is already in use | Another Postgres is running. Stop it, or set `POSTGRES_PORT` to another port in `.env`. |
| Dashboard loads but stays empty | Run the seed in step 4. |
| Seed fails with a missing file | Put the two Aggregated CSV files in `data/`. |
| Run planner says the LLM is not configured | Set `LLM_API_KEY` and `LLM_MODEL` in `.env`, restart the API, or use **Top scores**. |
| Styles look broken or old | Stop the dashboard, delete `frontend/.next`, start it again. Do not run `npm run build` while `npm run dev` is running. |
| Warning about the `Big Shoulders` font | Harmless. Ignore it. |

Running the seed again replaces the demo scores and resets the weekly budget to 20.
