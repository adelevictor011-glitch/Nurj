import { supabase } from './supabase';
import type { EnhanceResult, GenerateResult, PromptHistoryItem, UsageStatus, UserProfile } from '../types';

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(path: string, init: RequestInit = {}, anonymous = false): Promise<T> {
  const token = anonymous ? null : await accessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

export interface StatusResponse {
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
    request<{ activated: boolean; plan: 'builder' | 'operator' | 'business_addon'; expires_at: string }>(
      `/api/payments/verify?reference=${encodeURIComponent(reference)}`,
    ),
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

export interface AdminData {
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
