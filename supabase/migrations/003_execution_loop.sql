-- Nurj v2.2 — closing the execution loop
-- Run after 002_guest_trial_and_cost_controls.sql.
--
-- Until now the product ended at the clipboard. Every unit of value was
-- created inside someone else's AI, so Nurj never learned whether a prompt
-- worked. These two tables are where the outcome dataset starts.

create table if not exists public.prompt_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  history_id uuid references public.prompt_history(id) on delete set null,
  prompt text not null,
  output text not null,
  created_at timestamptz not null default now()
);

create index if not exists prompt_runs_user_created_idx
  on public.prompt_runs(user_id, created_at desc);

create table if not exists public.outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.prompt_runs(id) on delete cascade,
  history_id uuid references public.prompt_history(id) on delete set null,
  worked boolean not null,
  note text,
  business_category text,
  stage text,
  created_at timestamptz not null default now(),
  unique (user_id, run_id)
);

create index if not exists outcomes_category_idx
  on public.outcomes(business_category, stage, worked);

alter table public.prompt_runs enable row level security;
alter table public.outcomes enable row level security;

revoke all on table public.prompt_runs from anon, authenticated;
revoke all on table public.outcomes from anon, authenticated;

grant select on table public.prompt_runs to authenticated;
grant select on table public.outcomes to authenticated;

drop policy if exists prompt_runs_select_own on public.prompt_runs;
create policy prompt_runs_select_own on public.prompt_runs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists outcomes_select_own on public.outcomes;
create policy outcomes_select_own on public.outcomes
  for select to authenticated using (auth.uid() = user_id);

-- Reminder bookkeeping so an expiry email is never sent twice.
alter table public.profiles
  add column if not exists expiry_reminded_at timestamptz;
