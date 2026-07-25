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
  get openaiModel() { return process.env.OPENAI_MODEL || 'gpt-5-mini'; },
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

/**
 * "Did this actually work?" — one question, and the only data in this product
 * that a competitor cannot clone in a weekend.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readJson<{ runId?: unknown; historyId?: unknown; worked?: unknown; note?: unknown }>(request);

    if (typeof body.worked !== 'boolean') throw new Error('A yes or no answer is required.');
    const runId = assertText(body.runId, 'Run reference', 60, false);
    const historyId = assertText(body.historyId, 'History reference', 60, false);
    const note = assertText(body.note, 'Note', 600, false);

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_category, stage')
      .eq('id', user.id)
      .maybeSingle();

    const { error } = await supabase.from('outcomes').upsert(
      {
        user_id: user.id,
        run_id: runId || null,
        history_id: historyId || null,
        worked: body.worked,
        note: note || null,
        business_category: profile?.business_category ?? null,
        stage: profile?.stage ?? null,
      },
      { onConflict: 'user_id,run_id' },
    );
    if (error) throw new Error('Your feedback could not be saved.');

    return json({ recorded: true });
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 400);
  }
}
