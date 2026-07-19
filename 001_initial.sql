-- Nurj v2 production schema for Supabase
-- Run once in a new Supabase project's SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  business_description text,
  target_customer text,
  business_category text,
  stage text check (stage in ('validation', 'launch', 'scaling', 'exit')),
  onboarding_complete boolean not null default false,
  momentum_score integer not null default 0 check (momentum_score between 0 and 100),
  plan text not null default 'free' check (plan in ('free', 'builder', 'operator')),
  plan_expires_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  prompt_count integer not null default 0 check (prompt_count >= 0),
  enhance_count integer not null default 0 check (enhance_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists public.prompt_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('generated', 'enhanced')),
  title text not null,
  goal text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prompt_history_user_created_idx
  on public.prompt_history(user_id, created_at desc);

create table if not exists public.action_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, action_key)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  plan text not null check (plan in ('builder', 'operator')),
  amount integer not null check (amount > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'initialized',
  paid_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payments_user_created_idx
  on public.payments(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.daily_usage enable row level security;
alter table public.prompt_history enable row level security;
alter table public.action_progress enable row level security;
alter table public.payments enable row level security;

-- Profiles: authenticated users can manage only non-sensitive context fields.
-- Plan and expiry remain server-only.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (
  id, display_name, business_description, target_customer, business_category,
  stage, onboarding_complete, momentum_score, last_active_at, updated_at
) on table public.profiles to authenticated;
grant update (
  display_name, business_description, target_customer, business_category,
  stage, onboarding_complete, momentum_score, last_active_at, updated_at
) on table public.profiles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (auth.uid() = id and plan = 'free' and plan_expires_at is null);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- History and payments are readable by their owner; writes are server-side.
revoke all on table public.prompt_history from anon, authenticated;
grant select on table public.prompt_history to authenticated;
drop policy if exists history_select_own on public.prompt_history;
create policy history_select_own on public.prompt_history
  for select to authenticated using (auth.uid() = user_id);

revoke all on table public.payments from anon, authenticated;
grant select on table public.payments to authenticated;
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated using (auth.uid() = user_id);

-- Action progress is safe for the authenticated user to manage directly.
revoke all on table public.action_progress from anon, authenticated;
grant select, insert, update, delete on table public.action_progress to authenticated;
drop policy if exists action_progress_own on public.action_progress;
create policy action_progress_own on public.action_progress
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Daily quota rows are intentionally inaccessible to browser clients.
revoke all on table public.daily_usage from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Atomic free-tier usage check. Paid users return unlimited access.
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

create or replace function public.refund_daily_quota(p_user_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'prompt' then
    update public.daily_usage
    set prompt_count = greatest(prompt_count - 1, 0), updated_at = now()
    where user_id = p_user_id and usage_date = current_date;
  elsif p_kind = 'enhance' then
    update public.daily_usage
    set enhance_count = greatest(enhance_count - 1, 0), updated_at = now()
    where user_id = p_user_id and usage_date = current_date;
  else
    raise exception 'Invalid quota kind';
  end if;
end;
$$;

-- Idempotently records a verified Paystack payment and extends access by 30 days.
create or replace function public.activate_verified_payment(
  p_reference text,
  p_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_base timestamptz;
  v_expires timestamptz;
begin
  select * into v_payment
  from public.payments
  where reference = p_reference
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.status = 'success' then
    select plan_expires_at into v_expires
    from public.profiles
    where id = v_payment.user_id;

    return jsonb_build_object(
      'activated', true,
      'plan', v_payment.plan,
      'expires_at', v_expires,
      'idempotent', true
    );
  end if;

  select greatest(now(), coalesce(plan_expires_at, now()))
  into v_base
  from public.profiles
  where id = v_payment.user_id
  for update;

  v_expires := v_base + interval '30 days';

  update public.payments
  set status = 'success',
      paid_at = coalesce(p_paid_at, now()),
      verified_at = now()
  where reference = p_reference;

  update public.profiles
  set plan = v_payment.plan,
      plan_expires_at = v_expires,
      updated_at = now()
  where id = v_payment.user_id;

  return jsonb_build_object(
    'activated', true,
    'plan', v_payment.plan,
    'expires_at', v_expires,
    'idempotent', false
  );
end;
$$;

revoke all on function public.consume_daily_quota(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_daily_quota(uuid, text) from public, anon, authenticated;
revoke all on function public.activate_verified_payment(text, timestamptz) from public, anon, authenticated;

grant execute on function public.consume_daily_quota(uuid, text) to service_role;
grant execute on function public.refund_daily_quota(uuid, text) to service_role;
grant execute on function public.activate_verified_payment(text, timestamptz) to service_role;
