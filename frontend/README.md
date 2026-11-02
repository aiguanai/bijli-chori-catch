# BijliChori dashboard

Next.js, Tailwind and shadcn/ui. Talks only to FastAPI, never to the database.

## Run

From the repo root, with Postgres up:

    uvicorn api.main:app --reload

From this folder:

    npm install
    npm run dev

Open http://localhost:3000 (use `localhost`, because the API's CORS rule allows only that origin).
Set `NEXT_PUBLIC_API_URL` if the API is not at http://localhost:8000.

## Screens

- `/` Panel: all meters as dials, replay of 60 days, adjustable alert line, day board.
- `/plan` Inspection list: approve or reject with a 5 second undo, budget knob, planner run.
- `/meters/[id]` Meter file: every feature on one time axis, peers, inspection history.
- `/ledger` Inspection results and hit rate.
- `/system` Interactive diagram of the pipeline.

## Design rules

- Colours are tokens in `app/globals.css`. City colours passed the data viz palette validator in both themes.
- No gradients, soft shadows, rounded corners or emojis. Domain icons are in `components/icons.tsx`; Phosphor covers the rest.
- Status always pairs colour with an icon and a word.
