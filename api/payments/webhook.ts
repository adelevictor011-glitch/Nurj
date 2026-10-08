import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

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
  return ![AuthError].some((kind) => error instanceof kind);
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

const PLANS = {
  builder: { amount: 1_000_000, label: 'Builder' },
  operator: { amount: 2_500_000, label: 'Operator' },
  // Option A add-on: one extra business slot for 30 days (paid plans only).
  business_addon: { amount: 500_000, label: 'Extra business' },
} as const;

type PaidPlan = keyof typeof PLANS;

async function paystack<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.paystackSecretKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json()) as { status: boolean; message: string; data: T };
  if (!response.ok || !payload.status) throw new Error(payload.message || 'Paystack request failed.');
  return payload.data;
}

function initializeTransaction(body: Record<string, unknown>) {
  return paystack<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function verifyTransaction(reference: string) {
  return paystack<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    customer: { email: string };
    metadata?: Record<string, unknown>;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac('sha512', env.paystackSecretKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function activatePayment(supabase: SupabaseClient, reference: string, transaction: {
  status: string;
  amount: number;
  currency: string;
  paid_at: string | null;
}) {
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('user_id, plan, amount, currency, status')
    .eq('reference', reference)
    .maybeSingle();

  if (paymentError || !payment) throw new Error('Payment record was not found.');
  const plan = payment.plan as PaidPlan;
  const expected = PLANS[plan];
  if (!expected || transaction.status !== 'success' || transaction.amount !== expected.amount || transaction.amount !== payment.amount || transaction.currency !== 'NGN') {
    throw new Error('The verified transaction does not match the selected Nurj plan.');
  }

  const { data, error } = await supabase.rpc('activate_verified_payment', {
    p_reference: reference,
    p_paid_at: transaction.paid_at,
  });
  if (error) throw new ServerError('The plan could not be activated.');
  return data as { activated: boolean; plan: PaidPlan; expires_at?: string; needs_refund?: boolean; reason?: string };
}

// ---- endpoint ----

interface PaystackEvent {
  event?: string;
  data?: { reference?: string };
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

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    if (!verifyWebhookSignature(rawBody, request.headers.get('x-paystack-signature'))) {
      return fail('Invalid webhook signature.', 401);
    }

    const event = JSON.parse(rawBody) as PaystackEvent;
    if (event.event !== 'charge.success' || !event.data?.reference) return json({ received: true });

    const supabase = adminClient();
    const transaction = await verifyTransaction(event.data.reference);
    const activation = await activatePayment(supabase, event.data.reference, transaction);
    if (activation.needs_refund) {
      // Money was taken for a business slot that could not be granted (plan
      // lapsed or already at 2 slots). Tell the admin to refund it.
      const to = process.env.ADMIN_ALERT_EMAIL;
      console.warn('[webhook] payment needs refund', event.data.reference);
      if (to) await sendEmail({ to, subject: 'Nurj payment needs a refund', text: `Payment ${event.data.reference} was taken for a business slot that could not be added. Refund it in Paystack.` });
    }
    return json({ received: true });
  } catch (error) {
    return fail(safeMessage(error), statusFor(error, 400));
  }
}
