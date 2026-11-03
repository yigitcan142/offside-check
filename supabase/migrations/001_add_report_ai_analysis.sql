alter table public.reports
  add column if not exists category text,
  add column if not exists is_actionable boolean,
  add column if not exists summary text,
  add column if not exists entities jsonb,
  add column if not exists confidence_score integer,
  add column if not exists analyzed_at timestamptz;