import { randomInt, randomUUID } from 'node:crypto';
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
  business_addon: { amount: 500_000, label: 'Extra business' },
} as const;

type PaidPlan = keyof typeof PLANS;

// ---- bank transfer checkout ----
// Card checkout is not live yet, so customers pay by bank transfer. Each
// transfer gets a short token (NURJ-XXXXXX) that goes in the transfer
// narration and in the proof email. The payment inbox agent
// (api/cron/payment-inbox.ts) matches the bank's credit alert to the token
// and switches the plan on; anything unclear waits for an admin.

// No 0/O or 1/I, so the token survives being read aloud or retyped.
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRANSFER_WINDOW_MS = 72 * 3_600_000;

function newToken(): string {
  let token = '';
  for (let i = 0; i < 6; i++) token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return token;
}

function bankDetails() {
  const name = process.env.BANK_NAME?.trim();
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER?.replace(/\s+/g, '');
  const accountName = process.env.BANK_ACCOUNT_NAME?.trim();
  if (!name || !accountNumber || !accountName) {
    throw new ServerError('Bank transfer is not set up yet. Please try again later.');
  }
  return { name, account_number: accountNumber, account_name: accountName };
}

function proofEmail(): string {
  return (process.env.PAYMENT_PROOF_EMAIL || 'support@nurjai.com').trim();
}

interface TransferRow {
  reference: string; plan: string; amount: number; status: string; transfer_token: string;
  transfer_expires_at: string; proof_received_at: string | null; created_at: string;
}

function present(row: TransferRow) {
  const plan = row.plan as PaidPlan;
  return {
    reference: row.reference,
    plan,
    plan_label: PLANS[plan]?.label ?? plan,
    amount_kobo: row.amount,
    token: `NURJ-${row.transfer_token}`,
    status: row.status,
    proof_received: Boolean(row.proof_received_at),
    expires_at: row.transfer_expires_at,
    bank: bankDetails(),
    proof_email: proofEmail(),
  };
}

const COLUMNS = 'reference, plan, amount, status, transfer_token, transfer_expires_at, proof_received_at, created_at';

async function addonAllowed(supabase: SupabaseClient, userId: string) {
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from('profiles').select('plan, plan_expires_at').eq('id', userId).single(),
    supabase.from('business_addons').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('expires_at', new Date().toISOString()),
  ]);
  const paid = profile && profile.plan !== 'free' && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  if (!paid) throw new Error('Extra business slots are for Builder and Operator members.');
  if ((count ?? 0) >= 2) throw new Error('You already have the maximum of 2 extra business slots.');
}

/** Start (or resume) a bank transfer for a plan. */
export async function POST(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readJson<{ plan?: unknown }>(request);
    if (body.plan !== 'builder' && body.plan !== 'operator' && body.plan !== 'business_addon') throw new Error('Choose a valid plan.');
    const plan = body.plan as PaidPlan;
    bankDetails(); // fail early, before creating anything, if the account isn't configured
    if (plan === 'business_addon') await addonAllowed(supabase, user.id);

    // Tapping "Upgrade" twice must not create two tokens for one transfer.
    const { data: existing } = await supabase.from('payments').select(COLUMNS)
      .eq('user_id', user.id).eq('plan', plan).eq('method', 'transfer')
      .in('status', ['awaiting_transfer', 'proof_received'])
      .gt('transfer_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) return json(present(existing as TransferRow));

    // At most 5 open transfers per person, so the token space can't be farmed.
    const { count: open } = await supabase.from('payments').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('method', 'transfer').in('status', ['awaiting_transfer', 'proof_received'])
      .gt('transfer_expires_at', new Date().toISOString());
    if ((open ?? 0) >= 5) throw new Error('You have several unfinished transfers. Complete one, or email support for help.');

    for (let attempt = 0; attempt < 5; attempt++) {
      const row = {
        user_id: user.id,
        reference: `nurj-${plan}-tr-${randomUUID().replaceAll('-', '')}`,
        plan,
        amount: PLANS[plan].amount,
        currency: 'NGN',
        status: 'awaiting_transfer',
        method: 'transfer',
        transfer_token: newToken(),
        transfer_expires_at: new Date(Date.now() + TRANSFER_WINDOW_MS).toISOString(),
      };
      const { data, error } = await supabase.from('payments').insert(row).select(COLUMNS).single();
      if (!error && data) return json(present(data as TransferRow));
      if (error?.code !== '23505') throw new ServerError('The transfer could not be started.');
      // 23505: token collision (1 in ~1 billion). Try a fresh one.
    }
    throw new ServerError('The transfer could not be started.');
  } catch (error) {
    return fail(safeMessage(error), statusFor(error, error instanceof AuthError ? 401 : 400));
  }
}

/** Status of one of your transfers, polled by the waiting screen. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const reference = new URL(request.url).searchParams.get('reference')?.trim();
    if (!reference || reference.length > 160) throw new Error('A valid transfer reference is required.');
    const { data } = await supabase.from('payments').select(`user_id, ${COLUMNS}`).eq('reference', reference).eq('method', 'transfer').maybeSingle();
    if (!data || data.user_id !== user.id) throw new Error('This transfer does not belong to your account.');
    const row = data as TransferRow & { user_id: string };
    let expiresAt: string | null = null;
    if (row.status === 'success') {
      if (row.plan === 'business_addon') {
        const { data: addon } = await supabase.from('business_addons').select('expires_at').eq('payment_reference', reference).maybeSingle();
        expiresAt = addon?.expires_at ?? null;
      } else {
        const { data: profile } = await supabase.from('profiles').select('plan_expires_at').eq('id', user.id).single();
        expiresAt = profile?.plan_expires_at ?? null;
      }
    }
    return json({ status: row.status, plan: row.plan, proof_received: Boolean(row.proof_received_at), plan_expires_at: expiresAt });
  } catch (error) {
    return fail(safeMessage(error), statusFor(error, error instanceof AuthError ? 401 : 400));
  }
}
