import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

function isValidSupabaseUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    // Must be HTTPS and must be a supabase.co domain
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

export const supabase: SupabaseClient | null =
  url && publishableKey && isValidSupabaseUrl(url)
    ? createClient(url, publishableKey, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isSupabaseConfigured = Boolean(supabase);
