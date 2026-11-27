import { supabase } from './supabase';
import type { EnhanceResult, GenerateResult, PromptHistoryItem, UsageStatus, UserProfile } from '../types';

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// AI calls can take a while; anything slower than this is treated as stuck so
// buttons never spin forever.
const REQUEST_TIMEOUT_MS = 75_000;

async function request<T>(path: string, init: RequestInit = {}, anonymous = false): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. Check your connection and try again.');
  }
  const token = anonymous ? null : await accessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) throw new Error('This is taking longer than usual. Please try again.');
    throw new Error('Could not reach Nurj. Check your connection and try again.', { cause: error });
  }

  try {
    const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
    if (!response.ok) {
      if (response.status === 504 || response.status === 502) throw new Error('This is taking longer than usual. Please try again.');
      throw new Error(payload.error || 'The request could not be completed.');
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export interface SectorInsights {
  category: string;
  min_reports: number;
  total_reports: number;
  sector_worked_pct: number | null;
  goals: Array<{ goal: string; reports: number; worked_pct: number }>;
  closest_goal: { goal: string; reports: number } | null;
}

export interface StatusResponse {
  insights?: SectorInsights | null;
  admin?: boolean;
  profile: UserProfile;
  usage: UsageStatus;
  history: PromptHistoryItem[];
}

export const api = {
  status: () => request<StatusResponse>('/api/status'),
  generate: (body: Record<string, unknown>) =>
    request<GenerateResult>('/api/generate', { method: 'POST', body: JSON.stringify(body) }),
  generateGuest: (body: Record<string, unknown>) =>
    request<GenerateResult & { guest: true }>(
      '/api/guest/generate',
      { method: 'POST', body: JSON.stringify(body) },
      true,
    ),
  execute: (prompt: string, historyId?: string | null) =>
    request<{ output: string; remaining: number | null; run_id: string | null }>('/api/execute', {
      method: 'POST',
      body: JSON.stringify({ prompt, historyId: historyId ?? null }),
    }),
  recordOutcome: (body: { runId: string | null; historyId?: string | null; worked: boolean; note?: string }) =>
    request<{ recorded: true }>('/api/outcome', { method: 'POST', body: JSON.stringify(body) }),
  enhance: (body: Record<string, unknown>) =>
    request<EnhanceResult>('/api/enhance', { method: 'POST', body: JSON.stringify(body) }),
  refine: (body: { prompt: string; output: string; complaint: string }) =>
    request<EnhanceResult>('/api/enhance', { method: 'POST', body: JSON.stringify({ mode: 'refine', ...body }) }),
  channel: (text: string, channel: string) =>
    request<ChannelResult>('/api/enhance', { method: 'POST', body: JSON.stringify({ mode: 'channel', text, channel }) }),
  priceScript: (body: { product: string; oldPrice: string; newPrice: string; reason: string; channel: string }) =>
    request<ChannelResult>('/api/enhance', { method: 'POST', body: JSON.stringify({ mode: 'script', ...body }) }),
  pack: () => request<PromptPack>('/api/enhance', { method: 'POST', body: JSON.stringify({ mode: 'pack' }) }),
  initializePayment: (plan: 'builder' | 'operator' | 'business_addon') =>
    request<{ authorization_url: string; reference: string }>('/api/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),
  verifyPayment: (reference: string) =>
    request<{ activated: boolean; plan: 'builder' | 'operator' | 'business_addon'; expires_at?: string; needs_refund?: boolean; reason?: string }>(
      `/api/payments/verify?reference=${encodeURIComponent(reference)}`,
    ),
  startTransfer: (plan: 'builder' | 'operator' | 'business_addon') =>
    request<TransferCheckout>('/api/payments/transfer', { method: 'POST', body: JSON.stringify({ plan }) }),
  transferStatus: (reference: string) =>
    request<TransferStatus>(`/api/payments/transfer?reference=${encodeURIComponent(reference)}`),
  adminTransfer: (body: { action: 'confirm_transfer' | 'reject_transfer' | 'dismiss_message'; reference?: string; message_id?: string; note?: string }) =>
    request<{ activated?: boolean; needs_refund?: boolean; reason?: string; rejected?: boolean; dismissed?: boolean }>('/api/admin', { method: 'POST', body: JSON.stringify(body) }),
  account: () => request<{ refund: RefundStatus }>('/api/account'),
  admin: () => request<AdminData>('/api/admin'),
  adminGrant: (body: { email: string; plan: string; days: number; note: string }) =>
    request<{ email: string; plan: string; expires_at: string | null }>('/api/admin', { method: 'POST', body: JSON.stringify(body) }),
  acceptTerms: (version: string) =>
    request<{ terms_version: string; terms_accepted_at: string }>('/api/account', {
      method: 'POST',
      body: JSON.stringify({ action: 'consent', version }),
    }),
  requestRefund: (reason: string) =>
    request<{ status: 'refunded' | 'pending'; message: string }>('/api/account', {
      method: 'POST',
      body: JSON.stringify({ action: 'refund', reason }),
    }),
  deleteAccount: () =>
    request<{ deleted: true }>('/api/account', { method: 'POST', body: JSON.stringify({ action: 'delete', confirm: 'DELETE' }) }),
  async exportData(): Promise<Blob> {
    const token = await accessToken();
    const response = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: 'export' }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || 'Your data could not be exported.');
    }
    return response.blob();
  },
};

export type RefundStatus =
  | { eligible: true; amount: number; plan: string; deadline: string }
  | { eligible: false; reason: string };

export interface AdminGrowth {
  funnel: {
    signups_30d: number; first_prompt_10min_pct: number | null; paid_pct_of_mature: number | null;
    free_users_hitting_limit_7d: number; enhancer_tried_pct_free: number | null;
    renewals_30d: number; renewals_failed_30d: number; auto_renew_off: number;
  };
  by_source: Array<{ source: string; signups: number; paid: number }>;
  heard_from: Array<{ answer: string; count: number }>;
}

export interface AdminData {
  growth?: AdminGrowth | null;
  overview: {
    users_total: number;
    users_new_7d: number;
    builder_active: number;
    operator_active: number;
    ever_paid: number;
    revenue_30d_kobo: number;
    refunds_30d_kobo: number;
    refunds_pending: number;
    tokens_today: number;
    tokens_30d: number;
    categories: Array<{ name: string; count: number }>;
    stages: Array<{ name: string; count: number }>;
    goals_30d: Array<{ goal: string; count: number }>;
    top_ai_users_30d: Array<{ email: string; plan: string; calls: number; tokens: number }>;
  };
  wrap: Array<{ week_start: string; active_users: number; previous_active: number; retained_users: number; wrap: number | null }>;
  grants: Array<{ target_email: string; plan: string; days: number; granted_by: string; note: string | null; created_at: string }>;
  features: {
    saved_prompts: number;
    wins_logged: number;
    wins_total_kobo: number;
    businesses: number;
    active_addons: number;
    digest_opted_out: number;
    payments_needing_refund: number;
  } | null;
  insights: Array<{ category: string; reports: number; live_goals: number; best_goal_reports: number | null }> | null;
  financials?: AdminFinancials | null;
  transfers?: AdminTransfer[] | null;
  transfer_reviews?: AdminTransferReview[] | null;
}

export interface TransferCheckout {
  reference: string;
  plan: 'builder' | 'operator' | 'business_addon';
  plan_label: string;
  amount_kobo: number;
  token: string;
  status: string;
  proof_received: boolean;
  expires_at: string;
  bank: { name: string; account_number: string; account_name: string };
  proof_email: string;
}

export interface TransferStatus {
  status: string;
  plan: string;
  proof_received: boolean;
  plan_expires_at: string | null;
}

export interface AdminFinancialDay {
  day: string;
  signups: number;
  active_users: number;
  prompts: number;
  enhancements: number;
  ai_tokens: number;
  card_kobo: number;
  transfer_kobo: number;
  payments: number;
  renewals: number;
  refunds_kobo: number;
}

export interface AdminFinancials {
  days: AdminFinancialDay[];
  run_rate_kobo: number;
  transfers_pending: number;
  inbox_needs_review: number;
  ai_cost_ngn_per_million: number | null;
}

export interface AdminTransfer {
  reference: string;
  plan: string;
  amount_kobo: number;
  status: string;
  token: string;
  email: string | null;
  created_at: string;
  expires_at: string;
  proof_received_at: string | null;
}

export interface AdminTransferReview {
  message_id: string;
  kind: 'bank_alert' | 'proof' | 'other';
  from_address: string | null;
  subject: string | null;
  received_at: string | null;
  token: string | null;
  amount_kobo: number | null;
  authenticated: boolean;
  detail: string | null;
  payment_reference: string | null;
}

export interface ChannelResult {
  channel: string;
  limit: number;
  subject: string;
  text: string;
  remaining?: number | null;
}

export interface PromptPack {
  title: string;
  month: string;
  prompts: Array<{ title: string; use_when: string; prompt: string }>;
}
