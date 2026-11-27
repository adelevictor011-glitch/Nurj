# Nurj deployment checklist

## Supabase

- [ ] Create the production project.
- [ ] Run `supabase/migrations/001_initial.sql`.
- [ ] Run `supabase/migrations/002_guest_trial_and_cost_controls.sql`.
- [ ] Run `supabase/migrations/003_execution_loop.sql`.
- [ ] Run `supabase/migrations/004_comp_accounts.sql` (free Operator access for the emails in `comp_accounts`).
- [ ] Run `supabase/migrations/005_saved_snippets.sql` (saved task contexts and mentors / frameworks).
- [ ] Run `supabase/migrations/006_spend_guardrails.sql` (daily AI budget, alerts, usage view).
- [ ] Run `supabase/migrations/007_trust_layer.sql` (consent record, refunds, anonymised payment archive).
- [ ] Run `supabase/migrations/008_admin_console.sql` (WRAP, admin overview, manual plan grants). Admins are `comp_accounts` rows with note `admin`.
- [ ] Run `supabase/migrations/009_batches_2_to_4.sql`.
- [ ] Run `supabase/migrations/010_sector_insights.sql` (insights switch on by themselves at 30 reports).
- [ ] For the exact 07:30 WAT daily job, follow `supabase/scheduled/daily_job_0730_wat.sql`.
- [ ] Enable Google as an Auth provider.
- [ ] Set the Site URL to the final Vercel domain.
- [ ] Add `http://localhost:3000` and all Vercel preview/production callback URLs to the Auth redirect allow list.
- [ ] Confirm a new Google user automatically receives a `profiles` row.
- [ ] Confirm an authenticated browser cannot update `plan` or `plan_expires_at`.

## Vercel

- [ ] Import the GitHub repository as a Vite project.
- [ ] Add all eight variables from `.env.example`, including `GUEST_IP_SALT`
      (`openssl rand -hex 32`).
- [ ] Confirm `/api/guest/generate` returns `429` on the second call from the
      same IP on the same day.
- [ ] Hard-refresh a deep link and the Paystack callback URL to confirm the SPA
      rewrite is serving `index.html` rather than a 404.
- [ ] Set `APP_URL` separately for production and preview environments where payment testing is required.
- [ ] Deploy, then redeploy after changing any `VITE_` variable.
- [ ] Confirm `/api/status` returns `401` without an access token.

## OpenAI

- [ ] Add a project-scoped API key.
- [ ] Set an initial monthly budget and alerts.
- [ ] Confirm rows appear in `model_usage` after a generation, so per-user cost
      is visible before the invoice is.
- [ ] Test one prompt generation and one enhancement.
- [ ] Confirm a failed generation refunds the consumed quota.

## Paystack

- [ ] Start with test mode.
- [ ] Add the webhook URL: `https://YOUR_DOMAIN/api/payments/webhook`.
- [ ] Complete Builder and Operator test payments.
- [ ] Confirm the exact amount and NGN currency are checked.
- [ ] Confirm refreshing the callback does not add another 30 days.
- [ ] Switch to live keys only after the test checklist passes.

## Bank transfer checkout (until Paystack is live)

How it works: the customer taps a plan, sees your account details, the exact
amount and a token like `NURJ-K7Q4MX`, puts the token in the narration and
emails the receipt to the payments inbox. Every 5 minutes the inbox agent
reads that inbox (read-only). A credit alert from your bank that carries the
token and the exact amount switches the plan on by itself and emails the
customer. A receipt on its own never does, because receipts are easy to fake.
Anything else (no token, wrong amount, unverified sender) goes to **Admin →
Payments to confirm** for one click.

- [ ] Run `supabase/migrations/013_bank_transfer.sql`.
- [ ] Have your bank send credit alerts to the Titan inbox (for example support@nurjai.com), either directly or with a forwarding rule.
- [ ] In Vercel, set `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`, `PAYMENT_PROOF_EMAIL`, `INBOX_IMAP_USER`, `INBOX_IMAP_PASSWORD` and `BANK_ALERT_SENDERS`, then `VITE_TRANSFER_LIVE=true`. Redeploy.
- [ ] Open one real bank alert in Titan, choose "Show original", and copy the first word after `Authentication-Results:` in the TOP header into `INBOX_AUTHSERV_ID`. Until it is set, alerts wait for a click instead of auto-confirming.
- [ ] Run `supabase/scheduled/payment_inbox_every_5_min.sql` (replace the domain first).
- [ ] Test: start a Builder transfer, send ₦10,000 with the token, email the receipt. Within 5 minutes the waiting screen should turn green and the customer email should arrive.
- [ ] When Paystack goes live, set `VITE_BILLING_LIVE=true`. Transfer checkout switches off by itself, and open transfers can still be confirmed in admin.

## Search

- [ ] After the guide library ships, submit `https://nurjai.com/sitemap.xml` in Google Search Console.

## Product QA

- [ ] Test at 360px, 390px, tablet and desktop widths.
- [ ] Complete all five quiz answers and verify all four possible stages.
- [ ] Test guest exploration, Google sign-in, sign-out and returning sessions.
- [ ] Test free limits: 5 prompts and 3 enhancements per day.
- [ ] Test history, account context, plan expiry and mobile navigation.
- [ ] Confirm the support and privacy mailboxes in `src/legal.ts` exist, and have a lawyer review /terms, /privacy and /refunds.
