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
  initializePayment: (plan: 'builder' | 'operator') =>
    request<{ authorization_url: string; reference: string }>('/api/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),
  verifyPayment: (reference: string) =>
    request<{ activated: boolean; plan: 'builder' | 'operator'; expires_at: string }>(
      `/api/payments/verify?reference=${encodeURIComponent(reference)}`,
    ),
};
