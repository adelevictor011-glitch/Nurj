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

let client: OpenAI | null = null;

function openai() {
  client ??= new OpenAI({ apiKey: env.openaiApiKey });
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
  const response = await openai().responses.create({
    model,
    instructions: params.instructions,
    input: params.input,
    text: {
      format: {
        type: 'json_schema',
        name: params.name,
        strict: true,
        schema: params.schema,
      },
    },
  });

  if (!response.output_text) throw new Error('The AI returned an empty response.');

  return {
    data: JSON.parse(response.output_text) as T,
    usage: {
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
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
Strategic influence: ${params.mentor?.trim() || 'None supplied.'}
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
    const mentor = assertText(body.mentor, 'Strategic influence', 300, false);
    const stage = assertText(body.stage, 'Stage', 30, false) || 'launch';
    const category = assertText(body.category, 'Category', 40, false);

    await consumeGuestQuota(supabase, fingerprint);
    consumed = true;

    const { data: result, usage } = await createStructuredResponse<GeneratedPayload>({
      name: 'nurj_prompt_architecture',
      schema: generateSchema,
      instructions: GENERATE_INSTRUCTIONS,
      input: buildGenerateInput({ stage, goal, business, customer, context, mentor, category }),
    });

    logModelUsage(supabase, { userId: null, kind: 'guest_generate', usage });

    return json({ ...result, remaining: 0, guest: true });
  } catch (error) {
    if (consumed && fingerprint && !(error instanceof GuestQuotaError)) {
      await refundGuestQuota(supabase, fingerprint);
    }
    return fail(safeMessage(error), error instanceof GuestQuotaError ? 429 : 400);
  }
}
