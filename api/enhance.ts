import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

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

let client: OpenAI | null = null;

function openai() {
  client ??= new OpenAI({ apiKey: env.openaiApiKey, baseURL: env.openaiBaseUrl });
  return client;
}

interface StructuredResult<T> {
  data: T;
  usage: { model: string; inputTokens: number; outputTokens: number; totalTokens: number };
}

async function createStructuredResponse<T>(params: {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
}): Promise<StructuredResult<T>> {
  const model = env.openaiModel;
  // Chat Completions + JSON mode: OpenAI-compatible and works on Groq.
  // The schema is described in the system message since Groq's JSON mode
  // guarantees valid JSON but not a specific schema.
  const response = await openai().chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          params.instructions +
          '\n\nRespond with a single valid JSON object and nothing else. It must match exactly this shape: ' +
          JSON.stringify(params.schema),
      },
      { role: 'user', content: params.input },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error('The AI returned an empty response.');

  return {
    data: JSON.parse(content) as T,
    usage: {
      model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

// ---- endpoint ----

interface EnhanceBody {
  prompt?: unknown;
  stage?: unknown;
  business?: unknown;
}

interface EnhancedPayload {
  title: string;
  enhanced_prompt: string;
  diagnosis: string;
  changes: string[];
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    enhanced_prompt: { type: 'string' },
    diagnosis: { type: 'string' },
    changes: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'enhanced_prompt', 'diagnosis', 'changes'],
};

export async function POST(request: Request): Promise<Response> {
  let quotaConsumed = false;
  let userId = '';
  let quotaClient: Awaited<ReturnType<typeof requireUser>>['supabase'] | null = null;

  try {
    const { user, supabase } = await requireUser(request);
    userId = user.id;
    quotaClient = supabase;
    const body = await readJson<EnhanceBody>(request);
    const originalPrompt = assertText(body.prompt, 'Prompt', 6000);
    const stage = assertText(body.stage, 'Stage', 30, false);
    const business = assertText(body.business, 'Business context', 800, false);

    const quota = await consumeQuota(supabase, user.id, 'enhance');
    quotaConsumed = quota.plan === 'free';

    const { data: result, usage } = await createStructuredResponse<EnhancedPayload>({
      name: 'nurj_prompt_enhancement',
      schema,
      instructions: `You are Nurj's prompt quality engine. Diagnose an existing prompt and rebuild it for clarity, context, control and commercial usefulness. Preserve the user's legitimate intent. Add missing role, context, output structure, constraints and success criteria. Do not insert invented facts. Do not imitate a living person's distinctive voice. Keep the enhanced prompt practical and ready to copy. Return four to six meaningful changes.`,
      input: `Original prompt:
${originalPrompt}

Business stage: ${stage || 'Not supplied'}
Saved business context: ${business || 'Not supplied'}

Return a concise title, the complete enhanced prompt, a diagnosis of the original weakness, and the meaningful changes made.`,
    });

    // The model call has already succeeded. Bookkeeping never takes the
    // result away from the user.
    logModelUsage(supabase, { userId: user.id, kind: 'enhance', usage });

    void supabase
      .from('prompt_history')
      .insert({
        user_id: user.id,
        kind: 'enhanced',
        title: result.title,
        goal: 'Enhance an existing prompt',
        input: { original_prompt: originalPrompt, stage, business },
        output: result,
      })
      .then(({ error }: { error: { message?: string } | null }) => {
        if (error) console.error('[enhance] history insert failed', error.message);
      });

    return json({ ...result, remaining: quota.remaining });
  } catch (error) {
    if (quotaConsumed && userId && quotaClient) await refundQuota(quotaClient, userId, 'enhance');
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : 400;
    return fail(safeMessage(error), status);
  }
}
