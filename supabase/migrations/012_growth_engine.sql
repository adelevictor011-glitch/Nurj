-- Nurj — growth engine: attribution, auto-renewal, conversion dashboard.
-- Run after 011_security_hardening.sql. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Attribution: where each user came from
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists referral_source text;   -- from ?ref= links
alter table public.profiles add column if not exists heard_from text;        -- self-reported after the scan
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_attribution_lengths') then
    alter table public.profiles add constraint profiles_attribution_lengths check (
      char_length(coalesce(referral_source, '')) <= 40 and char_length(coalesce(heard_from, '')) <= 80
    ) not valid;
  end if;
end $$;
grant update (referral_source, heard_from) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Auto-renewal: on by default, one switch to turn it off
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists auto_renew boolean not null default true;
alter table public.profiles add column if not exists renew_failed_at timestamptz;
grant update (auto_renew) on table public.profiles to authenticated;

alter table public.payments add column if not exists renewal boolean not null default false;

-- The reusable card Paystack returns after a payment. Server-only: it can be
-- charged, so no browser role can read or write it.
create table if not exists public.payment_authorizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  authorization_code text not null,
  email text not null,
  last4 text,
  card_type text,
  bank text,
  exp_month text,
  exp_year text,
  plan text not null check (plan in ('builder', 'operator')),
  updated_at timestamptz not null default now()
);
alter table public.payment_authorizations enable row level security;
revoke all on table public.payment_authorizations from anon, authenticated;
grant all on table public.payment_authorizations to service_role;

-- Fix: the "ends in 3 days" email went out once per lifetime because the flag
-- was never cleared. Clear it whenever paid access is extended.
create or replace function public.reset_expiry_reminder()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan_expires_at is distinct from old.plan_expires_at
     and new.plan_expires_at > coalesce(old.plan_expires_at, '-infinity'::timestamptz) then
    new.expiry_reminded_at := null;
    new.renew_failed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_reset_expiry_reminder on public.profiles;
create trigger profiles_reset_expiry_reminder before update of plan_expires_at on public.profiles
  for each row execute function public.reset_expiry_reminder();
revoke all on function public.reset_expiry_reminder() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Conversion and retention dashboard (admin only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_growth()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with comp as (
    select u.id from auth.users u join public.comp_accounts c on c.email = lower(u.email)
  ),
  users as (
    select p.id, p.created_at, coalesce(nullif(p.referral_source, ''), 'direct') as source, p.heard_from
    from public.profiles p where p.id not in (select id from comp)
  ),
  first_prompt as (
    select user_id, min(created_at) as first_at from public.prompt_history group by user_id
  ),
  paid as (
    select distinct user_id from public.payments where status = 'success'
  ),
  mature as (select * from users where created_at < now() - interval '30 days')
  select jsonb_build_object(
    'funnel', jsonb_build_object(
      'signups_30d', (select count(*) from users where created_at > now() - interval '30 days'),
      'first_prompt_10min_pct', (
        select round(100.0 * count(*) filter (where f.first_at <= u.created_at + interval '10 minutes') / nullif(count(*), 0))
        from users u left join first_prompt f on f.user_id = u.id where u.created_at > now() - interval '30 days'),
      'paid_pct_of_mature', (
        select round(100.0 * count(*) filter (where m.id in (select user_id from paid)) / nullif(count(*), 0), 1) from mature m),
      'free_users_hitting_limit_7d', (
        select count(distinct d.user_id) from public.daily_usage d
        join public.profiles p on p.id = d.user_id
        where d.usage_date > current_date - 7 and d.prompt_count >= 5 and public.active_plan(p.id) = 'free'),
      'enhancer_tried_pct_free', (
        select round(100.0 * count(*) filter (where exists (
          select 1 from public.prompt_history h where h.user_id = u.id and h.kind = 'enhanced')) / nullif(count(*), 0))
        from users u where public.active_plan(u.id) = 'free'),
      'renewals_30d', (select count(*) from public.payments where renewal and status = 'success' and paid_at > now() - interval '30 days'),
      'renewals_failed_30d', (select count(*) from public.profiles where renew_failed_at > now() - interval '30 days'),
      'auto_renew_off', (select count(*) from public.profiles where not auto_renew and plan <> 'free' and plan_expires_at > now())
    ),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'signups', signups, 'paid', paid_n) order by signups desc), '[]'::jsonb)
                  from (select u.source, count(*) as signups, count(*) filter (where u.id in (select user_id from paid)) as paid_n
                        from users u group by u.source) s),
    'heard_from', (select coalesce(jsonb_agg(jsonb_build_object('answer', answer, 'count', n) order by n desc), '[]'::jsonb)
                   from (select coalesce(nullif(heard_from, ''), 'not answered') as answer, count(*) as n from users group by 1) h)
  );
$$;
revoke all on function public.admin_growth() from public, anon, authenticated;
grant execute on function public.admin_growth() to service_role;

notify pgrst, 'reload schema';
