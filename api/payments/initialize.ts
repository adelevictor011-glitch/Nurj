import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

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
  get openaiModel() { return process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile'; },
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

const PLANS = {
  builder: { amount: 1_000_000, label: 'Builder' },
  operator: { amount: 2_500_000, label: 'Operator' },
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

// ---- endpoint ----

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readJson<{ plan?: unknown }>(request);
    if (body.plan !== 'builder' && body.plan !== 'operator') throw new Error('Choose a valid plan.');
    const plan = body.plan as PaidPlan;
    const planConfig = PLANS[plan];
    if (!user.email) throw new Error('Your account needs an email address before checkout.');

    const reference = `nurj-${plan}-${randomUUID().replaceAll('-', '')}`;
    const { error } = await supabase.from('payments').insert({
      user_id: user.id,
      reference,
      plan,
      amount: planConfig.amount,
      currency: 'NGN',
      status: 'initialized',
    });
    if (error) throw new Error('The payment record could not be created.');

    const transaction = await initializeTransaction({
      email: user.email,
      amount: String(planConfig.amount),
      currency: 'NGN',
      reference,
      callback_url: `${env.appUrl}/?reference=${encodeURIComponent(reference)}`,
      metadata: JSON.stringify({ user_id: user.id, plan, product: 'nurj_access_30_days' }),
    });

    return json({ authorization_url: transaction.authorization_url, reference: transaction.reference });
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 400);
  }
}
