-- Nurj v2.1 — guest trial, fair-use ceiling and cost telemetry
-- Run after 001_initial.sql.

-- ---------------------------------------------------------------------------
-- 1. Guest trial: one real AI generation per IP per day, no account required.
--    IPs are stored only as a salted SHA-256 hash, never in plain text.
-- ---------------------------------------------------------------------------

create table if not exists public.guest_usage (
  ip_hash text not null,
  usage_date date not null default current_date,
  prompt_count integer not null default 0 check (prompt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (ip_hash, usage_date)
);

revoke all on table public.guest_usage from anon, authenticated;
alter table public.guest_usage enable row level security;

create or replace function public.consume_guest_quota(p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit constant integer := 1;
  v_row public.guest_usage%rowtype;
  v_used integer;
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 then
    raise exception 'Invalid guest identifier';
  end if;

  insert into public.guest_usage (ip_hash, usage_date)
  values (p_ip_hash, current_date)
  on conflict (ip_hash, usage_date) do nothing;

  select * into v_row
  from public.guest_usage
  where ip_hash = p_ip_hash and usage_date = current_date
  for update;

  v_used := v_row.prompt_count;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'used', v_used, 'remaining', 0, 'limit', v_limit);
  end if;

  update public.guest_usage
  set prompt_count = prompt_count + 1, updated_at = now()
  where ip_hash = p_ip_hash and usage_date = current_date
  returning prompt_count into v_used;

  return jsonb_build_object('allowed', true, 'used', v_used, 'remaining', v_limit - v_used, 'limit', v_limit);
end;
$$;

create or replace function public.refund_guest_quota(p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guest_usage
  set prompt_count = greatest(prompt_count - 1, 0), updated_at = now()
  where ip_hash = p_ip_hash and usage_date = current_date;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cost telemetry. Every model call is logged with its token spend so you
--    can see per-user margin before the OpenAI invoice tells you.
-- ---------------------------------------------------------------------------

create table if not exists public.model_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('generate', 'enhance', 'guest_generate')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists model_usage_user_created_idx
  on public.model_usage(user_id, created_at desc);
create index if not exists model_usage_created_idx
  on public.model_usage(created_at desc);

revoke all on table public.model_usage from anon, authenticated;
alter table public.model_usage enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Fair-use ceiling for paid plans.
--    "Unlimited" stays true for every real founder. It stops a scraper from
--    burning a month of margin in an afternoon.
-- ---------------------------------------------------------------------------

create table if not exists public.paid_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  call_count integer not null default 0 check (call_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

revoke all on table public.paid_daily_usage from anon, authenticated;
alter table public.paid_daily_usage enable row level security;

-- Replaces the 001 version. Paid plans now pass through a generous daily
-- ceiling instead of being genuinely unbounded.
create or replace function public.consume_daily_quota(p_user_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := 'free';
  v_expires timestamptz;
  v_limit integer;
  v_used integer;
  v_row public.daily_usage%rowtype;
  v_paid_row public.paid_daily_usage%rowtype;
  v_fair_use constant integer := 150;
begin
  if p_kind not in ('prompt', 'enhance') then
    raise exception 'Invalid quota kind';
  end if;

  select plan, plan_expires_at
  into v_plan, v_expires
  from public.profiles
  where id = p_user_id;

  v_plan := coalesce(v_plan, 'free');

  if v_plan <> 'free' and v_expires is not null and v_expires > now() then
    insert into public.paid_daily_usage (user_id, usage_date)
    values (p_user_id, current_date)
    on conflict (user_id, usage_date) do nothing;

    select * into v_paid_row
    from public.paid_daily_usage
    where user_id = p_user_id and usage_date = current_date
    for update;

    if v_paid_row.call_count >= v_fair_use then
      return jsonb_build_object(
        'allowed', false,
        'plan', v_plan,
        'used', v_paid_row.call_count,
        'remaining', 0,
        'limit', v_fair_use,
        'fair_use', true
      );
    end if;

    update public.paid_daily_usage
    set call_count = call_count + 1, updated_at = now()
    where user_id = p_user_id and usage_date = current_date;

    return jsonb_build_object(
      'allowed', true,
      'plan', v_plan,
      'used', 0,
      'remaining', null,
      'limit', null
    );
  end if;

  if v_plan <> 'free' then
    update public.profiles
    set plan = 'free', plan_expires_at = null, updated_at = now()
    where id = p_user_id;
    v_plan := 'free';
  end if;

  v_limit := case when p_kind = 'prompt' then 5 else 3 end;

  insert into public.daily_usage (user_id, usage_date)
  values (p_user_id, current_date)
  on conflict (user_id, usage_date) do nothing;

  select * into v_row
  from public.daily_usage
  where user_id = p_user_id and usage_date = current_date
  for update;

  v_used := case when p_kind = 'prompt' then v_row.prompt_count else v_row.enhance_count end;

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'plan', 'free',
      'used', v_used,
      'remaining', 0,
      'limit', v_limit
    );
  end if;

  if p_kind = 'prompt' then
    update public.daily_usage
    set prompt_count = prompt_count + 1, updated_at = now()
    where user_id = p_user_id and usage_date = current_date
    returning prompt_count into v_used;
  else
    update public.daily_usage
    set enhance_count = enhance_count + 1, updated_at = now()
    where user_id = p_user_id and usage_date = current_date
    returning enhance_count into v_used;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'plan', 'free',
    'used', v_used,
    'remaining', v_limit - v_used,
    'limit', v_limit
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Self-healing profile. Fixes the account that gets permanently bricked
--    when the on_auth_user_created trigger did not fire.
-- ---------------------------------------------------------------------------

create or replace function public.ensure_profile(p_user_id uuid, p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  insert into public.profiles (id, display_name)
  values (p_user_id, coalesce(p_display_name, 'Builder'))
  on conflict (id) do nothing;

  select * into v_profile from public.profiles where id = p_user_id;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants. Everything below is service-role only.
-- ---------------------------------------------------------------------------

revoke all on function public.consume_guest_quota(text) from public, anon, authenticated;
revoke all on function public.refund_guest_quota(text) from public, anon, authenticated;
revoke all on function public.consume_daily_quota(uuid, text) from public, anon, authenticated;
revoke all on function public.ensure_profile(uuid, text) from public, anon, authenticated;

grant execute on function public.consume_guest_quota(text) to service_role;
grant execute on function public.refund_guest_quota(text) to service_role;
grant execute on function public.consume_daily_quota(uuid, text) to service_role;
grant execute on function public.ensure_profile(uuid, text) to service_role;
