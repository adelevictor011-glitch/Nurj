import { assertText, fail, json, readJson, safeMessage } from './_lib/http';
import { AuthError, requireUser } from './_lib/supabase';

/**
 * "Did this actually work?" — one question, and the only data in this product
 * that a competitor cannot clone in a weekend.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readJson<{ runId?: unknown; historyId?: unknown; worked?: unknown; note?: unknown }>(request);

    if (typeof body.worked !== 'boolean') throw new Error('A yes or no answer is required.');
    const runId = assertText(body.runId, 'Run reference', 60, false);
    const historyId = assertText(body.historyId, 'History reference', 60, false);
    const note = assertText(body.note, 'Note', 600, false);

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_category, stage')
      .eq('id', user.id)
      .maybeSingle();

    const { error } = await supabase.from('outcomes').upsert(
      {
        user_id: user.id,
        run_id: runId || null,
        history_id: historyId || null,
        worked: body.worked,
        note: note || null,
        business_category: profile?.business_category ?? null,
        stage: profile?.stage ?? null,
      },
      { onConflict: 'user_id,run_id' },
    );
    if (error) throw new Error('Your feedback could not be saved.');

    return json({ recorded: true });
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 400);
  }
}
