import { timingSafeEqual } from 'node:crypto';
import { connect, type TLSSocket } from 'node:tls';
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
  get appUrl() { return (process.env.APP_URL || 'https://nurjai.com').replace(/\/$/, ''); },
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
  // Only a plain Error or one of this file's own classes carries a message
  // written for users. Everything else (TypeError, SyntaxError, AbortError,
  // library errors) is a bug or an outage and must not leak its text.
  if (!(error instanceof Error) || error instanceof ServerError) return true;
  if (Object.getPrototypeOf(error) === Error.prototype) return false;
  return ![AuthError].some((kind) => error instanceof kind);
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


// ---- email: Brevo, or Resend if only it is set (same as expiry-reminders) ----
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

// ---- payment inbox agent ----
// Reads the payments inbox (Titan, over IMAP, read-only) every few minutes:
//
//   * Bank credit alerts from an allow-listed, authenticated sender that carry
//     a NURJ-XXXXXX token and the exact amount switch the plan on by
//     themselves. This is the confirmation source: money actually arrived.
//   * Proof emails from customers (receipt + token) are logged against the
//     transfer so the admin queue shows "proof received". A proof on its own
//     never switches a plan on, because a receipt screenshot is easy to fake.
//   * Anything unclear (no token, wrong amount, unverified sender, unknown
//     token) goes to the admin queue for a one-click decision.
//
// The mailbox is opened with EXAMINE and messages are fetched with
// BODY.PEEK, so nothing in the inbox is changed, moved or marked as read.

const LOOKBACK_DAYS = 3;
const MAX_MESSAGES = 150;
const FETCH_BYTES = 250_000; // enough for any alert or receipt text; attachments are skipped
const RUN_BUDGET_MS = 45_000;

const PLAN_LABELS: Record<string, string> = { builder: 'Builder', operator: 'Operator', business_addon: 'Extra business slot' };

// ---------------------------------------------------------------------------
// Parsing (pure functions, unit-tested in scripts/payment-inbox.test.ts)
// ---------------------------------------------------------------------------

export interface ParsedEmail {
  headers: Array<[string, string]>;
  subject: string;
  from: string;
  messageId: string | null;
  text: string;
  hasAttachment: boolean;
}

function splitHeaderBody(raw: string): [string, string] {
  const crlf = raw.indexOf('\r\n\r\n');
  const lf = raw.indexOf('\n\n');
  if (crlf >= 0 && (lf < 0 || crlf <= lf)) return [raw.slice(0, crlf), raw.slice(crlf + 4)];
  if (lf >= 0) return [raw.slice(0, lf), raw.slice(lf + 2)];
  return [raw, ''];
}

function parseHeaders(block: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) out.push([line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()]);
  }
  return out;
}

function header(headers: Array<[string, string]>, name: string): string {
  return headers.find(([key]) => key === name)?.[1] ?? '';
}

function decodeBytes(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function quotedPrintable(body: string): Buffer {
  const soft = body.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    const hex = soft.slice(i + 1, i + 3);
    if (soft[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(soft.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** RFC 2047 encoded words, e.g. =?UTF-8?B?...?= in subjects. */
export function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, (_match, charset: string, encoding: string, text: string) => {
    const bytes = encoding.toUpperCase() === 'B'
      ? Buffer.from(text, 'base64')
      : quotedPrintable(text.replace(/_/g, ' '));
    return decodeBytes(bytes, charset);
  });
}

function contentType(value: string): { type: string; params: Record<string, string> } {
  const [type, ...rest] = value.split(';');
  const params: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
  return { type: (type || 'text/plain').trim().toLowerCase(), params };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8358;|&#x20a6;/gi, '₦')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function collectText(raw: string, depth: number, out: { text: string[]; attachment: boolean }) {
  if (depth > 5) return;
  const [head, body] = splitHeaderBody(raw);
  const headers = parseHeaders(head);
  const { type, params } = contentType(header(headers, 'content-type'));
  const disposition = header(headers, 'content-disposition').toLowerCase();

  if (type.startsWith('multipart/') && params.boundary) {
    const parts = body.split(`--${params.boundary}`);
    for (const part of parts.slice(1)) {
      if (part.startsWith('--')) break;
      collectText(part.replace(/^\r?\n/, ''), depth + 1, out);
    }
    return;
  }
  if (type === 'message/rfc822') {
    // A forwarded email: read the original inside it.
    collectText(body, depth + 1, out);
    return;
  }
  if (disposition.startsWith('attachment') || !type.startsWith('text/')) {
    if (!type.startsWith('multipart/')) out.attachment = true;
    return;
  }
  const encoding = header(headers, 'content-transfer-encoding').toLowerCase();
  const bytes = encoding === 'base64'
    ? Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64')
    : encoding === 'quoted-printable' ? quotedPrintable(body) : Buffer.from(body, 'latin1');
  const text = decodeBytes(bytes, params.charset ?? 'utf-8');
  out.text.push(type === 'text/html' ? htmlToText(text) : text);
}

/** Parse a raw RFC 822 message (as a latin1 string, so bytes survive). */
export function parseEmail(raw: string): ParsedEmail {
  const [head] = splitHeaderBody(raw);
  const headers = parseHeaders(head);
  const out = { text: [] as string[], attachment: false };
  collectText(raw, 0, out);
  const fromHeader = decodeWords(header(headers, 'from'));
  const address = /<([^<>\s]+@[^<>\s]+)>/.exec(fromHeader)?.[1] ?? /[^\s<>"]+@[^\s<>"]+/.exec(fromHeader)?.[0] ?? '';
  const messageId = header(headers, 'message-id').replace(/[<>\s]/g, '') || null;
  return {
    headers,
    subject: decodeWords(header(headers, 'subject')).slice(0, 300),
    from: address.toLowerCase(),
    messageId,
    text: out.text.join('\n').slice(0, 60_000),
    hasAttachment: out.attachment,
  };
}

export function findTokens(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\bNURJ[\s\-_:./]*([A-HJ-NP-Z2-9]{6})(?![A-Za-z0-9])/gi)) found.add(match[1].toUpperCase());
  return [...found];
}

/** Every naira amount in the text, in kobo. */
export function findAmounts(text: string): number[] {
  const found = new Set<number>();
  const patterns = [
    /(?:\bNGN|₦|\bN)\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.([0-9]{1,2}))?(?![0-9])/gi,
    /\bamount\b[^0-9\n]{0,25}([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.([0-9]{1,2}))?(?![0-9])/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const naira = Number(match[1].replace(/,/g, ''));
      const kobo = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
      if (Number.isFinite(naira) && naira > 0 && naira < 100_000_000) found.add(naira * 100 + kobo);
    }
  }
  return [...found];
}

export function isCreditAlert(subject: string, text: string): boolean {
  if (/\bdebit(ed)?\b|\bDR\b/i.test(subject)) return false;
  if (/\b(credit|credited|CR|received|inflow)\b/i.test(subject)) return true;
  return /\b(credit|credited|you have received|inflow)\b/i.test(text) && !/\b(debit|debited) (alert|transaction)\b/i.test(text);
}

/** Does the sender match BANK_ALERT_SENDERS (full addresses or domains)? */
export function senderAllowed(from: string, allowList: string[]): boolean {
  const domain = from.split('@')[1] ?? '';
  return Boolean(from) && allowList.some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.includes('@')) return rule === from;
    return domain === rule || domain.endsWith(`.${rule}`);
  });
}

/**
 * Was the From domain verified by OUR mail server? Only the topmost
 * Authentication-Results header counts, and only when it names our server
 * (INBOX_AUTHSERV_ID): that is the one Titan adds on arrival. Any other
 * could have been written by whoever sent the email.
 */
export function senderAuthenticated(headers: Array<[string, string]>, from: string, authservId: string | undefined): boolean {
  const results = header(headers, 'authentication-results');
  const domain = from.split('@')[1] ?? '';
  // Without the server's own id we can't tell its header from a forged one.
  if (!results || !domain || !authservId) return false;
  if (results.split(';')[0].trim().toLowerCase().split(/\s/)[0] !== authservId.toLowerCase()) return false;
  const aligned = (d: string) => {
    const value = d.toLowerCase().replace(/^@/, '').replace(/[;,)]+$/, '');
    return value === domain || domain.endsWith(`.${value}`);
  };
  for (const clause of results.split(';').slice(1)) {
    const text = clause.trim().toLowerCase();
    const dmarc = /^dmarc=pass\b.*?header\.from=([^\s;]+)/.exec(text);
    if (dmarc && aligned(dmarc[1])) return true;
    const dkim = /^dkim=pass\b.*?header\.(?:d|i)=@?([^\s;]+)/.exec(text);
    if (dkim && aligned(dkim[1])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Minimal read-only IMAP client (TLS, LOGIN, EXAMINE, UID SEARCH, UID FETCH)
// ---------------------------------------------------------------------------

interface ImapItem { text: string; literals: Buffer[] }

class ImapClient {
  private socket: TLSSocket | null = null;
  private buffer = Buffer.alloc(0);
  private waiters: Array<() => void> = [];
  private failure: Error | null = null;
  private closed = false;
  private tag = 0;

  async open(host: string, port: number) {
    const socket = connect({ host, port, servername: host });
    this.socket = socket;
    socket.setTimeout(20_000, () => socket.destroy(new Error('The mail server stopped responding.')));
    socket.on('data', (chunk: Buffer) => { this.buffer = Buffer.concat([this.buffer, chunk]); this.wake(); });
    socket.on('error', (error: Error) => { this.failure = error; this.wake(); });
    socket.on('close', () => { this.closed = true; this.wake(); });
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', () => resolve());
      socket.once('error', reject);
    });
    const greeting = await this.readItem();
    if (!/^\* (OK|PREAUTH)\b/i.test(greeting.text)) throw new ServerError('The mail server refused the connection.');
  }

  private wake() {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }

  private async more() {
    if (this.failure) throw this.failure;
    if (this.closed) throw new ServerError('The mail server closed the connection.');
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private async readLine(): Promise<string> {
    for (;;) {
      const end = this.buffer.indexOf('\r\n');
      if (end >= 0) {
        const line = this.buffer.subarray(0, end).toString('latin1');
        this.buffer = this.buffer.subarray(end + 2);
        return line;
      }
      await this.more();
    }
  }

  private async readBytes(count: number): Promise<Buffer> {
    while (this.buffer.length < count) await this.more();
    const bytes = Buffer.from(this.buffer.subarray(0, count));
    this.buffer = this.buffer.subarray(count);
    return bytes;
  }

  /** One response: a line, plus any {n} literals it announces. */
  private async readItem(): Promise<ImapItem> {
    let text = '';
    const literals: Buffer[] = [];
    for (;;) {
      const line = await this.readLine();
      const literal = /\{(\d+)\}$/.exec(line);
      if (!literal) return { text: text + line, literals };
      literals.push(await this.readBytes(Number(literal[1])));
      text += `${line.slice(0, -literal[0].length)}{#${literals.length - 1}}`;
    }
  }

  async command(command: string): Promise<ImapItem[]> {
    if (!this.socket) throw new ServerError('The mail server is not connected.');
    const tag = `N${++this.tag}`;
    this.socket.write(`${tag} ${command}\r\n`);
    const untagged: ImapItem[] = [];
    for (;;) {
      const item = await this.readItem();
      if (item.text.startsWith(`${tag} `)) {
        if (!/^\S+ OK\b/i.test(item.text)) {
          const verb = command.split(' ')[0] === 'LOGIN' ? 'LOGIN' : command.slice(0, 40);
          throw new ServerError(`The mail server rejected ${verb}: ${item.text.slice(tag.length + 1, 160)}`);
        }
        return untagged;
      }
      untagged.push(item);
    }
  }

  close() {
    try {
      this.socket?.write(`N${++this.tag} LOGOUT\r\n`);
    } catch {
      // closing anyway
    }
    this.socket?.destroy();
  }
}

function imapQuote(value: string): string {
  if (/[\r\n]/.test(value)) throw new ServerError('Mail credentials contain a line break.');
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function imapDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getUTCDate()}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

function internalDate(text: string): string | null {
  const match = /INTERNALDATE "(\d{1,2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})"/.exec(text);
  if (!match) return null;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  const offset = (Number(match[8]) * 60 + Number(match[9])) * (match[7] === '+' ? 1 : -1);
  const utc = Date.UTC(Number(match[3]), month, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6])) - offset * 60_000;
  return new Date(utc).toISOString();
}

// ---------------------------------------------------------------------------
// Matching and actions
// ---------------------------------------------------------------------------

interface PaymentRow {
  reference: string; user_id: string; plan: string; amount: number; status: string;
  method: string; created_at: string; proof_received_at: string | null; transfer_token: string;
}

type Outcome = 'activated' | 'proof_logged' | 'needs_review' | 'dismissed' | 'ignored';

interface InboxRecord {
  message_id: string; kind: 'bank_alert' | 'proof' | 'other'; from_address?: string | null; subject?: string | null;
  received_at?: string | null; token?: string | null; amount_kobo?: number | null; authenticated?: boolean;
  outcome: Outcome; detail?: string | null; payment_reference?: string | null;
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

async function record(supabase: SupabaseClient, row: InboxRecord): Promise<boolean> {
  const { error } = await supabase.from('inbox_messages').insert(row);
  if (!error) return true;
  if (error.code === '23505') return false; // already recorded, or this payment was already confirmed
  throw new ServerError(`Inbox record failed: ${error.message}`);
}

async function paymentByToken(supabase: SupabaseClient, token: string): Promise<PaymentRow | null> {
  const { data } = await supabase.from('payments')
    .select('reference, user_id, plan, amount, status, method, created_at, proof_received_at, transfer_token')
    .eq('transfer_token', token).eq('method', 'transfer').maybeSingle();
  return (data as PaymentRow | null) ?? null;
}

async function emailFor(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

export async function activateTransfer(supabase: SupabaseClient, payment: PaymentRow, paidAt: string | null, confirmedBy: string) {
  const { data, error } = await supabase.rpc('activate_verified_payment', { p_reference: payment.reference, p_paid_at: paidAt });
  if (error) throw new ServerError(`Activation failed: ${error.message}`);
  const result = data as { activated: boolean; needs_refund?: boolean; expires_at?: string; idempotent?: boolean };
  await supabase.from('payments').update({ confirmed_by: confirmedBy }).eq('reference', payment.reference);
  if (result.activated && !result.idempotent) {
    const to = await emailFor(supabase, payment.user_id);
    if (to) {
      const until = result.expires_at ? new Date(result.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      await sendEmail({
        to,
        subject: `Payment received: ${PLAN_LABELS[payment.plan] ?? 'Nurj'} is active`,
        text: `Hi,\n\nWe received your transfer of ${naira(payment.amount)} (reference NURJ-${payment.transfer_token}).\n\n${PLAN_LABELS[payment.plan] ?? 'Your plan'} is now active${until ? ` until ${until}` : ''}. Open Nurj to keep building: ${env.appUrl}\n\nThank you,\nNurj`,
      });
    }
  }
  return result;
}

async function handleBankAlert(supabase: SupabaseClient, email: ParsedEmail, base: InboxRecord, authenticated: boolean): Promise<Outcome> {
  const tokens = findTokens(`${email.subject}\n${email.text}`);
  const amounts = findAmounts(`${email.subject}\n${email.text}`);
  const row: InboxRecord = { ...base, kind: 'bank_alert', authenticated, amount_kobo: amounts[0] ?? null };

  if (!isCreditAlert(email.subject, email.text)) {
    await record(supabase, { ...row, outcome: 'ignored', detail: 'Not a credit alert.' });
    return 'ignored';
  }

  if (tokens.length !== 1) {
    // No token (or several): look for a single open transfer with this exact amount, for the admin to confirm.
    let candidate: string | null = null;
    let detail = tokens.length ? `Several tokens in one alert: ${tokens.join(', ')}.` : 'Credit with no NURJ token in the narration.';
    if (!tokens.length && amounts.length) {
      const { data } = await supabase.from('payments').select('reference, transfer_token')
        .eq('method', 'transfer').in('status', ['awaiting_transfer', 'proof_received']).in('amount', amounts)
        .gt('transfer_expires_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(3);
      if (data?.length === 1) {
        candidate = data[0].reference as string;
        detail += ` One open transfer matches the amount: NURJ-${data[0].transfer_token}.`;
      } else if (data && data.length > 1) {
        detail += ` ${data.length} open transfers match the amount; check the sender name.`;
      }
    }
    await record(supabase, { ...row, token: tokens[0] ?? null, outcome: 'needs_review', detail, payment_reference: candidate });
    return 'needs_review';
  }

  const token = tokens[0];
  const payment = await paymentByToken(supabase, token);
  const review = async (detail: string, reference: string | null = payment?.reference ?? null) => {
    await record(supabase, { ...row, token, outcome: 'needs_review', detail, payment_reference: reference });
    return 'needs_review' as const;
  };

  if (!payment) return review(`Token NURJ-${token} does not match any transfer.`, null);
  if (payment.status === 'success') {
    await record(supabase, { ...row, token, outcome: 'dismissed', detail: 'This transfer was already confirmed.', payment_reference: payment.reference });
    return 'dismissed';
  }
  if (payment.status !== 'awaiting_transfer' && payment.status !== 'proof_received') return review(`Transfer is marked "${payment.status}".`);
  if (!authenticated) return review('Bank sender could not be verified (no passing DKIM/DMARC). Check the alert in the inbox, then confirm.');
  if (!amounts.includes(payment.amount)) {
    return review(`Amount does not match: expected ${naira(payment.amount)}, alert shows ${amounts.map(naira).join(', ') || 'no amount'}.`);
  }
  if (base.received_at && new Date(base.received_at).getTime() < new Date(payment.created_at).getTime() - 10 * 60_000) {
    return review('Alert arrived before this transfer was started.');
  }

  // Claim the alert first: the unique index allows one confirming alert per payment.
  const claimed = await record(supabase, { ...row, token, outcome: 'activated', detail: 'Matched token and amount from a verified bank alert.', payment_reference: payment.reference });
  if (!claimed) return 'dismissed';
  try {
    const result = await activateTransfer(supabase, payment, base.received_at ?? null, 'bank_alert');
    if (result.needs_refund) {
      await supabase.from('inbox_messages').update({ outcome: 'needs_review', detail: 'Paid, but the plan could not be applied (needs refund).' }).eq('message_id', base.message_id);
      return 'needs_review';
    }
    return 'activated';
  } catch (error) {
    await supabase.from('inbox_messages').update({ outcome: 'needs_review', detail: safeMessage(error).slice(0, 300) }).eq('message_id', base.message_id);
    return 'needs_review';
  }
}

async function handleProof(supabase: SupabaseClient, email: ParsedEmail, base: InboxRecord, tokens: string[]): Promise<Outcome> {
  const row: InboxRecord = { ...base, kind: 'proof', amount_kobo: findAmounts(email.text)[0] ?? null };
  if (tokens.length !== 1) {
    await record(supabase, { ...row, outcome: 'needs_review', detail: `Proof email mentions several tokens: ${tokens.join(', ')}.` });
    return 'needs_review';
  }
  const token = tokens[0];
  const payment = await paymentByToken(supabase, token);
  if (!payment) {
    await record(supabase, { ...row, token, outcome: 'needs_review', detail: `Proof email with unknown token NURJ-${token}.` });
    return 'needs_review';
  }
  if (payment.status === 'success') {
    await record(supabase, { ...row, token, outcome: 'dismissed', detail: 'Transfer already confirmed.', payment_reference: payment.reference });
    return 'dismissed';
  }
  const account = await emailFor(supabase, payment.user_id);
  const sameSender = Boolean(account && account.toLowerCase() === email.from);
  await record(supabase, {
    ...row, token, outcome: 'proof_logged', payment_reference: payment.reference,
    detail: `${email.hasAttachment ? 'Receipt attached' : 'No attachment'}; ${sameSender ? 'sent from the account email' : 'sent from a different address'}.`,
  });
  if (!payment.proof_received_at) {
    await supabase.from('payments').update({ proof_received_at: new Date().toISOString(), status: 'proof_received' })
      .eq('reference', payment.reference).in('status', ['awaiting_transfer', 'proof_received']);
    // Acknowledge to the account owner (never to an arbitrary From address).
    if (account) {
      await sendEmail({
        to: account,
        subject: `We got your payment proof (NURJ-${token})`,
        text: `Hi,\n\nThanks, we received your proof of payment for ${PLAN_LABELS[payment.plan] ?? 'Nurj'} (${naira(payment.amount)}, reference NURJ-${token}).\n\nYour plan switches on as soon as the transfer reaches our account, usually within 30 minutes during the day. We will email you when it is active.\n\nNurj`,
      });
    }
  }
  return 'proof_logged';
}

async function runInbox(supabase: SupabaseClient) {
  const host = process.env.INBOX_IMAP_HOST || 'imap.titan.email';
  const port = Number(process.env.INBOX_IMAP_PORT || 993);
  const user = process.env.INBOX_IMAP_USER;
  const password = process.env.INBOX_IMAP_PASSWORD;
  if (!user || !password) return { skipped: 'INBOX_IMAP_USER and INBOX_IMAP_PASSWORD are not set' };
  const bankSenders = (process.env.BANK_ALERT_SENDERS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  const authservId = process.env.INBOX_AUTHSERV_ID?.trim() || undefined;

  const started = Date.now();
  const tally: Record<Outcome | 'seen' | 'new', number> = { seen: 0, new: 0, activated: 0, proof_logged: 0, needs_review: 0, dismissed: 0, ignored: 0 };
  const reviews: string[] = [];
  const imap = new ImapClient();
  try {
    await imap.open(host, port);
    await imap.command(`LOGIN ${imapQuote(user)} ${imapQuote(password)}`);
    const examine = await imap.command('EXAMINE INBOX');
    const validity = examine.map((item) => /UIDVALIDITY (\d+)/i.exec(item.text)?.[1]).find(Boolean) ?? '0';
    const search = await imap.command(`UID SEARCH SINCE ${imapDate(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000))}`);
    const uids = search.flatMap((item) => (item.text.startsWith('* SEARCH') ? item.text.slice(8).trim().split(/\s+/).filter(Boolean) : []))
      .map(Number).filter(Number.isInteger).sort((a, b) => a - b).slice(-MAX_MESSAGES);
    tally.seen = uids.length;
    if (!uids.length) return { ...tally, reviews };

    // 1. Message-IDs only, so already-processed mail costs nothing.
    const heads = await imap.command(`UID FETCH ${uids.join(',')} (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])`);
    const meta = new Map<number, { id: string; receivedAt: string | null }>();
    for (const item of heads) {
      const uid = Number(/\bUID (\d+)/.exec(item.text)?.[1]);
      if (!Number.isInteger(uid)) continue;
      const raw = item.literals[0]?.toString('latin1') ?? '';
      const id = /^message-id:\s*(.+)$/im.exec(raw.replace(/\r?\n[ \t]+/g, ' '))?.[1]?.replace(/[<>\s]/g, '') || `uid-${validity}-${uid}`;
      meta.set(uid, { id: id.slice(0, 300), receivedAt: internalDate(item.text) });
    }
    const ids = [...meta.values()].map((entry) => entry.id);
    const known = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase.from('inbox_messages').select('message_id').in('message_id', ids.slice(i, i + 100));
      if (error) throw new ServerError('Inbox table missing. Run migration 013.');
      for (const row of data ?? []) known.add(row.message_id as string);
    }

    // 2. New messages: read the first 250 KB (text parts come before attachments).
    for (const [uid, { id, receivedAt }] of meta) {
      if (known.has(id)) continue;
      if (Date.now() - started > RUN_BUDGET_MS) break; // the next run picks up the rest
      tally.new++;
      const fetched = await imap.command(`UID FETCH ${uid} (UID BODY.PEEK[]<0.${FETCH_BYTES}>)`);
      const raw = fetched.find((item) => item.literals.length)?.literals[0]?.toString('latin1') ?? '';
      const email = parseEmail(raw);
      const base: InboxRecord = { message_id: id, kind: 'other', from_address: email.from || null, subject: email.subject || null, received_at: receivedAt, outcome: 'ignored' };

      let outcome: Outcome;
      if (senderAllowed(email.from, bankSenders)) {
        outcome = await handleBankAlert(supabase, email, base, senderAuthenticated(email.headers, email.from, authservId));
      } else {
        const tokens = findTokens(`${email.subject}\n${email.text}`);
        if (tokens.length) {
          outcome = await handleProof(supabase, email, base, tokens);
        } else {
          // Ordinary mail: remember only that it was seen, not what it says.
          await record(supabase, { message_id: id, kind: 'other', outcome: 'ignored' });
          outcome = 'ignored';
        }
      }
      tally[outcome]++;
      if (outcome === 'needs_review') reviews.push(`${email.from || 'unknown sender'}: ${email.subject || '(no subject)'}`);
    }
  } finally {
    imap.close();
  }

  if (reviews.length && process.env.ADMIN_ALERT_EMAIL) {
    await sendEmail({
      to: process.env.ADMIN_ALERT_EMAIL,
      subject: `Nurj: ${reviews.length} payment email${reviews.length === 1 ? '' : 's'} need a look`,
      text: `The payment inbox agent could not confirm these on its own:\n\n${reviews.map((line) => `- ${line}`).join('\n')}\n\nReview and confirm them in the admin console: ${env.appUrl}`,
    });
  }
  return { ...tally, reviews: reviews.length };
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
    const result = await runInbox(adminClient());
    console.log('[payment-inbox]', JSON.stringify(result));
    return json(result);
  } catch (error) {
    console.error('[payment-inbox] failed', error);
    return fail(safeMessage(error), statusFor(error, 500));
  }
}
