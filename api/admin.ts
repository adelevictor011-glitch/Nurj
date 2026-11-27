import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---- inlined helpers (Vercel does not ship shared _lib imports) ----

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new ServerError(`Nurj is not fully set up yet (${name}). Please try again later.`);
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
  get appUrl() { return (process.env.APP_URL || 'https://nurjai.com').replace(/\/$/, ''); },
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
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('The request body must be valid JSON.');
  }
}

// Server-side failures (database down, missing config, bugs). Their message,
// if any, is written for users; anything unexpected gets a generic one.
class ServerError extends Error {}

function isInternal(error: unknown): boolean {
  // Only a plain Error or one of this file's own classes carries a message
  // written for users. Everything else (TypeError, SyntaxError, AbortError,
  // library errors) is a bug or an outage and must not leak its text.
  if (!(error instanceof Error) || error instanceof ServerError) return true;
  if (Object.getPrototypeOf(error) === Error.prototype) return false;
  return ![AuthError, ForbiddenError].some((kind) => error instanceof kind);
}

function safeMessage(error: unknown): string {
  if (isInternal(error)) {
    console.error('[server] internal error', error);
    return error instanceof ServerError && error.message ? error.message : 'Something went wrong on our side. Please try again.';
  }
  return (error as Error).message;
}

function statusFor(error: unknown, status: number): number {
  return isInternal(error) ? 500 : status;
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

// ---- email: Brevo, or Resend if only it is set (same as expiry-reminders) ----
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

// ---- bank transfers (migration 013) ----
const PLAN_LABELS: Record<string, string> = { builder: 'Builder', operator: 'Operator', business_addon: 'Extra business slot' };
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

async function emailFor(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function pendingTransfers(supabase: SupabaseClient) {
  const { data } = await supabase.from('payments')
    .select('reference, user_id, plan, amount, status, transfer_token, transfer_expires_at, proof_received_at, created_at')
    .eq('method', 'transfer').in('status', ['awaiting_transfer', 'proof_received'])
    .gt('transfer_expires_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order('created_at', { ascending: false }).limit(40);
  const rows = data ?? [];
  const emails = await Promise.all(rows.map((row) => emailFor(supabase, row.user_id as string)));
  return rows.map((row, index) => ({
    reference: row.reference, plan: row.plan, amount_kobo: row.amount, status: row.status,
    token: `NURJ-${row.transfer_token}`, email: emails[index], created_at: row.created_at,
    expires_at: row.transfer_expires_at, proof_received_at: row.proof_received_at,
  }));
}

async function confirmTransfer(supabase: SupabaseClient, admin: string, reference: string, messageId: string) {
  const { data: payment } = await supabase.from('payments')
    .select('reference, user_id, plan, amount, status, method, transfer_token')
    .eq('reference', reference).maybeSingle();
  if (!payment || payment.method !== 'transfer') throw new Error('Transfer not found.');
  if (payment.status === 'success') throw new Error('This transfer is already confirmed.');
  if (payment.status !== 'awaiting_transfer' && payment.status !== 'proof_received') throw new Error(`This transfer is marked "${payment.status}".`);
  const { data, error } = await supabase.rpc('activate_verified_payment', { p_reference: reference, p_paid_at: new Date().toISOString() });
  if (error) throw new ServerError('The plan could not be activated.');
  await supabase.from('payments').update({ confirmed_by: admin }).eq('reference', reference);
  if (messageId) {
    await supabase.from('inbox_messages').update({ outcome: 'activated', payment_reference: reference, resolved_by: admin, resolved_at: new Date().toISOString() })
      .eq('message_id', messageId).eq('outcome', 'needs_review');
  }
  const result = data as { activated: boolean; needs_refund?: boolean; reason?: string; expires_at?: string };
  if (result.activated) {
    const to = await emailFor(supabase, payment.user_id as string);
    if (to) {
      const until = result.expires_at ? new Date(result.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      await sendEmail({
        to,
        subject: `Payment received: ${PLAN_LABELS[payment.plan as string] ?? 'Nurj'} is active`,
        text: `Hi,

We received your transfer of ${naira(payment.amount as number)} (reference NURJ-${payment.transfer_token}).

${PLAN_LABELS[payment.plan as string] ?? 'Your plan'} is now active${until ? ` until ${until}` : ''}. Open Nurj to keep building: ${env.appUrl}

Thank you,
Nurj`,
      });
    }
  }
  return result;
}

// ---- endpoint ----

// ---- admin console (roadmap feature 7) ----
// Admins are comp_accounts rows with note = 'admin'. Every read and write
// here runs on the server with the service role; the browser never gets
// direct access to these tables or functions.

class ForbiddenError extends Error {}

async function requireAdmin(request: Request) {
  const { user, supabase } = await requireUser(request);
  const email = (user.email ?? '').toLowerCase();
  const { data } = await supabase.from('comp_accounts').select('note').eq('email', email).maybeSingle();
  if (!email || data?.note !== 'admin') throw new ForbiddenError('Admins only.');
  return { user, supabase, email };
}

function errorStatus(error: unknown) {
  return error instanceof AuthError ? 401 : error instanceof ForbiddenError ? 403 : 400;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { supabase } = await requireAdmin(request);
    const [overview, wrap, grants, features, insights, growth, financials, transfers, reviews] = await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.rpc('admin_wrap', { p_weeks: 8 }),
      supabase.from('admin_grants').select('target_email, plan, days, granted_by, note, created_at').order('created_at', { ascending: false }).limit(10),
      supabase.rpc('admin_feature_usage'),
      supabase.rpc('admin_insight_progress', { p_min: 30 }),
      supabase.rpc('admin_growth'),
      supabase.rpc('admin_financials', { p_days: 30 }),
      pendingTransfers(supabase).catch(() => null),
      supabase.from('inbox_messages').select('message_id, kind, from_address, subject, received_at, token, amount_kobo, authenticated, detail, payment_reference')
        .eq('outcome', 'needs_review').order('created_at', { ascending: false }).limit(30),
    ]);
    if (overview.error || wrap.error) {
      throw new ServerError('Admin data could not be loaded. Check that migrations 006 to 008 have been run.');
    }
    return json({ overview: overview.data, wrap: wrap.data ?? [], grants: grants.data ?? [], features: features.error ? null : features.data, insights: insights.error ? null : insights.data, growth: growth.error ? null : growth.data,
      financials: financials.error ? null : { ...(financials.data as object), ai_cost_ngn_per_million: Number(process.env.AI_COST_NGN_PER_MILLION_TOKENS) || null },
      transfers, transfer_reviews: reviews.error ? null : reviews.data });
  } catch (error) {
    return fail(safeMessage(error), statusFor(error, errorStatus(error)));
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { supabase, email } = await requireAdmin(request);
    const body = await readJson<{ action?: unknown; email?: unknown; plan?: unknown; days?: unknown; note?: unknown; reference?: unknown; message_id?: unknown }>(request);

    if (body.action === 'confirm_transfer') {
      const reference = assertText(body.reference, 'Reference', 160);
      const messageId = assertText(body.message_id, 'Message', 300, false);
      return json(await confirmTransfer(supabase, email, reference, messageId));
    }
    if (body.action === 'reject_transfer') {
      const reference = assertText(body.reference, 'Reference', 160);
      const note = assertText(body.note, 'Note', 200, false);
      const { data, error } = await supabase.from('payments').update({ status: 'rejected', review_note: note || `Rejected by ${email}`, confirmed_by: email })
        .eq('reference', reference).eq('method', 'transfer').in('status', ['awaiting_transfer', 'proof_received']).select('reference');
      if (error) throw new ServerError('The transfer could not be updated.');
      if (!data?.length) throw new Error('That transfer is not open any more.');
      return json({ rejected: true });
    }
    if (body.action === 'dismiss_message') {
      const messageId = assertText(body.message_id, 'Message', 300);
      const { error } = await supabase.from('inbox_messages').update({ outcome: 'dismissed', resolved_by: email, resolved_at: new Date().toISOString() })
        .eq('message_id', messageId).eq('outcome', 'needs_review');
      if (error) throw new ServerError('The message could not be updated.');
      return json({ dismissed: true });
    }

    const target = assertText(body.email, 'Email', 254);
    const plan = assertText(body.plan, 'Plan', 20);
    const note = assertText(body.note, 'Note', 200, false);
    const days = Number(body.days);
    if (!Number.isInteger(days)) throw new Error('Days must be a whole number.');

    const { data, error } = await supabase.rpc('admin_grant_plan', {
      p_email: target,
      p_plan: plan,
      p_days: days,
      p_granted_by: email,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    return json(data);
  } catch (error) {
    return fail(safeMessage(error), statusFor(error, errorStatus(error)));
  }
}
