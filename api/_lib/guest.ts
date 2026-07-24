import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Turns a request into a stable, non-reversible daily identifier.
 * The raw IP never touches the database.
 */
export function guestFingerprint(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`${env.guestIpSalt}:${ip}`).digest('hex');
}

export class GuestQuotaError extends Error {}

export async function consumeGuestQuota(supabase: SupabaseClient, ipHash: string) {
  const { data, error } = await supabase.rpc('consume_guest_quota', { p_ip_hash: ipHash });
  if (error) throw new Error('Usage could not be checked.');
  const result = data as { allowed: boolean; remaining: number; limit: number };
  if (!result.allowed) {
    throw new GuestQuotaError('You have used your free preview. Sign in with Google to keep building — it is still free.');
  }
  return result;
}

export async function refundGuestQuota(supabase: SupabaseClient, ipHash: string) {
  await supabase.rpc('refund_guest_quota', { p_ip_hash: ipHash });
}
