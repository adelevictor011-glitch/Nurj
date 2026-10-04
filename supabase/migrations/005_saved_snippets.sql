-- Nurj — saved task contexts and mentors / frameworks
-- Run after 004_comp_accounts.sql.
--
-- Users can keep a reusable list of task contexts and mentors / frameworks.
-- A row only changes when the user explicitly saves, updates or deletes it.

create table if not exists public.saved_snippets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('context', 'mentor')),
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (
    char_length(body) between 1 and 1800
    and (kind <> 'mentor' or char_length(body) <= 1500)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_snippets_user_kind_idx
  on public.saved_snippets(user_id, kind, updated_at desc);

alter table public.saved_snippets enable row level security;

revoke all on table public.saved_snippets from anon, authenticated;
grant select, insert, update, delete on table public.saved_snippets to authenticated;

drop policy if exists saved_snippets_select_own on public.saved_snippets;
create policy saved_snippets_select_own on public.saved_snippets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists saved_snippets_insert_own on public.saved_snippets;
create policy saved_snippets_insert_own on public.saved_snippets
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists saved_snippets_update_own on public.saved_snippets;
create policy saved_snippets_update_own on public.saved_snippets
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists saved_snippets_delete_own on public.saved_snippets;
create policy saved_snippets_delete_own on public.saved_snippets
  for delete to authenticated using (auth.uid() = user_id);

-- Cap the list so nobody stores unbounded text: 30 per kind per user.
create or replace function public.enforce_saved_snippet_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.saved_snippets
      where user_id = new.user_id and kind = new.kind) >= 30 then
    raise exception 'Saved list is full (30 items). Delete one first.';
  end if;
  return new;
end;
$$;

drop trigger if exists saved_snippets_limit on public.saved_snippets;
create trigger saved_snippets_limit
  before insert on public.saved_snippets
  for each row execute function public.enforce_saved_snippet_limit();
