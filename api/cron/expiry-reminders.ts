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

/**
 * Runs daily via Vercel Cron. Reaches the customer whose access ends in three
 * days — previously the only signal was getting blocked mid-task.
 *
 * If RESEND_API_KEY is absent the job still runs and reports who is due, so
 * you can send manually until an email provider is connected.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
      return fail('Unauthorized.', 401);
    }

    const supabase = adminClient();
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
    if (!rows.length) return json({ checked: 0, sent: 0 });

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

    return json({ checked: rows.length, sent, emailConfigured: Boolean(resendKey && from) });
  } catch (error) {
    return fail(safeMessage(error), 500);
  }
}
