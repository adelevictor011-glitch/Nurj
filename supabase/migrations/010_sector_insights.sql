-- Nurj — sector win-rate insights (roadmap feature 10, Batch 5)
-- Run after 009_batches_2_to_4.sql.
--
-- Built from the outcomes people report after running a prompt ("did this
-- work?"). A sector-and-goal result is only shown once at least 30 reports
-- exist for it, so small numbers never mislead and nobody can be singled
-- out. Nothing needs switching on: each result appears by itself the moment
-- its 30th report arrives.

create index if not exists outcomes_category_created_idx
  on public.outcomes(business_category, created_at desc);

-- One sector's live insights plus progress towards the threshold.
create or replace function public.sector_insights(p_category text, p_min integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select o.worked, h.goal
    from public.outcomes o
    left join public.prompt_history h on h.id = o.history_id
    where o.business_category = p_category
      and o.created_at > now() - interval '180 days'
  ),
  by_goal as (
    select goal, count(*) as reports, round(100.0 * avg(case when worked then 1 else 0 end)) as worked_pct
    from recent
    where goal is not null
    group by goal
  )
  select jsonb_build_object(
    'category', p_category,
    'min_reports', p_min,
    'total_reports', (select count(*) from recent),
    'sector_worked_pct', case when (select count(*) from recent) >= p_min
      then (select round(100.0 * avg(case when worked then 1 else 0 end)) from recent) end,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('goal', goal, 'reports', reports, 'worked_pct', worked_pct) order by worked_pct desc, reports desc)
      from by_goal where reports >= p_min
    ), '[]'::jsonb),
    'closest_goal', (
      select jsonb_build_object('goal', goal, 'reports', reports)
      from by_goal where reports < p_min order by reports desc limit 1
    )
  );
$$;

-- Admin view: how close each sector is to its first live insight.
create or replace function public.admin_insight_progress(p_min integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select o.business_category as category, h.goal
    from public.outcomes o
    left join public.prompt_history h on h.id = o.history_id
    where o.created_at > now() - interval '180 days'
  ),
  goals as (
    select category, goal, count(*) as reports from recent where goal is not null group by category, goal
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category', coalesce(c.category, 'not set'),
    'reports', c.reports,
    'live_goals', (select count(*) from goals g where g.category is not distinct from c.category and g.reports >= p_min),
    'best_goal_reports', (select max(reports) from goals g where g.category is not distinct from c.category)
  ) order by c.reports desc), '[]'::jsonb)
  from (select category, count(*) as reports from recent group by category) c;
$$;

revoke all on function public.sector_insights(text, integer) from public, anon, authenticated;
revoke all on function public.admin_insight_progress(integer) from public, anon, authenticated;
grant execute on function public.sector_insights(text, integer) to service_role;
grant execute on function public.admin_insight_progress(integer) to service_role;
