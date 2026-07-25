import type { SupabaseClient } from '@supabase/supabase-js';

export interface QuotaResult {
  allowed: boolean;
  plan: string;
  used: number;
  remaining: number | null;
  limit?: number;
}

export async function consumeQuota(supabase: SupabaseClient, userId: string, kind: 'prompt' | 'enhance') {
  const { data, error } = await supabase.rpc('consume_daily_quota', {
    p_user_id: userId,
    p_kind: kind,
  });
  if (error) throw new Error('Usage could not be checked.');
  const result = data as QuotaResult;
  if (!result.allowed) {
    const label = kind === 'prompt' ? 'prompts' : 'enhancements';
    throw new QuotaError(`You have used today’s free ${label}. Upgrade to keep building.`);
  }
  return result;
}

export async function refundQuota(supabase: SupabaseClient, userId: string, kind: 'prompt' | 'enhance') {
  await supabase.rpc('refund_daily_quota', { p_user_id: userId, p_kind: kind });
}

export class QuotaError extends Error {}
