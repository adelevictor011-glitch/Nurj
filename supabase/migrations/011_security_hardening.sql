-- Nurj — security hardening (audit of 7 October 2026)
-- Run after 010_sector_insights.sql. Safe to run more than once.
--
-- 1. Sector insights only ever show Nurj's own preset goals, never text a
--    user typed, and thresholds count distinct people, not reports.
-- 2. Row and length limits on tables the browser writes to directly.

-- ---------------------------------------------------------------------------
-- 1. Sector insights: preset goals only, distinct users
-- ---------------------------------------------------------------------------

-- The goals a founder can pick in Studio (src/data.ts GOALS), plus the two
-- fixed labels the enhancer uses. Custom "Something specific" text is private
-- and is never shown to anyone else.
create or replace function public.insight_goal_allowed(p_goal text)
returns boolean
language sql
immutable
as $$
  select p_goal = any (array[
    'Write a cold DM',
    'Create an outreach email',
    'Build my service offer',
    'Price my offer',
    'Plan content that sells',
    'Write a client proposal',
    'Write a launch campaign',
    'Enhance an existing prompt',
    'Fix a prompt that did not work'
  ]);
$$;

create or replace function public.sector_insights(p_category text, p_min integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    -- Only history that belongs to the person reporting counts.
    select o.user_id, o.worked,
           case when public.insight_goal_allowed(h.goal) then h.goal end as goal
    from public.outcomes o
    left join public.prompt_history h on h.id = o.history_id and h.user_id = o.user_id
    where o.business_category = p_category
      and o.created_at > now() - interval '180 days'
  ),
  by_goal as (
    select goal,
           count(distinct user_id) as people,
           round(100.0 * avg(case when worked then 1 else 0 end)) as worked_pct
    from recent
    where goal is not null
    group by goal
  ),
  totals as (
    select count(distinct user_id) as people,
           round(100.0 * avg(case when worked then 1 else 0 end)) as worked_pct
    from recent
  )
  select jsonb_build_object(
    'category', p_category,
    'min_reports', p_min,
    'total_reports', (select people from totals),
    'sector_worked_pct', case when (select people from totals) >= p_min then (select worked_pct from totals) end,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('goal', goal, 'reports', people, 'worked_pct', worked_pct) order by worked_pct desc, people desc)
      from by_goal where people >= p_min
    ), '[]'::jsonb),
    'closest_goal', (
      select jsonb_build_object('goal', goal, 'reports', people)
      from by_goal where people < p_min order by people desc limit 1
    )
  );
$$;

revoke all on function public.sector_insights(text, integer) from public, anon, authenticated;
grant execute on function public.sector_insights(text, integer) to service_role;
revoke all on function public.insight_goal_allowed(text) from public, anon, authenticated;
grant execute on function public.insight_goal_allowed(text) to service_role;

-- Admin progress view uses the same rules (same output shape as before).
create or replace function public.admin_insight_progress(p_min integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select o.user_id, o.business_category as category,
           case when public.insight_goal_allowed(h.goal) then h.goal end as goal
    from public.outcomes o
    left join public.prompt_history h on h.id = o.history_id and h.user_id = o.user_id
    where o.created_at > now() - interval '180 days'
  ),
  goals as (
    select category, goal, count(distinct user_id) as reports from recent where goal is not null group by category, goal
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category', coalesce(c.category, 'not set'),
    'reports', c.reports,
    'live_goals', (select count(*) from goals g where g.category is not distinct from c.category and g.reports >= p_min),
    'best_goal_reports', (select max(reports) from goals g where g.category is not distinct from c.category)
  ) order by c.reports desc), '[]'::jsonb)
  from (select category, count(distinct user_id) as reports from recent group by category) c;
$$;

revoke all on function public.admin_insight_progress(integer) from public, anon, authenticated;
grant execute on function public.admin_insight_progress(integer) to service_role;

-- Clear links that point at someone else's history (written before the
-- server started checking ownership).
update public.outcomes o set history_id = null
where history_id is not null
  and not exists (select 1 from public.prompt_history h where h.id = o.history_id and h.user_id = o.user_id);
update public.prompt_runs r set history_id = null
where history_id is not null
  and not exists (select 1 from public.prompt_history h where h.id = r.history_id and h.user_id = r.user_id);

-- ---------------------------------------------------------------------------
-- 2. Limits on browser-written data
-- ---------------------------------------------------------------------------

-- Profile text: same limits the app already uses. NOT VALID skips checking
-- old rows, so this can never fail on existing data; new writes are checked.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_text_lengths') then
    alter table public.profiles add constraint profiles_text_lengths check (
      char_length(coalesce(display_name, '')) <= 80
      and char_length(coalesce(business_description, '')) <= 800
      and char_length(coalesce(target_customer, '')) <= 800
      and char_length(coalesce(business_category, '')) <= 40
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'action_progress_key_length') then
    alter table public.action_progress add constraint action_progress_key_length
      check (char_length(action_key) between 1 and 80) not valid;
  end if;
end $$;

-- Wins: up to 2,000 per person.
create or replace function public.enforce_wins_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.wins where user_id = new.user_id) >= 2000 then
    raise exception 'You have reached the limit of 2,000 logged wins.';
  end if;
  return new;
end;
$$;

drop trigger if exists wins_limit on public.wins;
create trigger wins_limit before insert on public.wins
  for each row execute function public.enforce_wins_limit();

-- Checklist progress: up to 500 rows per person.
create or replace function public.enforce_action_progress_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.action_progress where user_id = new.user_id) >= 500 then
    raise exception 'Too many checklist items saved.';
  end if;
  return new;
end;
$$;

drop trigger if exists action_progress_limit on public.action_progress;
create trigger action_progress_limit before insert on public.action_progress
  for each row execute function public.enforce_action_progress_limit();

revoke all on function public.enforce_wins_limit() from public, anon, authenticated;
revoke all on function public.enforce_action_progress_limit() from public, anon, authenticated;

notify pgrst, 'reload schema';
