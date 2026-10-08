import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

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
  if (error) throw new ServerError('Usage could not be checked.');
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
// Reading the spend fails closed for free and guest use (see spendLevel).

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
    // Fail closed: if spend can't be read, treat today as over budget. Free and
    // guest AI pauses; paid members continue on the lighter model.
    console.error('[spend] could not read today\'s spend; pausing free AI', error.message);
    return 'paused';
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
// One function serves several AI actions (Vercel Hobby allows 12 functions):
//   enhance  – rebuild a weak prompt (enhancement quota)
//   refine   – "It didn't work, fix it" (feature 9, prompt quota)
//   channel  – reshape a result for a channel within its limits (feature 15, prompt quota)
//   script   – price-rise message from the calculator (feature 16, prompt quota)
//   pack     – this month's Operator prompt pack (feature 4, Operator only, no quota)

interface EnhanceBody {
  mode?: unknown;
  prompt?: unknown;
  stage?: unknown;
  business?: unknown;
  output?: unknown;
  complaint?: unknown;
  text?: unknown;
  channel?: unknown;
  product?: unknown;
  oldPrice?: unknown;
  newPrice?: unknown;
  reason?: unknown;
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

// Character targets per placement. Platform limits checked 3 October 2026;
// Nurj writes below them and puts the hook inside the visible part.
const CHANNELS: Record<string, { label: string; limit: number; guide: string; subject?: number }> = {
  whatsapp_message: { label: 'WhatsApp chat or broadcast message', limit: 1000, guide: 'Conversational and warm, short paragraphs, one clear call to action, no hashtags.' },
  whatsapp_status: { label: 'WhatsApp Status text', limit: 500, guide: 'Punchy, readable in 5 seconds, one call to action.' },
  whatsapp_business: { label: 'WhatsApp Business profile description', limit: 480, guide: 'What the business does, who it serves, how to order. No hashtags.' },
  instagram_caption: { label: 'Instagram feed or Reels caption', limit: 600, guide: 'Put the hook in the first 125 characters. End with 5 to 10 relevant hashtags.' },
  instagram_bio: { label: 'Instagram profile bio', limit: 140, guide: 'Who you help, the result, and a call to action. Line breaks allowed.' },
  tiktok_caption: { label: 'TikTok video caption', limit: 300, guide: 'Hook in the first 100 characters. End with 3 to 5 hashtags.' },
  tiktok_photo_title: { label: 'TikTok photo post title', limit: 80, guide: 'A curiosity-driven title. No hashtags.' },
  tiktok_bio: { label: 'TikTok profile bio', limit: 75, guide: 'Who you help and why to follow. No hashtags.' },
  email: { label: 'Email', limit: 1100, subject: 50, guide: 'A subject line of at most 50 characters, then a body of at most 150 words with one call to action.' },
};

const channelSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { subject: { type: 'string' }, text: { type: 'string' } },
  required: ['subject', 'text'],
};

const packSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    prompts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, use_when: { type: 'string' }, prompt: { type: 'string' } },
        required: ['title', 'use_when', 'prompt'],
      },
    },
  },
  required: ['title', 'prompts'],
};

// Trim at a sentence or word boundary if the model overshoots.
function fitTo(text: string, limit: number): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
  if (sentence > limit * 0.6) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : cut.length).trim()}…`;
}

function lagosMonth(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 7);
}

const ENHANCE_INSTRUCTIONS = `You are Nurj's prompt quality engine. Diagnose an existing prompt and rebuild it for clarity, context, control and commercial usefulness. Preserve the user's legitimate intent. Add missing role, context, output structure, constraints and success criteria. Do not insert invented facts. Do not imitate a living person's distinctive voice. Keep the enhanced prompt practical and ready to copy. Return four to six meaningful changes.`;

export async function POST(request: Request): Promise<Response> {
  let quotaConsumed = false;
  let quotaKind: 'prompt' | 'enhance' = 'enhance';
  let userId = '';
  let quotaClient: Awaited<ReturnType<typeof requireUser>>['supabase'] | null = null;

  try {
    const { user, supabase } = await requireUser(request);
    userId = user.id;
    quotaClient = supabase;
    const body = await readJson<EnhanceBody>(request);
    const mode = typeof body.mode === 'string' ? body.mode : 'enhance';
    if (!['enhance', 'refine', 'channel', 'script', 'pack'].includes(mode)) throw new Error('Unknown action.');

    const PACK_CATEGORIES = ['beauty_skincare', 'fashion', 'food', 'design_creative', 'education', 'technology', 'commerce', 'finance', 'logistics', 'professional_services', 'other'];

    // ---- Operator monthly pack: cached per month, sector and stage ----
    if (mode === 'pack') {
      const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at, business_category, stage').eq('id', user.id).single();
      const operator = profile?.plan === 'operator' && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
      if (!operator) throw new QuotaError('Monthly prompt packs are part of Operator.');
      const month = lagosMonth();
      // business_category is user-writable, so only known sectors become
      // cache keys; anything else shares the 'other' pack.
      const category = PACK_CATEGORIES.includes(profile?.business_category ?? '') ? (profile?.business_category as string) : 'other';
      const stage = profile?.stage || 'launch';
      const cached = await supabase.from('prompt_packs').select('title, prompts, month').eq('month', month).eq('category', category).eq('stage', stage).maybeSingle();
      if (cached.data) return json(cached.data);

      // A cache miss is a real AI call, so it counts like any other.
      quotaKind = 'prompt';
      const level = await spendLevel(supabase);
      await consumeQuota(supabase, user.id, 'prompt');
      quotaConsumed = true;
      const { data: pack, usage } = await createStructuredResponse<{ title: string; prompts: Array<{ title: string; use_when: string; prompt: string }> }>({
        name: 'nurj_operator_pack',
        schema: packSchema,
        level,
        instructions: `You are Nurj, a commercially rigorous prompt architect for Nigerian founders. Write a monthly pack of exactly 6 ready-to-use prompts for one business sector at one stage. Each prompt must give another AI a precise role, the business context to fill in (in [square brackets]), a concrete output format and a next action. Make them specific to the sector's real commercial levers in Nigeria and to the stage's main constraint. No generic motivation. Do not imitate a living person's voice.`,
        input: `Month: ${month}\nSector: ${category.replaceAll('_', ' ')}\nStage: ${stage}\n\nReturn a short pack title and 6 prompts, each with a title, one line on when to use it, and the full prompt.`,
      });
      logModelUsage(supabase, { userId: user.id, kind: 'enhance', usage });
      const prompts = (pack.prompts ?? []).slice(0, 6);
      await supabase.from('prompt_packs').upsert({ month, category, stage, title: pack.title, prompts }, { onConflict: 'month,category,stage', ignoreDuplicates: true });
      return json({ title: pack.title, prompts, month });
    }

    // ---- validate inputs for the quota-counted modes ----
    let channelKey = '';
    const inputs: Record<string, string> = {};
    if (mode === 'enhance') {
      inputs.prompt = assertText(body.prompt, 'Prompt', 6000);
      inputs.stage = assertText(body.stage, 'Stage', 30, false);
      inputs.business = assertText(body.business, 'Business context', 800, false);
    } else if (mode === 'refine') {
      inputs.prompt = assertText(body.prompt, 'Prompt', 8000);
      inputs.output = assertText(body.output, 'Result', 8000, false);
      inputs.complaint = assertText(body.complaint, 'What went wrong', 500);
    } else if (mode === 'channel') {
      inputs.text = assertText(body.text, 'Text', 8000);
      channelKey = assertText(body.channel, 'Channel', 40);
      if (!CHANNELS[channelKey]) throw new Error('Choose a channel.');
    } else {
      inputs.product = assertText(body.product, 'Product or service', 120);
      inputs.oldPrice = assertText(body.oldPrice, 'Current price', 20);
      inputs.newPrice = assertText(body.newPrice, 'New price', 20);
      inputs.reason = assertText(body.reason, 'Reason', 300, false);
      channelKey = assertText(body.channel, 'Channel', 40);
      if (!CHANNELS[channelKey]) throw new Error('Choose a channel.');
    }

    quotaKind = mode === 'enhance' ? 'enhance' : 'prompt';
    let level = await spendLevel(supabase);
    const quota = await consumeQuota(supabase, user.id, quotaKind);
    quotaConsumed = true;
    level = await personalLevel(supabase, user.id, quota.plan, level);
    if (level === 'paused' && quota.plan === 'free') throw new SpendPausedError("Nurj has reached today's free AI capacity. Your free prompts come back at midnight, or upgrade to keep going now.");

    if (mode === 'enhance' || mode === 'refine') {
      const { data: result, usage } = await createStructuredResponse<EnhancedPayload>({
        name: mode === 'enhance' ? 'nurj_prompt_enhancement' : 'nurj_prompt_refinement',
        schema,
        level,
        instructions: mode === 'enhance'
          ? ENHANCE_INSTRUCTIONS
          : `You are Nurj's prompt repair engine. A founder ran a prompt and the result did not work for them. Using their complaint and the result they got, rewrite the prompt so the next result fixes exactly that problem. Keep everything that was fine. Be specific about audience, tone, format and constraints where the complaint points. Do not invent business facts. Return the rewritten prompt, a one-line diagnosis of why the first result missed, and three to five concrete changes.`,
        input: mode === 'enhance'
          ? `Original prompt:\n${inputs.prompt}\n\nBusiness stage: ${inputs.stage || 'Not supplied'}\nSaved business context: ${inputs.business || 'Not supplied'}\n\nReturn a concise title, the complete enhanced prompt, a diagnosis of the original weakness, and the meaningful changes made.`
          : `Prompt that was run:\n${inputs.prompt}\n\nResult it produced:\n${inputs.output || '(not supplied)'}\n\nWhat went wrong, in the founder's words:\n${inputs.complaint}\n\nReturn a concise title, the complete fixed prompt, the diagnosis and the changes.`,
      });

      logModelUsage(supabase, { userId: user.id, kind: 'enhance', usage });
      void supabase
        .from('prompt_history')
        .insert({
          user_id: user.id,
          kind: 'enhanced',
          title: result.title,
          goal: mode === 'enhance' ? 'Enhance an existing prompt' : 'Fix a prompt that did not work',
          input: mode === 'enhance'
            ? { original_prompt: inputs.prompt, stage: inputs.stage, business: inputs.business }
            : { original_prompt: inputs.prompt, complaint: inputs.complaint },
          output: result,
        })
        .then(({ error }: { error: { message?: string } | null }) => {
          if (error) console.error('[enhance] history insert failed', error.message);
        });
      return json({ ...result, remaining: quota.remaining });
    }

    // ---- channel reshape and price-rise script ----
    const spec = CHANNELS[channelKey];
    const { data: shaped, usage } = await createStructuredResponse<{ subject: string; text: string }>({
      name: mode === 'channel' ? 'nurj_channel_output' : 'nurj_price_rise_script',
      schema: channelSchema,
      level,
      instructions: `You are Nurj, writing for Nigerian small businesses. Write for exactly one placement: ${spec.label}. Hard limit: ${spec.limit} characters for the text, counting spaces, emojis, hashtags and @mentions. ${spec.guide} Use natural Nigerian English; use naira (₦) for money. Do not invent facts, prices or claims that are not in the input. ${spec.subject ? `Return a subject line of at most ${spec.subject} characters.` : 'Return an empty subject.'}`,
      input: mode === 'channel'
        ? `Reshape this for the placement, keeping its meaning and offer:\n\n${inputs.text}`
        : `Write a respectful message telling existing customers about a price change.\nProduct or service: ${inputs.product}\nCurrent price: ${inputs.oldPrice}\nNew price: ${inputs.newPrice}\nReason: ${inputs.reason || 'not given; do not invent one, focus on quality and service'}\nThank loyal customers, state the new price and when it starts plainly, and give one reason to stay.`,
    });
    logModelUsage(supabase, { userId: user.id, kind: 'enhance', usage });
    return json({
      channel: channelKey,
      limit: spec.limit,
      subject: spec.subject ? fitTo(shaped.subject ?? '', spec.subject) : '',
      text: fitTo(shaped.text ?? '', spec.limit),
      remaining: quota.remaining,
    });
  } catch (error) {
    if (quotaConsumed && userId && quotaClient) await refundQuota(quotaClient, userId, quotaKind);
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : error instanceof SpendPausedError ? 503 : error instanceof UpstreamError ? 502 : 400;
    return fail(safeMessage(error), statusFor(error, status));
  }
}
