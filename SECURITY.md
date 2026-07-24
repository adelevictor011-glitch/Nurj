# Security notes

## Secret boundaries

The following variables are server-only and must never use the `VITE_` prefix:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `PAYSTACK_SECRET_KEY`

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are intentionally available to the browser.

## Database controls

- Supabase Row Level Security is enabled on every user-data table.
- Browser clients cannot write `profiles.plan` or `profiles.plan_expires_at`.
- Prompt quota consumption is atomic and executable only by the service role.
- Prompt history and payment writes occur only through server functions.
- Payment activation is idempotent and requires a server-verified Paystack transaction.

## Payment controls

- Transactions are initialized from the server.
- Verification checks status, currency and exact amount.
- Webhooks require the Paystack SHA-512 signature and are verified again with the transaction API.
- The included plans grant 30 days of access; they are not described as automatic subscriptions.

## Before a public launch

1. Add final Terms, Privacy, Refund and Support pages.
2. Use Paystack test keys until every failure and cancellation path has been tested.
3. Set OpenAI project budgets and alerts.
4. Enable Supabase database backups appropriate to the business.
5. Rotate any credential ever pasted into browser code, chat, a public repository or a screenshot.
6. Add application error monitoring and redact prompts or personal data from logs.
