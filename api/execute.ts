import OpenAI from 'openai';
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

interface QuotaResult {
  allowed: boolean;
  plan: string;
  used: number;
  remaining: number | null;
  limit?: number;
}

async function consumeQuota(supabase: SupabaseClient, userId: string, kind: 'prompt' | 'enhance') {
  const { data, error } = await supabase.rpc('consume_daily_quota', {
    p_user_id: userId,
    p_kind: kind,
  });
  if (error) throw new Error('Usage could not be checked.');
  const result = data as QuotaResult;
  if (!result.allowed) {
    const label = kind === 'prompt' ? 'prompts' : 'enhancements';
    throw new QuotaError(`You have used today’s free ${label}. Upgrade to keep building.`);
  }
  return result;
}

async function refundQuota(supabase: SupabaseClient, userId: string, kind: 'prompt' | 'enhance') {
  await supabase.rpc('refund_daily_quota', { p_user_id: userId, p_kind: kind });
}

class QuotaError extends Error {}

/**
 * Fire-and-forget cost logging. Never allowed to fail a user-facing request.
 */
function logModelUsage(
  supabase: SupabaseClient,
  entry: {
    userId: string | null;
    kind: 'generate' | 'enhance' | 'guest_generate';
    usage: { model: string; inputTokens: number; outputTokens: number; totalTokens: number };
  },
) {
  void supabase
    .from('model_usage')
    .insert({
      user_id: entry.userId,
      kind: entry.kind,
      model: entry.usage.model,
      input_tokens: entry.usage.inputTokens,
      output_tokens: entry.usage.outputTokens,
      total_tokens: entry.usage.totalTokens,
    })
    .then(({ error }: { error: { message?: string } | null }) => {
      if (error) console.error('[telemetry] model_usage insert failed', error.message);
    });
}

// ---- endpoint ----

let client: OpenAI | null = null;

/**
 * Runs the architected prompt and returns the actual work product.
 *
 * This is the difference between a prompt formatter and an operating layer:
 * the outcome now happens inside Nurj, so we can ask whether it worked.
 */
export async function POST(request: Request): Promise<Response> {
  let quotaConsumed = false;
  let userId = '';
  let quotaClient: Awaited<ReturnType<typeof requireUser>>['supabase'] | null = null;

  try {
    const { user, supabase } = await requireUser(request);
    userId = user.id;
    quotaClient = supabase;

    const body = await readJson<{ prompt?: unknown; historyId?: unknown }>(request);
    const prompt = assertText(body.prompt, 'Prompt', 8000);
    const historyId = assertText(body.historyId, 'History reference', 60, false);

    const quota = await consumeQuota(supabase, user.id, 'prompt');
    quotaConsumed = quota.plan === 'free';

    client ??= new OpenAI({ apiKey: env.openaiApiKey, baseURL: env.openaiBaseUrl });
    const model = env.openaiModel;
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are executing a prompt written by a Nigerian founder inside their business tool. Produce the finished work product the prompt asks for — not advice about how to produce it, and not a restatement of the prompt. Be specific and commercially usable. Use naira, WhatsApp, Instagram and local market context only where it materially improves the output. State any assumption you had to make in one short line at the end.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const output = response.choices?.[0]?.message?.content?.trim();
    if (!output) throw new Error('The AI returned an empty response.');

    logModelUsage(supabase, {
      userId: user.id,
      kind: 'generate',
      usage: {
        model,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    });

    const { data: run } = await supabase
      .from('prompt_runs')
      .insert({
        user_id: user.id,
        history_id: historyId || null,
        prompt,
        output,
      })
      .select('id')
      .maybeSingle();

    return json({ output, remaining: quota.remaining, run_id: run?.id ?? null });
  } catch (error) {
    if (quotaConsumed && userId && quotaClient) await refundQuota(quotaClient, userId, 'prompt');
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : 400;
    return fail(safeMessage(error), status);
  }
}
