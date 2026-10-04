import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && publishableKey && !url.includes('YOUR_PROJECT')
    ? createClient(url, publishableKey, {
        // Database calls give up after 20s instead of leaving a button spinning.
        global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined) }) },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isSupabaseConfigured = Boolean(supabase);
