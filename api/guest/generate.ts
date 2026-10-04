import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
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

interface GeneratedPayload {
  title: string;
  prompt: string;
  why_it_works: string;
  next_action: string;
}

const generateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    prompt: { type: 'string' },
    why_it_works: { type: 'string' },
    next_action: { type: 'string' },
  },
  required: ['title', 'prompt', 'why_it_works', 'next_action'],
};

const GENERATE_INSTRUCTIONS = `You are Nurj, a commercially rigorous prompt architect for Nigerian founders and side-hustle operators. Your job is to write the prompt the user should give another capable AI—not to complete the business task itself.

Build prompts with a precise expert role, concrete business context, exact objective, useful output format, quality constraints, Nigerian market context only when relevant, and one immediate execution endpoint. Do not imitate a living person's distinctive voice. You may apply broadly known principles associated with an expert, but state them as principles. Avoid generic motivation, stereotypes, fabricated data and unnecessary length. The final prompt must be ready to copy and use.`;

/**
 * Sector-specific priors. This is where the classifier stops being decoration
 * and starts making a caterer's first prompt better than a generic one.
 */
const CATEGORY_BRIEFS: Record<string, string> = {
  beauty_skincare: 'Trust and visible proof drive purchase. Before/after evidence, ingredient honesty, sensitive-skin reassurance, and NAFDAC/regulatory caution where claims are made.',
  fashion: 'Sizing confidence, fit guarantees, delivery timelines and returns are the real objections. Visual merchandising and restock urgency matter more than discounting.',
  food: 'Repeat purchase and hygiene trust dominate. Order lead time, delivery radius, minimum order value and packaging integrity are the decisive commercial variables.',
  design_creative: 'Buyers cannot judge quality in advance, so scope clarity, revision limits, turnaround time and a portfolio-anchored proof point carry the sale.',
  education: 'Outcome specificity and parent or sponsor approval drive conversion. Reference exam boards, timelines and measurable score or skill outcomes.',
  technology: 'Buyers need proof of reliability and support. Concrete integration steps, uptime, data handling and a low-risk first engagement reduce friction.',
  commerce: 'Margin per unit, stock turnover, supplier reliability and delivery cost decide viability. Price anchoring and bundle logic matter.',
  finance: 'Regulatory caution is mandatory. Never imply guaranteed returns. Emphasise record-keeping, verifiable numbers and transparent fee structures.',
  logistics: 'Reliability and proof of delivery are the product. Route density, per-drop cost, failed-delivery rate and dispatch capacity are the operating levers.',
  professional_services: 'Positioning, a specific ideal client and a clear engagement scope decide pricing power. Retainers beat one-off projects.',
  other: '',
};

const STAGE_BRIEFS: Record<string, string> = {
  validation: 'The constraint is evidence, not execution volume. Bias the prompt toward buyer conversations, falsifiable tests and commitment signals rather than building or branding.',
  launch: 'The constraint is pipeline. Bias the prompt toward outreach, offer clarity and closing the first paying customers, not systems or scale.',
  scaling: 'The constraint is repeatability. Bias the prompt toward delegation, documented process, margin discipline and channel consistency.',
  exit: 'The constraint is transferability. Bias the prompt toward clean financials, reduced founder dependency and defensible asset value.',
};

function buildGenerateInput(params: {
  stage: string;
  goal: string;
  business: string;
  customer: string;
  context?: string;
  mentor?: string;
  category?: string;
}): string {
  const categoryBrief = CATEGORY_BRIEFS[params.category ?? 'other'] ?? '';
  const stageBrief = STAGE_BRIEFS[params.stage] ?? '';

  return `Growth stage: ${params.stage}
Goal: ${params.goal}
Business: ${params.business}
Target customer: ${params.customer}
Task context: ${params.context?.trim() || 'No extra context supplied.'}
Mentors / framework: ${params.mentor?.trim() || 'None supplied.'}
${categoryBrief ? `\nSector dynamics to respect: ${categoryBrief}` : ''}${stageBrief ? `\nStage constraint to respect: ${stageBrief}` : ''}

Create a title, the complete prompt, a concise explanation of why it works, and one next action the founder can complete today.`;
}

/**
 * Turns a request into a stable, non-reversible daily identifier.
 * The raw IP never touches the database.
 */
function guestFingerprint(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`${env.guestIpSalt}:${ip}`).digest('hex');
}

class GuestQuotaError extends Error {}

async function consumeGuestQuota(supabase: SupabaseClient, ipHash: string) {
  const { data, error } = await supabase.rpc('consume_guest_quota', { p_ip_hash: ipHash });
  if (error) throw new Error('Usage could not be checked.');
  const result = data as { allowed: boolean; remaining: number; limit: number };
  if (!result.allowed) {
    throw new GuestQuotaError('You have used your free preview. Sign in with Google to keep building — it is still free.');
  }
  return result;
}

async function refundGuestQuota(supabase: SupabaseClient, ipHash: string) {
  await supabase.rpc('refund_guest_quota', { p_ip_hash: ipHash });
}

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

interface GuestBody {
  goal?: unknown;
  business?: unknown;
  customer?: unknown;
  context?: unknown;
  mentor?: unknown;
  stage?: unknown;
  category?: unknown;
}

/**
 * One real generation per IP per day, no account required.
 *
 * The old guest path returned a hard-coded string template behind a fake
 * loading animation. A stranger's only impression of Nurj was a mail merge.
 * This gives them the actual product once, then asks them to sign in.
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = adminClient();
  let fingerprint = '';
  let consumed = false;

  try {
    fingerprint = guestFingerprint(request);
    const body = await readJson<GuestBody>(request);
    const goal = assertText(body.goal, 'Goal', 240);
    const business = assertText(body.business, 'Business', 800);
    const customer = assertText(body.customer, 'Target customer', 800);
    const context = assertText(body.context, 'Context', 1200, false);
    const mentor = assertText(body.mentor, 'Mentors / framework', 1500, false);
    const stage = assertText(body.stage, 'Stage', 30, false) || 'launch';
    const category = assertText(body.category, 'Category', 40, false);

    const level = await spendLevel(supabase);
    if (level === 'paused') throw new SpendPausedError("Nurj has reached today's free preview capacity. Sign in with Google, or try again after midnight.");
    await consumeGuestQuota(supabase, fingerprint);
    consumed = true;

    const { data: result, usage } = await createStructuredResponse<GeneratedPayload>({
      name: 'nurj_prompt_architecture',
      schema: generateSchema,
      instructions: GENERATE_INSTRUCTIONS,
      input: buildGenerateInput({ stage, goal, business, customer, context, mentor, category }),
      level,
    });

    logModelUsage(supabase, { userId: null, kind: 'guest_generate', usage });

    return json({ ...result, remaining: 0, guest: true });
  } catch (error) {
    if (consumed && fingerprint && !(error instanceof GuestQuotaError)) {
      await refundGuestQuota(supabase, fingerprint);
    }
    const status = error instanceof GuestQuotaError ? 429 : error instanceof SpendPausedError ? 503 : error instanceof UpstreamError ? 502 : 400;
    return fail(safeMessage(error), status);
  }
}
