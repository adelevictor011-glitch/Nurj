# Nurj v2 — Future-facing Vercel build

Nurj is an AI business command centre for Nigerian side hustlers and founder-led small businesses. This repository rebuilds the original single-file prototype as a typed, testable and deployable product.

## What changed

### Product experience

- A redesigned landing experience with a live product preview.
- A five-question “signal scan” that assigns one of four business stages.
- A responsive command centre with momentum, current constraint, weekly actions and recent intelligence.
- A three-step Prompt Studio for outcome, context and generated execution prompt.
- A Prompt Enhancer with diagnosis and visible improvements.
- Stage-specific playbooks, prompt history, profile settings and pricing.
- Desktop sidebar, mobile bottom navigation and an installable web-app manifest.
- Guest exploration that remains useful even before Supabase is configured.

### Production architecture

- **Frontend:** React 19, TypeScript, Vite, Framer Motion and Lucide icons.
- **Hosting and API:** Vercel static hosting plus TypeScript Vercel Functions in `/api`.
- **Authentication and data:** Supabase Auth, Postgres and Row Level Security.
- **AI:** OpenAI Responses API with strict structured outputs.
- **Payments:** Paystack server initialization, verification and signed webhook handling.
- **Quality:** strict TypeScript, Vitest business tests, an application-flow test and GitHub Actions CI.

## Repository map

```text
api/
  _lib/                 server-only auth, AI, payment and quota helpers
  generate.ts           prompt architecture endpoint
  enhance.ts            prompt improvement endpoint
  status.ts             profile, usage and history endpoint
  payments/             initialize, verify and webhook endpoints
src/
  App.tsx                complete product experience
  data.ts                stages, quiz, goals and playbooks
  lib/                   Supabase client, API client and business logic
  styles.css             full responsive future-facing design system
supabase/migrations/
  001_initial.sql        schema, RLS, quota and payment activation functions
```

## 1. Local preview without external services

The app contains a safe guest mode and deterministic local prompt architecture, so the interface can be reviewed immediately.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and choose **Run my signal scan**.

Google sign-in, persistent server history, real OpenAI generation and Paystack checkout require the environment setup below.

## 2. Create Supabase

1. Create a new Supabase project.
2. Open **SQL Editor** and run `supabase/migrations/001_initial.sql`.
3. Open **Authentication → Providers → Google** and enable Google.
4. In Google Cloud, use the callback shown by Supabase. It normally follows this form:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

5. In **Authentication → URL Configuration**:
   - Set the production Site URL to the final Vercel domain.
   - Add `http://localhost:3000` for local Vercel development.
   - Add the Vercel production domain and any preview URL patterns you intend to use.
6. Copy the Supabase project URL, browser publishable key and server service-role key.

Never expose the service-role key in a `VITE_` variable.

## 3. Configure the environment

Copy the example file:

```bash
cp .env.example .env.local
```

Fill these values:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL=gpt-5-mini
PAYSTACK_SECRET_KEY
APP_URL=http://localhost:3000
```

`VITE_` variables are browser-safe and embedded at build time. Every other variable is server-only.

## 4. Run the complete local stack

Vite alone does not execute the `/api` Vercel Functions. Use the Vercel development runtime for end-to-end testing:

```bash
npx vercel dev
```

The default local address is usually `http://localhost:3000`.

You may still use `npm run dev` when working only on the interface.

## 5. Configure OpenAI

- Create a project-scoped API key.
- Add it as `OPENAI_API_KEY` in Vercel.
- Keep the model configurable with `OPENAI_MODEL`.
- Set usage budgets and alerts before public launch.

The server uses the Responses API and strict JSON schemas so the interface receives predictable fields instead of parsing arbitrary prose.

## 6. Configure Paystack

Start with test mode.

The included prices are:

- **Builder:** ₦10,000 for 30 days.
- **Operator:** ₦25,000 for 30 days.

Set the Paystack webhook URL to:

```text
https://YOUR_DOMAIN/api/payments/webhook
```

The integration:

- initializes checkout on the server;
- stores a unique payment reference;
- verifies status, currency and exact amount;
- validates the webhook SHA-512 signature;
- verifies the transaction again with Paystack;
- activates access idempotently for 30 days.

This is time-limited access, not an automatically renewing subscription.

## 7. Deploy to Vercel

1. Create a private GitHub repository and push this project.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Vercel should detect Vite automatically. The repository also includes `vercel.json`.
4. Add every variable from `.env.example` under **Project Settings → Environment Variables**.
5. Set production `APP_URL` to the final production domain.
6. Deploy.
7. Add the deployed domain to Supabase Auth URL configuration.
8. Add the deployed webhook URL in Paystack.
9. Redeploy after changing a `VITE_` variable because those values are embedded during the build.

## 8. Validation commands

```bash
npm run typecheck
npm test
npm run build
```

The included CI workflow runs all three commands on pushes and pull requests.

## Free-tier enforcement

Free access is enforced in Postgres, not with editable browser counters:

- 5 prompt generations per day.
- 3 enhancements per day.
- Paid users receive unlimited quota while `plan_expires_at` remains active.
- If OpenAI generation fails after quota consumption, the server refunds that quota atomically.

## Important launch work still owned by the business

The code is deployable, but production launch also requires decisions and content that code cannot invent responsibly:

- final Terms, Privacy, Refund and Support pages;
- official domain and support email;
- live Paystack account approval and keys;
- final OpenAI budget;
- analytics/error-monitoring consent choices;
- customer-support process and refund rules.

Use `DEPLOYMENT_CHECKLIST.md` for the complete go-live sequence and `SECURITY.md` for secret and database boundaries.
