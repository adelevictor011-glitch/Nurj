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

// ---- endpoint ----

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const today = new Date().toISOString().slice(0, 10);

    const [profileResult, usageResult, historyResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('daily_usage').select('prompt_count, enhance_count').eq('user_id', user.id).eq('usage_date', today).maybeSingle(),
      supabase.from('prompt_history').select('id, kind, title, goal, output, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    ]);

    // Self-heal: if the on_auth_user_created trigger never fired, create the
    // row now instead of permanently bricking the account.
    let profile = profileResult.data;
    if (profileResult.error || !profile) {
      const fallbackName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split('@')[0] ??
        'Builder';
      const { data: healed, error: healError } = await supabase.rpc('ensure_profile', {
        p_user_id: user.id,
        p_display_name: fallbackName,
      });
      if (healError || !healed) throw new Error('Your profile could not be loaded.');
      profile = healed;
    }
    const expired = profile.plan !== 'free' && (!profile.plan_expires_at || new Date(profile.plan_expires_at) <= new Date());
    if (expired) {
      const { data: downgraded } = await supabase
        .from('profiles')
        .update({ plan: 'free', plan_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('*')
        .single();
      if (downgraded) profile = downgraded;
    }
    const paid = profile.plan !== 'free' && Boolean(profile.plan_expires_at) && new Date(profile.plan_expires_at) > new Date();
    const promptUsed = usageResult.data?.prompt_count ?? 0;
    const enhanceUsed = usageResult.data?.enhance_count ?? 0;

    return json({
      profile,
      usage: {
        prompt: { used: promptUsed, limit: paid ? null : 5, remaining: paid ? null : Math.max(0, 5 - promptUsed) },
        enhance: { used: enhanceUsed, limit: paid ? null : 3, remaining: paid ? null : Math.max(0, 3 - enhanceUsed) },
      },
      history: historyResult.data ?? [],
    });
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 500);
  }
}
