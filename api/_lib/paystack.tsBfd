import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

export const PLANS = {
  builder: { amount: 1_000_000, label: 'Builder' },
  operator: { amount: 2_500_000, label: 'Operator' },
} as const;

export type PaidPlan = keyof typeof PLANS;

async function paystack<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.paystackSecretKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json()) as { status: boolean; message: string; data: T };
  if (!response.ok || !payload.status) throw new Error(payload.message || 'Paystack request failed.');
  return payload.data;
}

export function initializeTransaction(body: Record<string, unknown>) {
  return paystack<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function verifyTransaction(reference: string) {
  return paystack<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    customer: { email: string };
    metadata?: Record<string, unknown>;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac('sha512', env.paystackSecretKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
