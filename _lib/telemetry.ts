import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fire-and-forget cost logging. Never allowed to fail a user-facing request.
 */
export function logModelUsage(
  supabase: SupabaseClient,
  entry: {
    userId: string | null;
    kind: 'generate' | 'enhance' | 'guest_generate';
    usage: { model: string; inputTokens: number; outputTokens: number; totalTokens: number };
  },
) {
  void supabase
    .from('model_usage')
    .insert({
      user_id: entry.userId,
      kind: entry.kind,
      model: entry.usage.model,
      input_tokens: entry.usage.inputTokens,
      output_tokens: entry.usage.outputTokens,
      total_tokens: entry.usage.totalTokens,
    })
    .then(({ error }) => {
      if (error) console.error('[telemetry] model_usage insert failed', error.message);
    });
}
