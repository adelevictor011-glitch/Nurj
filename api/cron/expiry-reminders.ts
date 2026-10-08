import { createHmac, timingSafeEqual } from 'node:crypto';
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

/**
 * Runs daily via Vercel Cron. Reaches the customer whose access ends in three
 * days — previously the only signal was getting blocked mid-task.
 *
 * If no email provider (BREVO_API_KEY or RESEND_API_KEY) is set the job still runs and reports who is due, so
 * you can send manually until an email provider is connected.
 */
// ---- Monday momentum digest (roadmap feature 6) ----
// Sent on Mondays (Lagos time) by the same daily cron, so no extra Vercel
// function or cron slot is needed. Active users (any prompt in 21 days) get
// the digest; inactive users get one win-back email, then nothing.

const FIRST_MOVES: Record<string, string> = {
  validation: 'Book 5 problem interviews with potential customers.',
  launch: 'Send five highly specific outreach messages today.',
  scaling: 'Turn your most repeated service into three outcome-based packages.',
  exit: 'Calculate the exact monthly revenue and runway required to resign safely.',
};

// Signed with a key derived from the service-role secret (always set, never
// shared with guest-IP hashing). Throws if it is missing, so links can't be
// signed with an empty key.
function digestToken(userId: string): string {
  const key = createHmac('sha256', env.supabaseServiceRoleKey).update('nurj:digest-unsubscribe:v2').digest();
  return createHmac('sha256', key).update(userId).digest('hex').slice(0, 32);
}

function naira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}

async function allEmails(supabase: SupabaseClient): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const user of data.users) if (user.email) emails.set(user.id, user.email);
    if (data.users.length < 1000) break;
  }
  return emails;
}

// Free email plans cap daily sends (Brevo free: 300 a day; Resend free: 100).
// EMAIL_DAILY_LIMIT keeps the job under that cap; if more people are due, the
// digest carries on Tuesday to Thursday until everyone has this week's email.
function emailDailyLimit(): number {
  const value = Number(process.env.EMAIL_DAILY_LIMIT);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 280;
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

async function sendMondayDigest(supabase: SupabaseClient, force: boolean, budget: number) {
  const weekday = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long' });
  if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday'].includes(weekday) && !force) return { skipped: 'not a digest day' };
  if (budget <= 0) return { skipped: 'daily email limit reached' };

  if (!emailConfigured()) return { skipped: 'email not configured' };

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  // Aggregated in SQL (migration 009): no row caps, fairest-first ordering,
  // and people who already had their one win-back are excluded.
  const [{ data: candidates, error }, emails] = await Promise.all([
    supabase.rpc('digest_candidates', { p_limit: Math.min(budget, 500) }),
    allEmails(supabase),
  ]);
  if (error) throw new ServerError('Digest candidates could not be read.');

  interface Candidate {
    id: string;
    display_name: string | null;
    stage: string | null;
    created_at: string;
    winback_sent: boolean;
    last_active_at: string | null;
    prompts_7d: number;
    wins_7d_kobo: number;
  }
  const profiles = (candidates ?? []) as Candidate[];

  const messages: Array<{ id: string; kind: 'digest' | 'winback'; email: { to: string; subject: string; text: string; headers?: Record<string, string> } }> = [];
  for (const profile of profiles ?? []) {
    const to = emails.get(profile.id);
    if (!to) continue;
    const name = (profile.display_name as string | null)?.split(' ')[0] || 'there';
    const unsubscribe = `${env.appUrl}/api/account?unsubscribe=${profile.id}.${digestToken(profile.id)}`;
    const headers = { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
    const active = Boolean(profile.last_active_at);

    if (active) {
      const won = Number(profile.wins_7d_kobo);
      const prompts = Number(profile.prompts_7d);
      const move = FIRST_MOVES[(profile.stage as string) ?? 'launch'] ?? FIRST_MOVES.launch;
      const share = `https://wa.me/?text=${encodeURIComponent(`This week's one move: ${move} (from Nurj)`)}`;
      messages.push({
        id: profile.id,
        kind: 'digest',
        email: {
          to, headers,
          subject: won > 0 ? `${naira(won)} in wins last week. Here's this week's move.` : `Your one move for this week, ${name}`,
          text: `Good morning ${name},\n\nLast week: ${prompts} prompt${prompts === 1 ? '' : 's'}${won > 0 ? ` and ${naira(won)} in logged wins` : ''}.\n\nThis week, do this first:\n${move}\n\nOpen Nurj and build the prompt for it: ${env.appUrl}\n\nShare the move on WhatsApp: ${share}\n\n— Nurj\n\nStop these Monday emails: ${unsubscribe}`,
        },
      });
    } else if (!profile.winback_sent && profile.created_at < weekAgo) {
      messages.push({
        id: profile.id,
        kind: 'winback',
        email: {
          to, headers,
          subject: `${name}, one 10-minute move for your business`,
          text: `Hi ${name},\n\nIt has been a while. Here is one small move that tends to bring the next customer closer:\n\n${FIRST_MOVES[(profile.stage as string) ?? 'launch'] ?? FIRST_MOVES.launch}\n\nNurj will write the exact prompt for it in under a minute: ${env.appUrl}\n\nThis is the only reminder we will send.\n\n— Nurj\n\nStop these emails: ${unsubscribe}`,
        },
      });
    }
  }

  // One message per person (each has its own unsubscribe link), 10 at a time.
  let sent = 0;
  for (let index = 0; index < messages.length; index += 10) {
    const batch = messages.slice(index, index + 10);
    const results = await Promise.all(batch.map((message) => sendEmail(message.email)));
    const delivered = batch.filter((_, position) => results[position]);
    sent += delivered.length;
    const now = new Date().toISOString();
    const digestIds = delivered.filter((message) => message.kind === 'digest').map((message) => message.id);
    const winbackIds = delivered.filter((message) => message.kind === 'winback').map((message) => message.id);
    if (digestIds.length) await supabase.from('profiles').update({ digest_last_sent_at: now }).in('id', digestIds);
    if (winbackIds.length) await supabase.from('profiles').update({ digest_last_sent_at: now, digest_winback_sent_at: now }).in('id', winbackIds);
  }
  return { candidates: profiles.length, queued: messages.length, sent };
}

async function sendExpiryReminders(supabase: SupabaseClient) {
  // Without an email provider, do nothing: marking people as reminded here
  // would mean they never get the reminder once email is switched on.
  if (!emailConfigured()) return { checked: 0, sent: 0, skipped: 'email not configured' };
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + 3 * 86_400_000);

  const { data: due, error } = await supabase
    .from('profiles')
    .select('id, display_name, plan, plan_expires_at, expiry_reminded_at')
    .neq('plan', 'free')
    .gt('plan_expires_at', windowStart.toISOString())
    .lte('plan_expires_at', windowEnd.toISOString())
    .is('expiry_reminded_at', null);

  if (error) throw new ServerError('Expiring accounts could not be read.');
  const rows = due ?? [];
  if (!rows.length) return { checked: 0, sent: 0 };

  let sent = 0;

  for (const row of rows) {
    let delivered = false;

    if (emailConfigured()) {
      const { data: authUser } = await supabase.auth.admin.getUserById(row.id);
      const email = authUser?.user?.email;
      if (email) {
        const expires = new Date(row.plan_expires_at as string).toLocaleDateString('en-NG', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        delivered = await sendEmail({
          to: email,
          subject: 'Your Nurj access ends in 3 days',
          text: `Hi ${row.display_name ?? 'there'},\n\nYour Nurj ${row.plan === 'builder' ? 'Builder' : 'Operator'} access ends on ${expires}.\n\nRenewing keeps the daily limits off and your saved history exactly where it is: ${env.appUrl}\n\nIf you would rather pause, nothing happens automatically — you simply move back to the free plan.\n\n— Nurj`,
        });
      }
    }

    await supabase
      .from('profiles')
      .update({ expiry_reminded_at: new Date().toISOString() })
      .eq('id', row.id);

    if (delivered) sent += 1;
  }

  return { checked: rows.length, sent, emailConfigured: emailConfigured() };
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Fail closed: without a configured secret nobody may run the job.
    const secret = process.env.CRON_SECRET;
    const given = Buffer.from(request.headers.get('authorization') ?? '', 'utf8');
    const expected = Buffer.from(`Bearer ${secret ?? ''}`, 'utf8');
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      if (!secret) console.error('[cron] CRON_SECRET is not set; refusing to run.');
      return fail('Unauthorized.', 401);
    }

    const supabase = adminClient();
    // ?digest=force sends the digest on any day (for testing); it still
    // respects opt-outs and the once-a-week guard.
    const force = new URL(request.url).searchParams.get('digest') === 'force';
    const expiry = await sendExpiryReminders(supabase);
    let digest: unknown;
    try {
      const expirySent = Number((expiry as { sent?: number }).sent ?? 0);
      digest = await sendMondayDigest(supabase, force, emailDailyLimit() - expirySent);
    } catch (digestError) {
      console.error('[digest] failed', safeMessage(digestError));
      digest = { error: safeMessage(digestError) };
    }
    return json({ expiry, digest });
  } catch (error) {
    return fail(safeMessage(error), statusFor(error, 500));
  }
}
