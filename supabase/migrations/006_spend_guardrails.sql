-- Nurj — spend guardrails (roadmap feature 19)
-- Run after 005_saved_snippets.sql.
--
-- The AI functions read today's token spend before each call. At 80% of the
-- daily budget (AI_DAILY_TOKEN_BUDGET, default 2,000,000 tokens) they switch to
-- the cheaper model; at 100% free and guest calls pause until midnight WAT.
-- One alert email per level per day goes to ADMIN_ALERT_EMAIL.

-- Today's tokens, counted from Lagos midnight.
create or replace function public.ai_tokens_today()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(total_tokens), 0)::bigint
  from public.model_usage
  where created_at >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos');
$$;

revoke all on function public.ai_tokens_today() from public, anon, authenticated;
grant execute on function public.ai_tokens_today() to service_role;

-- One row per alert level per Lagos day, so an alert is sent once.
create table if not exists public.spend_alerts (
  alert_date date not null,
  level text not null check (level in ('degrade', 'paused')),
  created_at timestamptz not null default now(),
  primary key (alert_date, level)
);

alter table public.spend_alerts enable row level security;
revoke all on table public.spend_alerts from anon, authenticated;

create or replace function public.claim_spend_alert(p_level text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  insert into public.spend_alerts (alert_date, level)
  values ((now() at time zone 'Africa/Lagos')::date, p_level)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

revoke all on function public.claim_spend_alert(text) from public, anon, authenticated;
grant execute on function public.claim_spend_alert(text) to service_role;

-- Per-user AI usage over the last 30 days, for the margin view in the admin
-- console (feature 7). Readable by the server only.
create or replace view public.user_ai_usage_30d
with (security_invoker = true)
as
select
  p.id as user_id,
  p.plan,
  count(m.id) as calls,
  coalesce(sum(m.total_tokens), 0)::bigint as tokens
from public.profiles p
left join public.model_usage m
  on m.user_id = p.id and m.created_at > now() - interval '30 days'
group by p.id, p.plan;

revoke all on table public.user_ai_usage_30d from anon, authenticated;
