# Nurj v2.2 — journey, margin and product fixes

Every change below traces to a specific break found in the v2.0 audit.

## Apply order

1. Run `supabase/migrations/002_guest_trial_and_cost_controls.sql`, then
   `supabase/migrations/003_execution_loop.sql`, in the Supabase SQL editor.
   Both are safe on an existing database.
2. Add `GUEST_IP_SALT` to Vercel (all environments): `openssl rand -hex 32`.
3. Optional: add `RESEND_API_KEY`, `REMINDER_FROM_EMAIL` and `CRON_SECRET` to
   enable expiry reminder emails. Without them the cron still runs and reports
   who is due.
4. Deploy. Redeploy with build cache disabled if `vercel.json` looks stale.

---

## Revenue leaks closed

**Guest work is no longer destroyed at sign-in.**
`syncStatus` previously overwrote the local profile with the server profile and
forced `setScreen('quiz')`. A guest who had just answered five questions and
typed their business context was sent back to question one with everything
discarded. It now merges local context into the server profile, writes the
carried fields back to Supabase once, and only steers the screen on the first
sync — background refreshes never move someone out of the screen they are in.

**Upgrade intent survives OAuth.**
Clicking a plan while signed out called `signIn()`, and the post-OAuth sync then
dropped the user on the dashboard with the intent lost. A `pendingIntent` ref
now returns them to checkout.

**Payment verification retries instead of giving up.**
The old flow made one `verifyPayment` call and, on failure, showed a 2.8-second
toast with no retry, no polling, and no cleaned URL. Money left the account and
the customer had no path forward. Now: the reference is persisted to
`localStorage` *before* the Paystack redirect (so it survives a lost callback
URL or a dead phone), verification retries with backoff across ~29 seconds, and
a sticky banner offers "Check again" if all attempts fail.

**The plan now updates without a manual reload.**
`syncStatus` re-runs on window focus and visibility change, so a plan activated
by the Paystack webhook appears as soon as the user returns to the tab.

**Hitting the daily wall no longer produces a disappearing toast.**
The highest-intent moment in the funnel — "I've run out" — was a notification
that vanished in under three seconds with no button attached. Both the Studio
and the Enhancer now render a persistent `UpgradeWall` with a real CTA.

**Expiry is announced, not discovered.**
`PlanExpiryNotice` appears on the dashboard from five days out, and after
expiry. Previously the only signal that a subscription had ended was getting
blocked mid-task.

---

## The free tier now demonstrates the product

The guest path returned `localPrompt()` — a hard-coded string template — behind
a fake `setTimeout(900)` and a loader reading *"Nurj is structuring the
intelligence."* Nothing was being structured. `why_it_works` and `next_action`
were fixed strings, identical on every run.

New `POST /api/guest/generate` gives every visitor **one real generation per IP
per day**, no account required. The fake delay is gone. If the model call fails
for a network reason, it still falls back to the local scaffold rather than
showing a stranger nothing — but that is now the failure path, not the product.

IPs are stored only as salted SHA-256 hashes (`GUEST_IP_SALT`). Raw addresses
never reach the database.

---

## The classifier now does something

`classifyBusiness` ran on every generation, wrote `business_category`, and
**nothing read it**. It was not even sent to `/api/generate`.

- `api/_lib/prompts.ts` adds sector and stage briefs. A caterer's prompt now
  carries food-business dynamics (lead time, delivery radius, minimum order);
  a finance hustle carries the regulatory caution that keeps you out of trouble.
- `category` is sent from the client, validated server-side, persisted to
  `profiles.business_category`, and stored in `prompt_history.input`.
- Classification changed from first-array-match to match-count scoring.
  `"I design logos for fashion brands"` returned `fashion` purely because the
  fashion rule sat earlier in the array; it now returns `design_creative`.
  The old test asserted the wrong behaviour and has been replaced.

This is the start of the flywheel: every generation makes the sector priors
better, and the sector priors are the part a competitor cannot clone in a
weekend.

---

## Margin and cost control

**Fair-use ceiling.** "Unlimited" on a metered upstream had no ceiling of any
kind. `consume_daily_quota` now allows 150 paid calls per day — invisible to a
real founder, fatal to a scraper. It returns `fair_use: true` so you can tell
the two apart.

**Cost telemetry.** `model_usage` logs model, input tokens, output tokens and
total per call, per user, for all three call types. You can see per-user margin
before the OpenAI invoice tells you.

```sql
-- Top spenders this month
select user_id, count(*) as calls, sum(total_tokens) as tokens
from model_usage
where created_at > now() - interval '30 days'
group by user_id order by tokens desc limit 20;
```

---

## Operator is off the pricing page

Grepping `'operator'` across `src/` and `api/` found it in a type union, a
payment amount, a validator, and marketing copy. `consume_daily_quota` treats
every non-free plan identically; `Guides` gates only on `plan === 'free'`.
Someone paying ₦25,000 received byte-for-byte what someone paying ₦10,000
received.

The `PlanCard` is removed with a comment explaining why. The plan remains fully
supported end-to-end, so any existing Operator customer keeps their access. Put
it back the day it does something Builder does not.

Builder's feature list was also corrected. `'Complete stage playbook library'`
and `'Priority generation capacity'` were removed because neither exists — the
guide items in `Guides` have no `onClick` and `GuideItem` has no content field.
Playbooks are now real — see below.

---

## Playbooks now exist

`Guides` rendered 24 titles with read-time estimates for articles that were
never written, and the item buttons had no `onClick` at all.

`src/guides-content.ts` adds ~4,100 words of real, stage-specific content
across all 24 playbooks — the five-question idea filter, praise versus purchase
intent, deposits and payment terms, the concentration rule, the 90-day exit
countdown, and the rest. Written for this market: naira figures, WhatsApp and
Instagram as channels, black-tax months in the runway calculation, the exact
wording for a price-rise message.

`GuideReader` renders them properly (steps, lists, callouts) in a modal.
Free items open; locked items route to the upgrade screen instead of doing
nothing. `Complete stage playbook library` can honestly go back on Builder's
feature list whenever you want it there.

## The execution loop is closed

The product ended at the clipboard, so every unit of value was created inside
someone else's AI and Nurj never learned whether a prompt worked.

- `POST /api/execute` runs the architected prompt and returns the finished work
  product. Consumes quota, logs tokens, stores the run in `prompt_runs`.
- `RunPanel` puts "Run this prompt" directly under the generated prompt, then
  asks one question — **"Did this actually work?"**
- `POST /api/outcome` records the answer against the user's sector and stage in
  the `outcomes` table.

That table is the asset. Prompt UIs get cloned in a weekend; a dataset of which
prompts actually produced results, by sector and growth stage, in this market,
does not. It also feeds directly back into the sector briefs in
`api/_lib/prompts.ts` once you have volume.

## Expiry reminders

`api/cron/expiry-reminders.ts` runs daily at 09:00 via Vercel Cron. Finds
accounts expiring within three days, sends via Resend if configured, and stamps
`profiles.expiry_reminded_at` so nobody gets mailed twice. Without an email key
it still runs and returns the list, so you can send manually from day one.

## Reliability

- **Self-healing profile.** `api/status.ts` used `.single()`, so a user whose
  `on_auth_user_created` trigger never fired got "Your profile could not be
  loaded" forever, with no recovery path. It now calls `ensure_profile` and
  repairs the row.
- **Bookkeeping cannot destroy paid output.** The `prompt_history` insert sat
  inside the try block after the OpenAI call — a failed insert threw away a
  generation you had already paid for. History and profile writes are now
  fire-and-forget with error logging.
- **Error boundary.** Any render throw previously produced a blank white page.
- **Cross-device progress.** `action_progress` existed in the schema, fully
  secured and granted, and was never referenced. Weekly actions now persist
  under `stage:index` keys and survive a new phone.

---

## Build, security, delivery

- `sourcemap: false`. You were shipping a 1.7MB `.js.map` with a
  `sourceMappingURL` comment — fully readable source, public.
- SPA rewrite added. Without it a hard refresh on the Paystack callback URL can
  404 the customer mid-payment.
- CSP and HSTS added; `frame-src`/`form-action` allow `checkout.paystack.com`.
- CI moved from Node 20 to 22, matching `.nvmrc`, `engines`, and
  `@supabase/supabase-js`'s `>=22` requirement.
- `tsconfig.api.json` added and referenced. `tsconfig.app.json` only included
  `src`, so nothing in `api/` was ever typechecked by `tsc -b` or CI.
- `ShareButton` sends any generated prompt to WhatsApp with a Nurj footer —
  the cheapest growth loop available for this audience.

---

## Not done — deliberate

One item remains, and it needs your Paystack dashboard rather than my editor:

**Recurring billing.** Paystack plans and reusable authorizations instead of
manual 30-day re-purchase. This needs plan codes created in your Paystack
dashboard first — I cannot generate those. Once you have them, the change is
small: `initializeTransaction` takes a `plan` code, and the webhook handles
`subscription.create` and `invoice.payment_failed` alongside `charge.success`.

Worth pairing with a **₦2,500/week tier**. Side hustlers here budget weekly
because income arrives weekly; ₦10,000 upfront is a decision, ₦2,500 is a
reflex.

**Operator still needs its differentiator.** The execution loop is the obvious
candidate — cap Builder at a number of runs per day and make unlimited
execution the Operator line. That is a real difference, unlike the four bullets
that were there before.

## Verification status

Syntax-checked with `tsc` across all 33 modified and new files — clean, no
undefined identifiers, no unused locals (`noUnusedLocals` is on and will fail
your build otherwise). The classifier and stage logic were transpiled and
executed: 12/12 assertions pass, including the previously-wrong
`design_creative` case. All 24 playbook titles verified against content keys —
no missing entries, no orphans.

Full `npm ci && npm run build` was not possible in my sandbox (no network), so
run it locally before deploying.
