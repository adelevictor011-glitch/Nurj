-- Nurj: complimentary (comp) accounts
-- Gives listed emails the top paid plan with no billing and no real expiry.
-- Run once in the Supabase SQL editor after 001-003. Safe to re-run.
--
-- To add someone later:
--   insert into public.comp_accounts (email) values ('person@example.com')
--   on conflict do nothing;
--   select public.apply_comp_accounts();
-- To remove someone:
--   delete from public.comp_accounts where email = 'person@example.com';
--   update public.profiles set plan = 'free', plan_expires_at = null
--   where id = (select id from auth.users where lower(email) = 'person@example.com');

create table if not exists public.comp_accounts (
  email text primary key check (email = lower(email)),
  plan text not null default 'operator' check (plan in ('builder', 'operator')),
  note text,
  created_at timestamptz not null default now()
);

-- Server-only: no client role can read or change the comp list.
alter table public.comp_accounts enable row level security;
revoke all on table public.comp_accounts from anon, authenticated;

insert into public.comp_accounts (email, note) values
  ('thezeengtalks@gmail.com', 'admin'),
  ('ourblueprintvault@gmail.com', 'admin'),
  ('madebyyouni@gmail.com', 'admin')
on conflict (email) do nothing;

-- Far-future expiry so every existing "is the plan active?" check passes.
create or replace function public.comp_expiry()
returns timestamptz
language sql
immutable
as $$ select timestamptz '2099-12-31 23:59:59+00' $$;

-- New profiles: upgrade on creation if the user's email is on the comp list.
create or replace function public.apply_comp_plan_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_plan text;
begin
  -- Only act on server-side creation (signup trigger, ensure_profile). A
  -- browser upsert must stay plan = 'free' or the profiles_insert_own RLS
  -- check rejects it and onboarding breaks.
  if auth.uid() is not null then
    return new;
  end if;

  select c.plan into v_plan
  from auth.users u
  join public.comp_accounts c on c.email = lower(u.email)
  where u.id = new.id;

  if v_plan is not null then
    new.plan := v_plan;
    new.plan_expires_at := public.comp_expiry();
  end if;
  return new;
end;
$$;

drop trigger if exists apply_comp_plan_on_profile on public.profiles;
create trigger apply_comp_plan_on_profile
  before insert on public.profiles
  for each row execute function public.apply_comp_plan_on_profile();

-- Existing profiles: upgrade anyone already signed up.
create or replace function public.apply_comp_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer;
begin
  update public.profiles p
  set plan = c.plan,
      plan_expires_at = public.comp_expiry(),
      updated_at = now()
  from auth.users u
  join public.comp_accounts c on c.email = lower(u.email)
  where u.id = p.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.apply_comp_plan_on_profile() from public, anon, authenticated;
revoke all on function public.apply_comp_accounts() from public, anon, authenticated;
grant execute on function public.apply_comp_accounts() to service_role;

select public.apply_comp_accounts() as comp_accounts_upgraded;
