import { createHmac } from 'node:crypto';
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
 * Runs daily via Vercel Cron. Reaches the customer whose access ends in three
 * days — previously the only signal was getting blocked mid-task.
 *
 * If RESEND_API_KEY is absent the job still runs and reports who is due, so
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

function digestToken(userId: string): string {
  return createHmac('sha256', `digest:${process.env.GUEST_IP_SALT ?? ''}`).update(userId).digest('hex').slice(0, 32);
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

async function sendMondayDigest(supabase: SupabaseClient, force: boolean) {
  const weekday = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long' });
  if (weekday !== 'Monday' && !force) return { skipped: 'not Monday' };

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;
  if (!resendKey || !from) return { skipped: 'email not configured' };

  const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const threeWeeksAgo = new Date(Date.now() - 21 * 86_400_000).toISOString();

  const [{ data: profiles }, { data: recent }, { data: wins }, emails] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, stage, created_at, digest_winback_sent_at, digest_last_sent_at')
      .eq('digest_opt_out', false)
      .or(`digest_last_sent_at.is.null,digest_last_sent_at.lt.${sixDaysAgo}`)
      .limit(500),
    supabase.from('prompt_history').select('user_id, created_at').gt('created_at', threeWeeksAgo),
    supabase.from('wins').select('user_id, amount_kobo').gt('created_at', weekAgo),
    allEmails(supabase),
  ]);

  const lastActive = new Map<string, number>();
  const promptsThisWeek = new Map<string, number>();
  for (const row of recent ?? []) {
    const at = new Date(row.created_at as string).getTime();
    lastActive.set(row.user_id, Math.max(lastActive.get(row.user_id) ?? 0, at));
    if (row.created_at > weekAgo) promptsThisWeek.set(row.user_id, (promptsThisWeek.get(row.user_id) ?? 0) + 1);
  }
  const winsThisWeek = new Map<string, number>();
  for (const row of wins ?? []) winsThisWeek.set(row.user_id, (winsThisWeek.get(row.user_id) ?? 0) + Number(row.amount_kobo));

  const messages: Array<{ id: string; kind: 'digest' | 'winback'; email: Record<string, unknown> }> = [];
  for (const profile of profiles ?? []) {
    const to = emails.get(profile.id);
    if (!to) continue;
    const name = (profile.display_name as string | null)?.split(' ')[0] || 'there';
    const unsubscribe = `${env.appUrl}/api/account?unsubscribe=${profile.id}.${digestToken(profile.id)}`;
    const headers = { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
    const active = lastActive.has(profile.id);

    if (active) {
      const won = winsThisWeek.get(profile.id) ?? 0;
      const prompts = promptsThisWeek.get(profile.id) ?? 0;
      const move = FIRST_MOVES[(profile.stage as string) ?? 'launch'] ?? FIRST_MOVES.launch;
      const share = `https://wa.me/?text=${encodeURIComponent(`This week's one move: ${move} (from Nurj)`)}`;
      messages.push({
        id: profile.id,
        kind: 'digest',
        email: {
          from, to, headers,
          subject: won > 0 ? `${naira(won)} in wins last week. Here's this week's move.` : `Your one move for this week, ${name}`,
          text: `Good morning ${name},\n\nLast week: ${prompts} prompt${prompts === 1 ? '' : 's'}${won > 0 ? ` and ${naira(won)} in logged wins` : ''}.\n\nThis week, do this first:\n${move}\n\nOpen Nurj and build the prompt for it: ${env.appUrl}\n\nShare the move on WhatsApp: ${share}\n\n— Nurj\n\nStop these Monday emails: ${unsubscribe}`,
        },
      });
    } else if (!profile.digest_winback_sent_at && (profile.created_at as string) < weekAgo) {
      messages.push({
        id: profile.id,
        kind: 'winback',
        email: {
          from, to, headers,
          subject: `${name}, one 10-minute move for your business`,
          text: `Hi ${name},\n\nIt has been a while. Here is one small move that tends to bring the next customer closer:\n\n${FIRST_MOVES[(profile.stage as string) ?? 'launch'] ?? FIRST_MOVES.launch}\n\nNurj will write the exact prompt for it in under a minute: ${env.appUrl}\n\nThis is the only reminder we will send.\n\n— Nurj\n\nStop these emails: ${unsubscribe}`,
        },
      });
    }
  }

  let sent = 0;
  for (let index = 0; index < messages.length; index += 100) {
    const batch = messages.slice(index, index + 100);
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map((message) => message.email)),
    });
    if (!response.ok) {
      console.error('[digest] batch failed', response.status, await response.text().catch(() => ''));
      continue;
    }
    sent += batch.length;
    const now = new Date().toISOString();
    const digestIds = batch.filter((message) => message.kind === 'digest').map((message) => message.id);
    const winbackIds = batch.filter((message) => message.kind === 'winback').map((message) => message.id);
    if (digestIds.length) await supabase.from('profiles').update({ digest_last_sent_at: now }).in('id', digestIds);
    if (winbackIds.length) await supabase.from('profiles').update({ digest_last_sent_at: now, digest_winback_sent_at: now }).in('id', winbackIds);
  }
  return { candidates: profiles?.length ?? 0, queued: messages.length, sent };
}

async function sendExpiryReminders(supabase: SupabaseClient) {
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + 3 * 86_400_000);

  const { data: due, error } = await supabase
    .from('profiles')
    .select('id, display_name, plan, plan_expires_at, expiry_reminded_at')
    .neq('plan', 'free')
    .gt('plan_expires_at', windowStart.toISOString())
    .lte('plan_expires_at', windowEnd.toISOString())
    .is('expiry_reminded_at', null);

  if (error) throw new Error('Expiring accounts could not be read.');
  const rows = due ?? [];
  if (!rows.length) return { checked: 0, sent: 0 };

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;
  let sent = 0;

  for (const row of rows) {
    let delivered = false;

    if (resendKey && from) {
      const { data: authUser } = await supabase.auth.admin.getUserById(row.id);
      const email = authUser?.user?.email;
      if (email) {
        const expires = new Date(row.plan_expires_at as string).toLocaleDateString('en-NG', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: email,
            subject: 'Your Nurj access ends in 3 days',
            text: `Hi ${row.display_name ?? 'there'},\n\nYour Nurj ${row.plan === 'builder' ? 'Builder' : 'Operator'} access ends on ${expires}.\n\nRenewing keeps the daily limits off and your saved history exactly where it is: ${env.appUrl}\n\nIf you would rather pause, nothing happens automatically — you simply move back to the free plan.\n\n— Nurj`,
          }),
        });
        delivered = response.ok;
      }
    }

    await supabase
      .from('profiles')
      .update({ expiry_reminded_at: new Date().toISOString() })
      .eq('id', row.id);

    if (delivered) sent += 1;
  }

  return { checked: rows.length, sent, emailConfigured: Boolean(resendKey && from) };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
      return fail('Unauthorized.', 401);
    }

    const supabase = adminClient();
    // ?digest=force sends the digest on any day (for testing); it still
    // respects opt-outs and the once-a-week guard.
    const force = Boolean(secret) && new URL(request.url).searchParams.get('digest') === 'force';
    const expiry = await sendExpiryReminders(supabase);
    let digest: unknown;
    try {
      digest = await sendMondayDigest(supabase, force);
    } catch (digestError) {
      console.error('[digest] failed', safeMessage(digestError));
      digest = { error: safeMessage(digestError) };
    }
    return json({ expiry, digest });
  } catch (error) {
    return fail(safeMessage(error), 500);
  }
}
