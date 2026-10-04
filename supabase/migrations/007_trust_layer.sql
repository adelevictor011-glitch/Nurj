-- Nurj — trust layer (roadmap feature 20)
-- Run after 006_spend_guardrails.sql.

-- 1. Consent record. Written by the server only (not in the browser's
--    column grants), so it reflects what the user actually accepted.
alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

-- 2. Payment records outlive a deleted account for tax and accounting, but
--    without anything that identifies the person.
create table if not exists public.payment_archive (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  plan text not null,
  amount integer not null,
  currency text not null,
  status text not null,
  paid_at timestamptz,
  created_at timestamptz,
  archived_at timestamptz not null default now()
);

alter table public.payment_archive enable row level security;
revoke all on table public.payment_archive from anon, authenticated;

-- 3. Self-serve refunds: one per person, within 7 days of payment.
--    email_hash (salted SHA-256) survives account deletion, so deleting and
--    re-joining does not reset the once-per-person limit. previous_* keep
--    what the plan was before the refund, in case an admin reverses it.
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email_hash text,
  previous_plan text,
  previous_expires_at timestamptz,
  payment_reference text not null unique,
  amount integer not null check (amount > 0),
  status text not null check (status in ('refunded', 'pending', 'failed')),
  paystack_message text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists refund_requests_user_idx on public.refund_requests(user_id);
create index if not exists refund_requests_email_hash_idx on public.refund_requests(email_hash);

alter table public.refund_requests enable row level security;
revoke all on table public.refund_requests from anon, authenticated;
