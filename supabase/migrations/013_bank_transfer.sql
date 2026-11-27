-- Nurj — bank transfer checkout, payment inbox agent, financials tracker.
-- Run after 012_growth_engine.sql. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Transfer payments live in the same payments table as card payments.
--    Each one carries a short token the customer puts in the transfer
--    narration and in their proof email (NURJ-XXXXXX).
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists method text not null default 'card';
alter table public.payments add column if not exists transfer_token text;
alter table public.payments add column if not exists transfer_expires_at timestamptz;
alter table public.payments add column if not exists proof_received_at timestamptz;
alter table public.payments add column if not exists confirmed_by text;   -- 'paystack', 'bank_alert', or an admin email
alter table public.payments add column if not exists review_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_method_check') then
    alter table public.payments add constraint payments_method_check check (method in ('card', 'transfer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_transfer_token_format') then
    alter table public.payments add constraint payments_transfer_token_format
      check (transfer_token is null or transfer_token ~ '^[A-HJ-NP-Z2-9]{6}$');
  end if;
end $$;

create unique index if not exists payments_transfer_token_key on public.payments(transfer_token) where transfer_token is not null;
create index if not exists payments_transfer_pending_idx on public.payments(status, created_at desc) where method = 'transfer';

-- ---------------------------------------------------------------------------
-- 2. Every email the inbox agent has looked at, so nothing is processed twice.
--    Server-only. Non-payment mail is stored as a bare id with no subject.
-- ---------------------------------------------------------------------------
create table if not exists public.inbox_messages (
  message_id text primary key,
  kind text not null check (kind in ('bank_alert', 'proof', 'other')),
  from_address text,
  subject text,
  received_at timestamptz,
  token text,
  amount_kobo integer,
  authenticated boolean not null default false,
  outcome text not null check (outcome in ('activated', 'proof_logged', 'needs_review', 'dismissed', 'ignored')),
  detail text,
  payment_reference text references public.payments(reference) on delete set null,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inbox_messages_review_idx on public.inbox_messages(outcome, created_at desc);
-- One bank credit can confirm one payment, never two.
create unique index if not exists inbox_messages_one_alert_per_payment
  on public.inbox_messages(payment_reference) where kind = 'bank_alert' and outcome = 'activated';
alter table public.inbox_messages enable row level security;
revoke all on table public.inbox_messages from anon, authenticated;
grant all on table public.inbox_messages to service_role;

-- ---------------------------------------------------------------------------
-- 3. Financials tracker: one row per Lagos day.
-- ---------------------------------------------------------------------------
create or replace function public.admin_financials(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series(
      (now() at time zone 'Africa/Lagos')::date - (least(greatest(p_days, 1), 180) - 1),
      (now() at time zone 'Africa/Lagos')::date,
      interval '1 day')::date as day
  ),
  comp as (
    select u.id from auth.users u join public.comp_accounts c on c.email = lower(u.email)
  ),
  pay as (
    select (paid_at at time zone 'Africa/Lagos')::date as day, method, amount, renewal
    from public.payments where status = 'success' and paid_at is not null
  ),
  ref as (
    select (created_at at time zone 'Africa/Lagos')::date as day, amount
    from public.refund_requests where status = 'refunded'
  ),
  usage as (
    select usage_date as day, count(distinct user_id) filter (where prompt_count + enhance_count > 0) as active,
           sum(prompt_count) as prompts, sum(enhance_count) as enhances
    from public.daily_usage group by usage_date
  ),
  ai as (
    select (created_at at time zone 'Africa/Lagos')::date as day, sum(total_tokens) as tokens
    from public.model_usage group by 1
  ),
  joins as (
    select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as signups
    from public.profiles where id not in (select id from comp) group by 1
  )
  select jsonb_build_object(
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'signups', coalesce(j.signups, 0),
        'active_users', coalesce(u.active, 0),
        'prompts', coalesce(u.prompts, 0),
        'enhancements', coalesce(u.enhances, 0),
        'ai_tokens', coalesce(a.tokens, 0),
        'card_kobo', (select coalesce(sum(amount), 0) from pay where pay.day = d.day and method = 'card'),
        'transfer_kobo', (select coalesce(sum(amount), 0) from pay where pay.day = d.day and method = 'transfer'),
        'payments', (select count(*) from pay where pay.day = d.day),
        'renewals', (select count(*) from pay where pay.day = d.day and renewal),
        'refunds_kobo', (select coalesce(sum(amount), 0) from ref where ref.day = d.day)
      ) order by d.day desc), '[]'::jsonb)
      from days d
      left join usage u on u.day = d.day
      left join ai a on a.day = d.day
      left join joins j on j.day = d.day
    ),
    'run_rate_kobo', (
      select coalesce(sum(case p.plan when 'builder' then 1000000 when 'operator' then 2500000 else 0 end), 0)
      from public.profiles p where p.plan <> 'free' and p.plan_expires_at > now() and p.id not in (select id from comp)
    ),
    'transfers_pending', (
      select count(*) from public.payments
      where method = 'transfer' and status in ('awaiting_transfer', 'proof_received') and transfer_expires_at > now()
    ),
    'inbox_needs_review', (select count(*) from public.inbox_messages where outcome = 'needs_review')
  );
$$;
revoke all on function public.admin_financials(integer) from public, anon, authenticated;
grant execute on function public.admin_financials(integer) to service_role;

notify pgrst, 'reload schema';
