-- Nurj — WRAP and admin console (roadmap feature 7)
-- Run after 007_trust_layer.sql.
--
-- Admins are the rows in comp_accounts with note = 'admin' (see 004).
-- Every function here is callable by the server (service role) only.

-- WRAP: of the people active in the previous Lagos week (Monday start),
-- how many were active again this week. Active = generated, enhanced or ran
-- a prompt. The newest week is still in progress.
create or replace function public.admin_wrap(p_weeks integer default 8)
returns table (week_start date, active_users integer, previous_active integer, retained_users integer, wrap numeric)
language sql
stable
security definer
set search_path = public
as $$
  with activity as (
    select distinct user_id, date_trunc('week', created_at at time zone 'Africa/Lagos')::date as week
    from public.prompt_history
    union
    select distinct user_id, date_trunc('week', created_at at time zone 'Africa/Lagos')::date
    from public.prompt_runs
  ),
  weeks as (
    select (date_trunc('week', now() at time zone 'Africa/Lagos')::date - (n * 7)) as week
    from generate_series(0, greatest(p_weeks, 1) - 1) as n
  )
  select
    w.week,
    (select count(*) from activity a where a.week = w.week)::integer,
    (select count(*) from activity a where a.week = w.week - 7)::integer,
    (select count(*) from activity a
      where a.week = w.week
        and exists (select 1 from activity b where b.user_id = a.user_id and b.week = w.week - 7))::integer,
    case
      when (select count(*) from activity a where a.week = w.week - 7) = 0 then null
      else round(100.0 *
        (select count(*) from activity a
          where a.week = w.week
            and exists (select 1 from activity b where b.user_id = a.user_id and b.week = w.week - 7))
        / (select count(*) from activity a where a.week = w.week - 7), 1)
    end
  from weeks w
  order by w.week;
$$;

-- Headline numbers, distributions and the per-user AI usage view.
-- Comp (free Operator) accounts are excluded from paid counts.
create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with comp as (
    select u.id from auth.users u join public.comp_accounts c on c.email = lower(u.email)
  )
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'builder_active', (select count(*) from public.profiles where plan = 'builder' and plan_expires_at > now() and id not in (select id from comp)),
    'operator_active', (select count(*) from public.profiles where plan = 'operator' and plan_expires_at > now() and id not in (select id from comp)),
    'ever_paid', (select count(distinct user_id) from public.payments where status = 'success'),
    'revenue_30d_kobo', (select coalesce(sum(amount), 0) from public.payments where status = 'success' and paid_at > now() - interval '30 days'),
    'refunds_30d_kobo', (select coalesce(sum(amount), 0) from public.refund_requests where status = 'refunded' and created_at > now() - interval '30 days'),
    'tokens_today', public.ai_tokens_today(),
    'tokens_30d', (select coalesce(sum(total_tokens), 0) from public.model_usage where created_at > now() - interval '30 days'),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc), '[]'::jsonb)
                   from (select coalesce(business_category, 'not set') as name, count(*) as n from public.profiles group by 1) c),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc), '[]'::jsonb)
               from (select coalesce(stage, 'not set') as name, count(*) as n from public.profiles group by 1) s),
    'goals_30d', (select coalesce(jsonb_agg(jsonb_build_object('goal', goal, 'count', n) order by n desc), '[]'::jsonb)
                  from (select goal, count(*) as n from public.prompt_history
                        where kind = 'generated' and goal is not null and created_at > now() - interval '30 days'
                        group by goal order by count(*) desc limit 40) g),
    'top_ai_users_30d', (select coalesce(jsonb_agg(jsonb_build_object('email', email, 'plan', plan, 'calls', calls, 'tokens', tokens) order by tokens desc), '[]'::jsonb)
                         from (select u.email, v.plan, v.calls, v.tokens
                               from public.user_ai_usage_30d v join auth.users u on u.id = v.user_id
                               where v.calls > 0 order by v.tokens desc limit 10) t)
  );
$$;

-- Manual plan grants (partner giveaways, support fixes), with an audit log.
create table if not exists public.admin_grants (
  id uuid primary key default gen_random_uuid(),
  target_user uuid references auth.users(id) on delete set null,
  target_email text not null,
  plan text not null check (plan in ('free', 'builder', 'operator')),
  days integer not null check (days between 0 and 366),
  granted_by text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.admin_grants enable row level security;
revoke all on table public.admin_grants from anon, authenticated;

create or replace function public.admin_grant_plan(p_email text, p_plan text, p_days integer, p_granted_by text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_expires timestamptz;
begin
  if p_plan not in ('free', 'builder', 'operator') then raise exception 'Unknown plan.'; end if;
  if p_days is null or p_days < 0 or p_days > 366 then raise exception 'Days must be between 0 and 366.'; end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No Nurj account uses that email yet.'; end if;

  if p_plan = 'free' then
    update public.profiles set plan = 'free', plan_expires_at = null, updated_at = now() where id = v_user;
    v_expires := null;
  else
    update public.profiles
    set plan = p_plan,
        plan_expires_at = greatest(now(), case when plan = p_plan then coalesce(plan_expires_at, now()) else now() end)
                          + make_interval(days => p_days),
        updated_at = now()
    where id = v_user
    returning plan_expires_at into v_expires;
  end if;

  insert into public.admin_grants (target_user, target_email, plan, days, granted_by, note)
  values (v_user, lower(trim(p_email)), p_plan, p_days, p_granted_by, nullif(trim(coalesce(p_note, '')), ''));

  return jsonb_build_object('email', lower(trim(p_email)), 'plan', p_plan, 'expires_at', v_expires);
end;
$$;

revoke all on function public.admin_wrap(integer) from public, anon, authenticated;
revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_grant_plan(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_wrap(integer) to service_role;
grant execute on function public.admin_overview() to service_role;
grant execute on function public.admin_grant_plan(text, text, integer, text, text) to service_role;
