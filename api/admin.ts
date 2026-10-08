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
  if (!(error instanceof Error)) return true;
  if (error instanceof ServerError) return true;
  // Plain Error and the custom classes in this file carry user-facing messages.
  // Built-in errors (TypeError, SyntaxError, AbortError, ...) are bugs or outages.
  return error.constructor !== Error && Object.getPrototypeOf(error.constructor) !== Error;
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
    const [overview, wrap, grants, features, insights] = await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.rpc('admin_wrap', { p_weeks: 8 }),
      supabase.from('admin_grants').select('target_email, plan, days, granted_by, note, created_at').order('created_at', { ascending: false }).limit(10),
      supabase.rpc('admin_feature_usage'),
      supabase.rpc('admin_insight_progress', { p_min: 30 }),
    ]);
    if (overview.error || wrap.error) {
      throw new ServerError('Admin data could not be loaded. Check that migrations 006 to 008 have been run.');
    }
    return json({ overview: overview.data, wrap: wrap.data ?? [], grants: grants.data ?? [], features: features.error ? null : features.data, insights: insights.error ? null : insights.data });
  } catch (error) {
    return fail(safeMessage(error), statusFor(error, errorStatus(error)));
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { supabase, email } = await requireAdmin(request);
    const body = await readJson<{ email?: unknown; plan?: unknown; days?: unknown; note?: unknown }>(request);
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
