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

// ---- endpoint ----

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
    const to = process.env.ADMIN_ALERT_EMAIL;
    if (to) await sendEmail({ to, subject: `Nurj AI spend at ${percent}% of today's budget`, text: message });
  } catch (error) {
    console.error('[spend] alert failed', safeMessage(error));
  }
}

// Per-user monthly budget (protects plan margin). Past it, that user's calls
// quietly move to the cheaper model; nothing is blocked. Budgets are tokens
// over the last 30 days: AI_MONTHLY_TOKENS_BUILDER (default 2,500,000) and
// AI_MONTHLY_TOKENS_OPERATOR (default 6,000,000).
function monthlyTokenBudget(plan: string): number | null {
  const fallback = plan === 'operator' ? 6_000_000 : plan === 'builder' ? 2_500_000 : null;
  if (fallback === null) return null;
  const value = Number(plan === 'operator' ? process.env.AI_MONTHLY_TOKENS_OPERATOR : process.env.AI_MONTHLY_TOKENS_BUILDER);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function personalLevel(supabase: SupabaseClient, userId: string, plan: string, level: SpendLevel): Promise<SpendLevel> {
  const budget = monthlyTokenBudget(plan);
  if (budget === null || level !== 'normal') return level;
  const { data, error } = await supabase.rpc('user_tokens_30d', { p_user: userId });
  if (error) return level;
  return Number(data ?? 0) >= budget ? 'degrade' : level;
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
        // Hard cap on reply length (reasoning included) so one call can never
        // run up the bill; lighter reasoning once spend is high.
        max_completion_tokens: params.json ? 4000 : 6000,
        ...(params.level !== 'normal' ? { reasoning_effort: 'low' as const } : {}),
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

/**
 * Runs the architected prompt and returns the actual work product.
 *
 * This is the difference between a prompt formatter and an operating layer:
 * the outcome now happens inside Nurj, so we can ask whether it worked.
 */
const BUILDER_DAILY_RUNS = 10;

export async function POST(request: Request): Promise<Response> {
  let quotaConsumed = false;
  let runSlotConsumed = false;
  let userId = '';
  let quotaClient: Awaited<ReturnType<typeof requireUser>>['supabase'] | null = null;

  try {
    const { user, supabase } = await requireUser(request);
    userId = user.id;
    quotaClient = supabase;

    const body = await readJson<{ prompt?: unknown; historyId?: unknown }>(request);
    const prompt = assertText(body.prompt, 'Prompt', 8000);
    const historyId = assertText(body.historyId, 'History reference', 60, false);

    // Roadmap feature 4: Builder includes 10 runs a day; Operator is uncapped
    // (still inside the 150-a-day fair-use ceiling).
    const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at').eq('id', user.id).single();
    const activePlan = profile && profile.plan !== 'free' && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date() ? profile.plan : 'free';
    if (activePlan === 'builder') {
      const { data: slot, error: slotError } = await supabase.rpc('consume_run_slot', { p_user: user.id, p_limit: BUILDER_DAILY_RUNS });
      if (slotError) throw new Error('Usage could not be checked.');
      if (!slot) {
        throw new QuotaError(`Builder includes ${BUILDER_DAILY_RUNS} runs a day, and you have used them. Operator removes this cap, or your runs reset at midnight.`);
      }
      runSlotConsumed = true;
    }

    let level = await spendLevel(supabase);
    const quota = await consumeQuota(supabase, user.id, 'prompt');
    quotaConsumed = true;
    level = await personalLevel(supabase, user.id, quota.plan, level);

    if (level === 'paused' && quota.plan === 'free') throw new SpendPausedError("Nurj has reached today's free AI capacity. Your free prompts come back at midnight, or upgrade to keep going now.");

    const { content: output, usage } = await callModel({
      level,
      json: false,
      system:
        'You are executing a prompt written by a Nigerian founder inside their business tool. Produce the finished work product the prompt asks for — not advice about how to produce it, and not a restatement of the prompt. Be specific and commercially usable. Use naira, WhatsApp, Instagram and local market context only where it materially improves the output. State any assumption you had to make in one short line at the end.',
      user: prompt,
    });

    logModelUsage(supabase, {
      userId: user.id,
      kind: 'generate',
      usage,
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
    if (runSlotConsumed && userId && quotaClient) await quotaClient.rpc('refund_run_slot', { p_user: userId });
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : error instanceof SpendPausedError ? 503 : error instanceof UpstreamError ? 502 : 400;
    return fail(safeMessage(error), status);
  }
}
