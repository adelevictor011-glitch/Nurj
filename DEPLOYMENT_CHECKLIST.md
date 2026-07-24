# Nurj deployment checklist

## Supabase

- [ ] Create the production project.
- [ ] Run `supabase/migrations/001_initial.sql`.
- [ ] Run `supabase/migrations/002_guest_trial_and_cost_controls.sql`.
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

## Product QA

- [ ] Test at 360px, 390px, tablet and desktop widths.
- [ ] Complete all five quiz answers and verify all four possible stages.
- [ ] Test guest exploration, Google sign-in, sign-out and returning sessions.
- [ ] Test free limits: 5 prompts and 3 enhancements per day.
- [ ] Test history, account context, plan expiry and mobile navigation.
- [ ] Add final legal pages and customer-support contact details.
