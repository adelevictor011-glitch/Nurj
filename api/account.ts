import { createHash, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---- inlined helpers (Vercel does not ship shared _lib imports) ----

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

const env = {
  get supabaseUrl() { return required('SUPABASE_URL'); },
  get supabaseServiceRoleKey() { return required('SUPABASE_SERVICE_ROLE_KEY'); },
  get openaiApiKey() { return required('OPENAI_API_KEY'); },
  // Groq is OpenAI-compatible. Set OPENAI_BASE_URL to Groq's endpoint and
  // OPENAI_API_KEY to a gsk_... key. Leave both unset to use real OpenAI.
  get openaiBaseUrl() { return process.env.OPENAI_BASE_URL || undefined; },
  get openaiModel() { return process.env.OPENAI_MODEL || 'openai/gpt-oss-120b'; },
  get paystackSecretKey() { return required('PAYSTACK_SECRET_KEY'); },
  get appUrl() { return (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''); },
  // Salt for hashing guest IP addresses. Never store a raw IP.
  get guestIpSalt() { return required('GUEST_IP_SALT'); },
};

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new Error('Expected application/json.');
  return (await request.json()) as T;
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected server error.';
}

function assertText(value: unknown, label: string, maxLength: number, required = true): string {
  if (typeof value !== 'string') {
    if (!required && value == null) return '';
    throw new Error(`${label} must be text.`);
  }
  const text = value.trim();
  if (required && !text) throw new Error(`${label} is required.`);
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return text;
}

function adminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw new AuthError('Sign in is required.');

  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AuthError('Your session is invalid or expired.');
  return { user: data.user, supabase };
}

class AuthError extends Error {}

// ---- endpoint ----

// ---- account: consent, data export, deletion, self-serve refund ----
// Roadmap feature 20. One function handles all four so the project stays
// inside Vercel Hobby's 12-function limit.

const REFUND_WINDOW_DAYS = 7;
const PLAN_DAYS = 30;

interface PaymentRow {
  reference: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  verified_at: string | null;
  created_at: string;
}

function emailHash(email: string | undefined): string | null {
  if (!email) return null;
  return createHash('sha256').update(`${process.env.GUEST_IP_SALT ?? ''}:${email.trim().toLowerCase()}`).digest('hex');
}

async function refundEligibility(supabase: SupabaseClient, userId: string, email: string | undefined) {
  const hash = emailHash(email);
  const since = new Date(Date.now() - REFUND_WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: payments }, { count }, { count: hashCount }] = await Promise.all([
    supabase
      .from('payments')
      .select('reference, plan, amount, currency, status, paid_at, verified_at, created_at')
      .eq('user_id', userId)
      .eq('status', 'success')
      .gt('paid_at', since)
      .order('paid_at', { ascending: false })
      .limit(10),
    supabase.from('refund_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    hash
      ? supabase.from('refund_requests').select('id', { count: 'exact', head: true }).eq('email_hash', hash)
      : Promise.resolve({ count: 0 }),
  ]);

  // The guarantee covers plans first: if a plan and an add-on were both
  // bought this week, the once-per-person refund goes to the plan.
  const recent = (payments ?? []) as PaymentRow[];
  const payment = recent.find((item) => item.plan !== 'business_addon') ?? recent[0] ?? null;

  const row = payment as PaymentRow | null;
  if (!row) return { eligible: false as const, reason: 'No paid plan to refund.' };
  if ((count ?? 0) > 0 || (hashCount ?? 0) > 0) return { eligible: false as const, reason: 'This account has already used its self-serve refund.' };

  const paidAt = new Date(row.paid_at ?? row.verified_at ?? row.created_at);
  const deadline = new Date(paidAt.getTime() + REFUND_WINDOW_DAYS * 86_400_000);
  if (deadline <= new Date()) return { eligible: false as const, reason: 'The 7-day refund window for your last payment has closed.' };

  return { eligible: true as const, payment: row, deadline: deadline.toISOString() };
}

async function paystackRefund(reference: string): Promise<{ ok: boolean; message: string }> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return { ok: false, message: 'Paystack is not configured.' };
  try {
    const response = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: reference }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as { status?: boolean; message?: string };
    return { ok: response.ok && Boolean(payload.status), message: payload.message ?? `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

// ---- email: Brevo (free plan: 300 a day), or Resend if only it is set ----
function parseSender(value: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  return match ? { ...(match[1] ? { name: match[1] } : {}), email: match[2].trim() } : { email: value.trim() };
}

function emailConfigured(): boolean {
  return Boolean((process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) && process.env.REMINDER_FROM_EMAIL);
}

async function sendEmail(message: { to: string; subject: string; text: string; headers?: Record<string, string> }): Promise<boolean> {
  const from = process.env.REMINDER_FROM_EMAIL;
  const brevoKey = process.env.BREVO_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!from || (!brevoKey && !resendKey)) return false;
  // Replies go to a real inbox (e.g. support@nurjai.com), not the sending address.
  const replyTo = process.env.EMAIL_REPLY_TO ? parseSender(process.env.EMAIL_REPLY_TO) : null;
  try {
    const response = brevoKey
      ? await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            sender: parseSender(from),
            to: [{ email: message.to }],
            subject: message.subject,
            textContent: message.text,
            ...(replyTo ? { replyTo } : {}),
            ...(message.headers ? { headers: message.headers } : {}),
          }),
        })
      : await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text, ...(replyTo ? { reply_to: replyTo.email } : {}), ...(message.headers ? { headers: message.headers } : {}) }),
        });
    if (!response.ok) console.error('[email] send failed', response.status, await response.text().catch(() => ''));
    return response.ok;
  } catch (error) {
    console.error('[email] send failed', error instanceof Error ? error.message : error);
    return false;
  }
}

async function notifyAdmin(subject: string, text: string) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  console.warn('[account]', subject, text);
  if (to) await sendEmail({ to, subject, text });
}

// One-click unsubscribe for the Monday digest (feature 6). The token is an
// HMAC of the user id, so links cannot be forged for other accounts.
function digestToken(userId: string): string {
  return createHmac('sha256', `digest:${process.env.GUEST_IP_SALT ?? ''}`).update(userId).digest('hex').slice(0, 32);
}

async function unsubscribe(token: string): Promise<Response> {
  const [userId, signature] = token.split('.');
  const page = (message: string, status = 200) =>
    new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nurj</title><body style="font-family:system-ui;background:#080907;color:#f5f6ef;display:grid;place-items:center;min-height:90vh;padding:16px"><div style="max-width:420px"><h1 style="font-size:20px">${message}</h1><p style="color:#9da294">You can switch the Monday digest back on in Nurj, under Settings.</p><a style="color:#edb84c" href="/">Open Nurj</a></div>`, {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  if (!userId || !signature || signature !== digestToken(userId)) return page('That unsubscribe link is not valid.', 400);
  const { error } = await adminClient().from('profiles').update({ digest_opt_out: true }).eq('id', userId);
  if (error) return page('Something went wrong. Please try again.', 500);
  return page('You will no longer get the Monday digest.');
}

export async function GET(request: Request): Promise<Response> {
  try {
    const token = new URL(request.url).searchParams.get('unsubscribe');
    if (token) return await unsubscribe(token);
    const { user, supabase } = await requireUser(request);
    const refund = await refundEligibility(supabase, user.id, user.email);
    return json({
      refund: refund.eligible
        ? { eligible: true, amount: refund.payment.amount, plan: refund.payment.plan, deadline: refund.deadline }
        : { eligible: false, reason: refund.reason },
    });
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 500);
  }
}

interface AccountBody {
  action?: unknown;
  version?: unknown;
  confirm?: unknown;
  reason?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Mail apps send one-click unsubscribes as a POST (RFC 8058).
    const token = new URL(request.url).searchParams.get('unsubscribe');
    if (token) return await unsubscribe(token);

    const { user, supabase } = await requireUser(request);
    const body = await readJson<AccountBody>(request);
    const action = assertText(body.action, 'Action', 20);

    if (action === 'consent') {
      const version = assertText(body.version, 'Version', 20);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) throw new Error('Invalid terms version.');
      const acceptedAt = new Date().toISOString();
      const { error } = await supabase
        .from('profiles')
        .update({ terms_version: version, terms_accepted_at: acceptedAt, updated_at: acceptedAt })
        .eq('id', user.id);
      if (error) throw new Error('Your agreement could not be saved. Please try again.');
      return json({ terms_version: version, terms_accepted_at: acceptedAt });
    }

    if (action === 'export') {
      const tables = ['prompt_history', 'prompt_runs', 'outcomes', 'saved_snippets', 'action_progress', 'payments', 'refund_requests'] as const;
      const [profile, ...rows] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        ...tables.map((table) => supabase.from(table).select('*').eq('user_id', user.id)),
      ]);
      const data: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email, created_at: user.created_at },
        profile: profile.data,
      };
      tables.forEach((table, index) => {
        data[table] = rows[index].data ?? [];
      });
      return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="nurj-data-${new Date().toISOString().slice(0, 10)}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (action === 'delete') {
      if (body.confirm !== 'DELETE') throw new Error('Type DELETE to confirm.');
      // Keep payment records for tax, stripped of anything that identifies the person.
      const { data: payments } = await supabase
        .from('payments')
        .select('reference, plan, amount, currency, status, paid_at, created_at')
        .eq('user_id', user.id);
      if (payments?.length) {
        const { error: archiveError } = await supabase
          .from('payment_archive')
          .upsert(payments, { onConflict: 'reference', ignoreDuplicates: true });
        if (archiveError) throw new Error('Your account could not be deleted. Please try again.');
      }
      // Strip the two places personal text outlives the account. Everything
      // else cascades from auth.users, or keeps anonymised rows (model_usage,
      // refund_requests: user_id set to null; the email hash only blocks a
      // second self-serve refund).
      await supabase.from('refund_requests').update({ reason: null }).eq('user_id', user.id);
      await supabase.from('admin_grants').update({ target_email: 'deleted account' }).eq('target_user', user.id);
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw new Error('Your account could not be deleted. Please try again.');
      return json({ deleted: true });
    }

    if (action === 'refund') {
      const reason = assertText(body.reason, 'Reason', 500, false);
      const eligibility = await refundEligibility(supabase, user.id, user.email);
      if (!eligibility.eligible) throw new Error(eligibility.reason);
      const payment = eligibility.payment;

      const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at').eq('id', user.id).single();

      // Claim the refund first: the unique reference stops a double click
      // from refunding twice. The previous plan is kept for admin reversal.
      const { data: claim, error: claimError } = await supabase
        .from('refund_requests')
        .insert({
          user_id: user.id,
          email_hash: emailHash(user.email),
          payment_reference: payment.reference,
          amount: payment.amount,
          status: 'pending',
          reason: reason || null,
          previous_plan: profile?.plan ?? null,
          previous_expires_at: profile?.plan_expires_at ?? null,
        })
        .select('id')
        .single();
      if (claimError || !claim) throw new Error('A refund is already being processed for this payment.');

      if (payment.plan === 'business_addon') {
        // An add-on refund removes that business slot; the plan is untouched.
        const { error: slotError } = await supabase.from('business_addons').delete().eq('payment_reference', payment.reference);
        if (slotError) {
          await supabase.from('refund_requests').delete().eq('id', claim.id);
          throw new Error('Your refund could not be started. Please try again.');
        }
        await supabase.rpc('ensure_active_business_unlocked', { p_user: user.id });
      }

      // Remove the 30 days this payment added BEFORE money moves, so a
      // timeout or a manual refund can never leave paid time behind. If an
      // earlier payment still has time left, fall back to that payment's plan
      // (refunding an upgrade must not keep the higher plan).
      const isAddon = payment.plan === 'business_addon';
      const expires = profile?.plan_expires_at ? new Date(profile.plan_expires_at).getTime() - PLAN_DAYS * 86_400_000 : 0;
      const stillPaid = expires > Date.now();
      let fallbackPlan: string = 'free';
      if (stillPaid) {
        const { data: previous } = await supabase
          .from('payments')
          .select('plan')
          .eq('user_id', user.id)
          .eq('status', 'success')
          .neq('reference', payment.reference)
          .in('plan', ['builder', 'operator'])
          .order('paid_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        fallbackPlan = previous?.plan ?? profile?.plan ?? 'free';
      }
      const { error: planError } = isAddon
        ? { error: null }
        : await supabase
            .from('profiles')
            .update({
              plan: stillPaid ? fallbackPlan : 'free',
              plan_expires_at: stillPaid ? new Date(expires).toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);
      if (planError) {
        await supabase.from('refund_requests').delete().eq('id', claim.id);
        throw new Error('Your refund could not be started. Please try again.');
      }
      if (!isAddon) await supabase.rpc('ensure_active_business_unlocked', { p_user: user.id });

      const result = await paystackRefund(payment.reference);
      await supabase
        .from('refund_requests')
        .update({ status: result.ok ? 'refunded' : 'pending', paystack_message: result.message })
        .eq('id', claim.id);

      const amount = `₦${(payment.amount / 100).toLocaleString('en-NG')}`;
      if (!result.ok) {
        await notifyAdmin('Nurj refund needs manual action', `User ${user.email ?? user.id} requested a refund for ${payment.reference} (${amount}). Their plan time has already been removed. Paystack said: ${result.message}`);
        return json({ status: 'pending', message: 'Your refund request is recorded. We will complete it within 2 working days.' });
      }

      await notifyAdmin('Nurj refund issued', `Refunded ${payment.reference} (${amount}) for ${user.email ?? user.id}. Reason: ${reason || 'none given'}`);
      return json({ status: 'refunded', message: 'Refund issued. Banks usually take 5 to 10 working days to show it.' });
    }

    throw new Error('Unknown action.');
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 400);
  }
}
