// Where each user came from: a tracked link (?ref=tiktok) and an optional
// "Where did you hear about Nurj?" answer. Both are kept on this device until
// the person signs in, then saved once on their profile.
import type { SupabaseClient } from '@supabase/supabase-js';

const REF_KEY = 'nurj_ref';
const HEARD_KEY = 'nurj_heard';
export const ATTRIBUTION_EVENT = 'nurj-attribution';

export const HEARD_OPTIONS = [
  'TikTok', 'Instagram', 'X (Twitter)', 'YouTube', 'WhatsApp', 'LinkedIn', 'A friend or family member',
  'A community or group', 'Google search', 'An AI assistant (ChatGPT, Claude, etc.)', 'Somewhere else',
] as const;

function store(key: string, value?: string): string | null {
  try {
    if (value === undefined) return window.localStorage.getItem(key);
    window.localStorage.setItem(key, value);
  } catch { /* private mode: attribution is best-effort */ }
  return value ?? null;
}

/** First touch wins: the first ?ref= this device saw is the one we keep. */
export function captureRef(search = typeof window === 'undefined' ? '' : window.location.search): string | null {
  const params = new URLSearchParams(search);
  const raw = (params.get('ref') ?? params.get('utm_source') ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (raw && !store(REF_KEY)) store(REF_KEY, raw);
  return store(REF_KEY);
}

export function setHeardFrom(answer: string) {
  if (!answer) return;
  store(HEARD_KEY, answer.slice(0, 80));
  try { window.dispatchEvent(new Event(ATTRIBUTION_EVENT)); } catch { /* ignore */ }
}

/** Saves what this device knows onto the profile, only where the profile is still blank. */
export async function syncAttribution(
  supabase: SupabaseClient, userId: string, profile: { referral_source?: string | null; heard_from?: string | null },
): Promise<{ referral_source?: string; heard_from?: string } | null> {
  const update: { referral_source?: string; heard_from?: string } = {};
  const ref = store(REF_KEY);
  const heard = store(HEARD_KEY);
  if (ref && !profile.referral_source) update.referral_source = ref;
  if (heard && !profile.heard_from) update.heard_from = heard;
  if (!Object.keys(update).length) return null;
  const { error } = await supabase.from('profiles').update(update).eq('id', userId);
  return error ? null : update;
}
