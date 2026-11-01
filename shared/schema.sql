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
