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
  get openaiModel() { return process.env.OPENAI_MODEL || 'openai/gpt-oss-120b'; },
  get openaiFallbackModel() { return process.env.OPENAI_MODEL_FALLBACK || 'openai/gpt-oss-20b'; },
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
  client ??= new OpenAI({ apiKey: env.openaiApiKey, baseURL: env.openaiBaseUrl, maxRetries: 1 });
  return client;
}

// ---- spend guardrails and model failover (roadmap feature 19) ----
// A daily AI budget in tokens, counted per Lagos day from model_usage:
//   below 80%   -> primary model, falling back to the cheaper one on an outage
//   80% to 100% -> cheaper model only
//   over 100%   -> free and guest calls pause until midnight WAT; paid calls
//                  continue on the cheaper model
// Reading the spend fails open: a telemetry hiccup must never block users.

class SpendPausedError extends Error {}
class UpstreamError extends Error {}

type SpendLevel = 'normal' | 'degrade' | 'paused';

interface ModelUsage { model: string; inputTokens: number; outputTokens: number; totalTokens: number }

function dailyTokenBudget(): number {
  const value = Number(process.env.AI_DAILY_TOKEN_BUDGET);
  return Number.isFinite(value) && value > 0 ? value : 2_000_000;
}

async function spendLevel(supabase: SupabaseClient): Promise<SpendLevel> {
  const { data, error } = await supabase.rpc('ai_tokens_today');
  if (error) {
    console.error('[spend] could not read today\'s spend', error.message);
    return 'normal';
  }
  const used = Number(data ?? 0);
  const budget = dailyTokenBudget();
  const level: SpendLevel = used >= budget ? 'paused' : used >= budget * 0.8 ? 'degrade' : 'normal';
  if (level !== 'normal') await alertOnce(supabase, level, used, budget);
  return level;
}

async function alertOnce(supabase: SupabaseClient, level: SpendLevel, used: number, budget: number) {
  try {
    const { data: claimed, error } = await supabase.rpc('claim_spend_alert', { p_level: level });
    if (error || !claimed) return;
    const percent = Math.round((used / budget) * 100);
    const message =
      `Nurj AI spend is at ${percent}% of today's budget ` +
      `(${used.toLocaleString('en-NG')} of ${budget.toLocaleString('en-NG')} tokens). ` +
      (level === 'paused'
        ? 'Free and guest AI calls are paused until midnight WAT. Paid users continue on the cheaper model.'
        : 'New AI calls now use the cheaper model.');
    console.warn('[spend]', message);
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.REMINDER_FROM_EMAIL;
    const to = process.env.ADMIN_ALERT_EMAIL;
    if (!resendKey || !from || !to) return;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: `Nurj AI spend at ${percent}% of today's budget`, text: message }),
    });
  } catch (error) {
    console.error('[spend] alert failed', safeMessage(error));
  }
}

function modelChain(level: SpendLevel): string[] {
  const chain = level === 'normal' ? [env.openaiModel, env.openaiFallbackModel] : [env.openaiFallbackModel];
  return chain.filter((model, index, all) => Boolean(model) && all.indexOf(model) === index);
}

function isRetryable(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string };
  const status = e?.status ?? 0;
  if (status === 404 || status === 408 || status === 429 || status >= 500) return true;
  if (e?.code === 'model_not_found') return true;
  const message = (e?.message ?? '').toLowerCase();
  return ['does not exist', 'model_not_found', 'decommissioned', 'timeout', 'timed out', 'fetch failed', 'empty response']
    .some((needle) => message.includes(needle));
}

async function callModel(params: { level: SpendLevel; system: string; user: string; json: boolean }): Promise<{ content: string; usage: ModelUsage }> {
  const models = modelChain(params.level);
  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    try {
      const response = await openai().chat.completions.create({
        model,
        ...(params.json ? { response_format: { type: 'json_object' as const } } : {}),
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      });
      const content = response.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('The AI returned an empty response.');
      return {
        content,
        usage: {
          model,
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      };
    } catch (error) {
      console.error(`[ai] model "${model}" failed`, safeMessage(error));
      if (index < models.length - 1 && isRetryable(error)) continue;
      break;
    }
  }
  throw new UpstreamError('Nurj could not reach the AI right now. Please try again in a moment.');
}

interface StructuredResult<T> {
  data: T;
  usage: ModelUsage;
}

function parseJsonObject<T>(content: string): T {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new UpstreamError('The AI returned an unreadable response. Please try again.');
  }
}

async function createStructuredResponse<T>(params: {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  level: SpendLevel;
}): Promise<StructuredResult<T>> {
  // Chat Completions + JSON mode works on OpenAI and Groq. The schema is
  // described in the system message because JSON mode guarantees valid JSON,
  // not a particular shape.
  const { content, usage } = await callModel({
    level: params.level,
    json: true,
    system:
      params.instructions +
      '\n\nRespond with a single valid JSON object and nothing else. It must match exactly this shape: ' +
      JSON.stringify(params.schema),
    user: params.input,
  });
  return { data: parseJsonObject<T>(content), usage };
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

    const level = await spendLevel(supabase);
    const quota = await consumeQuota(supabase, user.id, 'enhance');
    quotaConsumed = quota.plan === 'free';
    if (level === 'paused' && quota.plan === 'free') throw new SpendPausedError("Nurj has reached today's free AI capacity. Your free prompts come back at midnight, or upgrade to keep going now.");

    const { data: result, usage } = await createStructuredResponse<EnhancedPayload>({
      name: 'nurj_prompt_enhancement',
      schema,
      instructions: `You are Nurj's prompt quality engine. Diagnose an existing prompt and rebuild it for clarity, context, control and commercial usefulness. Preserve the user's legitimate intent. Add missing role, context, output structure, constraints and success criteria. Do not insert invented facts. Do not imitate a living person's distinctive voice. Keep the enhanced prompt practical and ready to copy. Return four to six meaningful changes.`,
      input: `Original prompt:
${originalPrompt}

Business stage: ${stage || 'Not supplied'}
Saved business context: ${business || 'Not supplied'}

Return a concise title, the complete enhanced prompt, a diagnosis of the original weakness, and the meaningful changes made.`,
      level,
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
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : error instanceof SpendPausedError ? 503 : error instanceof UpstreamError ? 502 : 400;
    return fail(safeMessage(error), status);
  }
}
