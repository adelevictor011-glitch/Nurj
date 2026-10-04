-- Nurj — roadmap Batches 2 to 4
-- Run after 008_admin_console.sql.
--
--   8  saved prompts library (plan limits: Free 10, Builder 200, Operator unlimited)
--   5  Win Log
--   6  Monday digest preferences
--   4  Operator monthly niche prompt packs
--   17 multiple businesses (Free 1, Builder 1, Operator 3) and the Option A
--      add-on: ₦5,000 per extra business per 30 days, up to 2, paid plans only

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The plan that is actually active right now ('free' once a plan lapses).
create or replace function public.active_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when plan <> 'free' and plan_expires_at is not null and plan_expires_at > now() then plan
    else 'free'
  end
  from public.profiles where id = p_user;
$$;

revoke all on function public.active_plan(uuid) from public, anon, authenticated;
grant execute on function public.active_plan(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 17. Businesses (created first: saved prompts and wins reference them)
-- ---------------------------------------------------------------------------

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 800),
  target_customer text check (char_length(target_customer) <= 800),
  category text,
  stage text check (stage in ('validation', 'launch', 'scaling', 'exit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_user_created_idx on public.businesses(user_id, created_at);

-- The profile keeps a copy of the active business so every existing screen
-- and API keeps working unchanged.
alter table public.profiles
  add column if not exists active_business_id uuid references public.businesses(id) on delete set null;

-- One row per paid add-on: each adds one business slot for 30 days.
create table if not exists public.business_addons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_reference text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists business_addons_user_idx on public.business_addons(user_id, expires_at);

-- Base slots by plan, plus up to 2 active add-ons on a paid plan.
create or replace function public.business_allowance(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case public.active_plan(p_user)
           when 'operator' then 3
           else 1
         end
         + case when public.active_plan(p_user) = 'free' then 0
                else least(2, (select count(*) from public.business_addons
                               where user_id = p_user and expires_at > now()))::integer
           end;
$$;

-- A business is unlocked when it falls within the allowance, oldest first.
-- Businesses beyond it stay readable but cannot be edited or switched to.
create or replace function public.business_unlocked(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select user_id from public.businesses
    where id = p_business and (auth.uid() is null or user_id = auth.uid())
  ),
  ranked as (
    select b.id, row_number() over (order by b.created_at, b.id) as position
    from public.businesses b
    where b.user_id = (select user_id from target)
  )
  select coalesce(
    (select position <= public.business_allowance((select user_id from target)) from ranked where id = p_business),
    false
  );
$$;

-- The signed-in user's own allowance, for the Settings screen.
create or replace function public.my_business_allowance()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.business_allowance(auth.uid());
$$;

revoke all on function public.business_allowance(uuid) from public, anon, authenticated;
revoke all on function public.business_unlocked(uuid) from public, anon;
revoke all on function public.my_business_allowance() from public, anon;
grant execute on function public.business_allowance(uuid) to service_role;
grant execute on function public.business_unlocked(uuid) to authenticated, service_role;
grant execute on function public.my_business_allowance() to authenticated;

create or replace function public.enforce_business_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serialise this user's inserts so parallel requests can't slip past the limit.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select count(*) from public.businesses where user_id = new.user_id) >= public.business_allowance(new.user_id) then
    raise exception 'You have reached your business limit for this plan.';
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_limit on public.businesses;
create trigger businesses_limit
  before insert on public.businesses
  for each row execute function public.enforce_business_limit();

alter table public.businesses enable row level security;
alter table public.business_addons enable row level security;
revoke all on table public.businesses from anon, authenticated;
revoke all on table public.business_addons from anon, authenticated;
grant select, insert, delete on table public.businesses to authenticated;
grant update (name, description, target_customer, category, stage, updated_at) on table public.businesses to authenticated;
grant select on table public.business_addons to authenticated;

drop policy if exists businesses_select_own on public.businesses;
create policy businesses_select_own on public.businesses
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists businesses_insert_own on public.businesses;
create policy businesses_insert_own on public.businesses
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists businesses_update_unlocked on public.businesses;
create policy businesses_update_unlocked on public.businesses
  for update to authenticated
  using (auth.uid() = user_id and public.business_unlocked(id))
  with check (auth.uid() = user_id);
drop policy if exists businesses_delete_own on public.businesses;
-- The business in use cannot be deleted; switch first. (Deleting it would
-- leave the profile pointing at nothing.)
create policy businesses_delete_own on public.businesses
  for delete to authenticated
  using (auth.uid() = user_id
         and id is distinct from (select active_business_id from public.profiles where id = auth.uid()));
drop policy if exists business_addons_select_own on public.business_addons;
create policy business_addons_select_own on public.business_addons
  for select to authenticated using (auth.uid() = user_id);


-- Keep the active business row in step with the profile fields. Saving
-- business details anywhere (sign-up, Settings, Studio) updates it; a first
-- save creates it.
create or replace function public.sync_active_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_description is null or btrim(new.business_description) = '' then
    return new;
  end if;

  if new.active_business_id is null then
    select id into new.active_business_id
    from public.businesses where user_id = new.id order by created_at, id limit 1;
  end if;

  if new.active_business_id is null then
    insert into public.businesses (user_id, name, description, target_customer, category, stage)
    values (new.id, left(new.business_description, 60), new.business_description,
            new.target_customer, new.business_category, new.stage)
    returning id into new.active_business_id;
  elsif not public.business_unlocked(new.active_business_id) then
    -- Locked (plan lapsed or slot refunded): the row stays read-only.
    return new;
  elsif new.business_description is distinct from old.business_description
     or new.target_customer is distinct from old.target_customer
     or new.business_category is distinct from old.business_category
     or new.stage is distinct from old.stage then
    update public.businesses
    set description = new.business_description,
        target_customer = new.target_customer,
        category = new.business_category,
        stage = new.stage,
        updated_at = now()
    where id = new.active_business_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_active_business on public.profiles;
create trigger profiles_sync_active_business
  before update of business_description, target_customer, business_category, stage, active_business_id
  on public.profiles
  for each row execute function public.sync_active_business();

-- Switch the active business. Locked businesses cannot be chosen.
create or replace function public.switch_business(p_business uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.businesses%rowtype;
begin
  select * into v_row from public.businesses where id = p_business and user_id = auth.uid();
  if not found then raise exception 'Business not found.'; end if;
  if not public.business_unlocked(p_business) then
    raise exception 'This business is locked. Upgrade or add a business slot to use it.';
  end if;

  update public.profiles
  set active_business_id = v_row.id,
      business_description = v_row.description,
      target_customer = v_row.target_customer,
      business_category = v_row.category,
      stage = coalesce(v_row.stage, stage),
      updated_at = now()
  where id = auth.uid();

  return jsonb_build_object('id', v_row.id, 'name', v_row.name);
end;
$$;

-- If the active business became locked (plan lapsed, slot refunded), move
-- the profile back to the oldest business, which is always unlocked.
create or replace function public.ensure_active_business_unlocked(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active uuid;
  v_row public.businesses%rowtype;
begin
  select active_business_id into v_active from public.profiles where id = p_user;
  if v_active is null or public.business_unlocked(v_active) then
    return;
  end if;
  select * into v_row from public.businesses where user_id = p_user order by created_at, id limit 1;
  update public.profiles
  set active_business_id = v_row.id,
      business_description = v_row.description,
      target_customer = v_row.target_customer,
      business_category = v_row.category,
      stage = coalesce(v_row.stage, stage),
      updated_at = now()
  where id = p_user;
end;
$$;

revoke all on function public.ensure_active_business_unlocked(uuid) from public, anon, authenticated;
grant execute on function public.ensure_active_business_unlocked(uuid) to service_role;

revoke all on function public.switch_business(uuid) from public, anon;
grant execute on function public.switch_business(uuid) to authenticated;

-- Backfill: every existing profile with business details gets its first
-- business row (the trigger creates it).
update public.profiles
set active_business_id = null
where active_business_id is null and business_description is not null and btrim(business_description) <> '';

-- ---------------------------------------------------------------------------
-- 17. Add-on payments: allow the product and activate it as a slot, not a plan
-- ---------------------------------------------------------------------------

alter table public.payments drop constraint if exists payments_plan_check;
alter table public.payments
  add constraint payments_plan_check check (plan in ('builder', 'operator', 'business_addon'));

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

  if v_payment.status = 'needs_refund' then
    return jsonb_build_object('activated', false, 'plan', v_payment.plan, 'needs_refund', true,
      'reason', 'This business slot could not be added, so we will refund it within 2 working days.');
  end if;

  if v_payment.status = 'success' then
    if v_payment.plan = 'business_addon' then
      select expires_at into v_expires from public.business_addons where payment_reference = p_reference;
    else
      select plan_expires_at into v_expires from public.profiles where id = v_payment.user_id;
    end if;
    return jsonb_build_object('activated', true, 'plan', v_payment.plan, 'expires_at', v_expires, 'idempotent', true);
  end if;

  update public.payments
  set status = 'success',
      paid_at = coalesce(p_paid_at, now()),
      verified_at = now()
  where reference = p_reference;

  if v_payment.plan = 'business_addon' then
    -- Re-check at payment time: a plan can lapse, or two checkouts can be
    -- paid, between starting checkout and paying. Money taken for a slot
    -- that cannot be granted is flagged for refund instead.
    -- Lock the buyer's profile so two add-on payments landing together are
    -- counted one after the other.
    perform 1 from public.profiles where id = v_payment.user_id for update;
    if public.active_plan(v_payment.user_id) = 'free'
       or (select count(*) from public.business_addons where user_id = v_payment.user_id and expires_at > now()) >= 2 then
      update public.payments set status = 'needs_refund' where reference = p_reference;
      return jsonb_build_object('activated', false, 'plan', v_payment.plan, 'needs_refund', true,
        'reason', 'This business slot could not be added, so we will refund it within 2 working days.');
    end if;
    v_expires := now() + interval '30 days';
    insert into public.business_addons (user_id, payment_reference, expires_at)
    values (v_payment.user_id, p_reference, v_expires)
    on conflict (payment_reference) do nothing;
  else
    select greatest(now(), coalesce(plan_expires_at, now()))
    into v_base
    from public.profiles
    where id = v_payment.user_id
    for update;

    v_expires := v_base + interval '30 days';

    update public.profiles
    set plan = v_payment.plan,
        plan_expires_at = v_expires,
        updated_at = now()
    where id = v_payment.user_id;
  end if;

  return jsonb_build_object('activated', true, 'plan', v_payment.plan, 'expires_at', v_expires, 'idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Saved prompts library
-- ---------------------------------------------------------------------------

create table if not exists public.saved_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  prompt text not null check (char_length(prompt) between 1 and 8000),
  tags text[] not null default '{}' check (cardinality(tags) <= 5),
  source text not null default 'manual' check (source in ('generated', 'enhanced', 'refined', 'pack', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_prompts_user_idx on public.saved_prompts(user_id, updated_at desc);

create or replace function public.enforce_saved_prompt_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  -- Serialise this user's inserts so parallel requests can't slip past the limit.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  v_limit := case public.active_plan(new.user_id) when 'operator' then null when 'builder' then 200 else 10 end;
  if v_limit is not null and (select count(*) from public.saved_prompts where user_id = new.user_id) >= v_limit then
    raise exception 'Your saved prompts library is full (% on your plan). Delete one or upgrade.', v_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists saved_prompts_limit on public.saved_prompts;
create trigger saved_prompts_limit
  before insert on public.saved_prompts
  for each row execute function public.enforce_saved_prompt_limit();

alter table public.saved_prompts enable row level security;
revoke all on table public.saved_prompts from anon, authenticated;
grant select, insert, update, delete on table public.saved_prompts to authenticated;

drop policy if exists saved_prompts_own on public.saved_prompts;
create policy saved_prompts_own on public.saved_prompts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Win Log (self-reported)
-- ---------------------------------------------------------------------------

create table if not exists public.wins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  amount_kobo bigint not null check (amount_kobo between 0 and 100000000000),
  note text not null check (char_length(note) between 1 and 200),
  won_on date not null default ((now() at time zone 'Africa/Lagos')::date),
  created_at timestamptz not null default now()
);

create index if not exists wins_user_idx on public.wins(user_id, won_on desc);

alter table public.wins enable row level security;
revoke all on table public.wins from anon, authenticated;
grant select, insert, update, delete on table public.wins to authenticated;

drop policy if exists wins_own on public.wins;
create policy wins_own on public.wins
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. Monday digest preferences
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists digest_opt_out boolean not null default false,
  add column if not exists digest_winback_sent_at timestamptz,
  add column if not exists digest_last_sent_at timestamptz;

grant update (digest_opt_out) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Operator monthly niche prompt packs (generated once per month, sector
--    and stage, then shared by every Operator in that group)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_packs (
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  category text not null,
  stage text not null,
  title text not null,
  prompts jsonb not null,
  created_at timestamptz not null default now(),
  primary key (month, category, stage)
);

alter table public.prompt_packs enable row level security;
revoke all on table public.prompt_packs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin overview: count the new tables too (extends 008)
-- ---------------------------------------------------------------------------

create or replace function public.admin_feature_usage()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'saved_prompts', (select count(*) from public.saved_prompts),
    'wins_logged', (select count(*) from public.wins),
    'wins_total_kobo', (select coalesce(sum(amount_kobo), 0) from public.wins),
    'businesses', (select count(*) from public.businesses),
    'active_addons', (select count(*) from public.business_addons where expires_at > now()),
    'digest_opted_out', (select count(*) from public.profiles where digest_opt_out),
    'payments_needing_refund', (select count(*) from public.payments where status = 'needs_refund')
  );
$$;

revoke all on function public.admin_feature_usage() from public, anon, authenticated;
grant execute on function public.admin_feature_usage() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Digest candidates, aggregated in SQL (no row caps, fair ordering).
--    Inactive people who already had their one win-back are excluded.
-- ---------------------------------------------------------------------------

create or replace function public.digest_candidates(p_limit integer default 500)
returns table (
  id uuid,
  display_name text,
  stage text,
  created_at timestamptz,
  winback_sent boolean,
  last_active_at timestamptz,
  prompts_7d integer,
  wins_7d_kobo bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with activity as (
    select user_id, max(created_at) as last_at,
           count(*) filter (where created_at > now() - interval '7 days') as prompts_7d
    from public.prompt_history
    where created_at > now() - interval '21 days'
    group by user_id
  ),
  won as (
    select user_id, sum(amount_kobo) as total
    from public.wins
    where created_at > now() - interval '7 days'
    group by user_id
  )
  select p.id, p.display_name, p.stage, p.created_at,
         p.digest_winback_sent_at is not null,
         a.last_at,
         coalesce(a.prompts_7d, 0)::integer,
         coalesce(w.total, 0)::bigint
  from public.profiles p
  left join activity a on a.user_id = p.id
  left join won w on w.user_id = p.id
  where not p.digest_opt_out
    and (p.digest_last_sent_at is null or p.digest_last_sent_at < now() - interval '6 days')
    and (a.last_at is not null or (p.digest_winback_sent_at is null and p.created_at < now() - interval '7 days'))
  order by p.digest_last_sent_at nulls first, p.id
  limit greatest(p_limit, 1);
$$;

revoke all on function public.digest_candidates(integer) from public, anon, authenticated;
grant execute on function public.digest_candidates(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Review fixes: atomic Builder run cap, and refunds for paid fair use.
-- ---------------------------------------------------------------------------

-- Builder's 10 runs a day, counted per Lagos day in one atomic step so
-- parallel requests cannot slip past the cap.
create table if not exists public.run_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  run_count integer not null default 0 check (run_count >= 0),
  primary key (user_id, usage_date)
);

alter table public.run_usage enable row level security;
revoke all on table public.run_usage from anon, authenticated;

create or replace function public.consume_run_slot(p_user uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.run_usage (user_id, usage_date, run_count)
  values (p_user, (now() at time zone 'Africa/Lagos')::date, 1)
  on conflict (user_id, usage_date) do update
    set run_count = public.run_usage.run_count + 1
    where public.run_usage.run_count < p_limit
  returning run_count into v_count;
  return v_count is not null;
end;
$$;

create or replace function public.refund_run_slot(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.run_usage
  set run_count = greatest(run_count - 1, 0)
  where user_id = p_user and usage_date = (now() at time zone 'Africa/Lagos')::date;
$$;

revoke all on function public.consume_run_slot(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_run_slot(uuid) from public, anon, authenticated;
grant execute on function public.consume_run_slot(uuid, integer) to service_role;
grant execute on function public.refund_run_slot(uuid) to service_role;

-- A failed AI call now gives the slot back for paid plans too (it used to
-- refund only the free counter, so paid failures ate fair-use calls).
create or replace function public.refund_daily_quota(p_user_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('prompt', 'enhance') then
    raise exception 'Invalid quota kind';
  end if;

  if public.active_plan(p_user_id) <> 'free' then
    update public.paid_daily_usage
    set call_count = greatest(call_count - 1, 0), updated_at = now()
    where user_id = p_user_id and usage_date = current_date;
  elsif p_kind = 'prompt' then
    update public.daily_usage
    set prompt_count = greatest(prompt_count - 1, 0), updated_at = now()
    where user_id = p_user_id and usage_date = current_date;
  else
    update public.daily_usage
    set enhance_count = greatest(enhance_count - 1, 0), updated_at = now()
    where user_id = p_user_id and usage_date = current_date;
  end if;
end;
$$;

revoke all on function public.refund_daily_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_daily_quota(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Per-user 30-day token total, for the monthly plan budget in the AI
--    functions (past it, that user moves to the cheaper model).
-- ---------------------------------------------------------------------------

create or replace function public.user_tokens_30d(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(total_tokens), 0)::bigint
  from public.model_usage
  where user_id = p_user and created_at > now() - interval '30 days';
$$;

revoke all on function public.user_tokens_30d(uuid) from public, anon, authenticated;
grant execute on function public.user_tokens_30d(uuid) to service_role;
