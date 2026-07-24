import { assertText, fail, json, readJson, safeMessage } from '../_lib/http';
import { consumeGuestQuota, guestFingerprint, GuestQuotaError, refundGuestQuota } from '../_lib/guest';
import { createStructuredResponse } from '../_lib/openai';
import { buildGenerateInput, generateSchema, GENERATE_INSTRUCTIONS, type GeneratedPayload } from '../_lib/prompts';
import { adminClient } from '../_lib/supabase';
import { logModelUsage } from '../_lib/telemetry';

interface GuestBody {
  goal?: unknown;
  business?: unknown;
  customer?: unknown;
  context?: unknown;
  mentor?: unknown;
  stage?: unknown;
  category?: unknown;
}

/**
 * One real generation per IP per day, no account required.
 *
 * The old guest path returned a hard-coded string template behind a fake
 * loading animation. A stranger's only impression of Nurj was a mail merge.
 * This gives them the actual product once, then asks them to sign in.
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = adminClient();
  let fingerprint = '';
  let consumed = false;

  try {
    fingerprint = guestFingerprint(request);
    const body = await readJson<GuestBody>(request);
    const goal = assertText(body.goal, 'Goal', 240);
    const business = assertText(body.business, 'Business', 800);
    const customer = assertText(body.customer, 'Target customer', 800);
    const context = assertText(body.context, 'Context', 1200, false);
    const mentor = assertText(body.mentor, 'Strategic influence', 300, false);
    const stage = assertText(body.stage, 'Stage', 30, false) || 'launch';
    const category = assertText(body.category, 'Category', 40, false);

    await consumeGuestQuota(supabase, fingerprint);
    consumed = true;

    const { data: result, usage } = await createStructuredResponse<GeneratedPayload>({
      name: 'nurj_prompt_architecture',
      schema: generateSchema,
      instructions: GENERATE_INSTRUCTIONS,
      input: buildGenerateInput({ stage, goal, business, customer, context, mentor, category }),
    });

    logModelUsage(supabase, { userId: null, kind: 'guest_generate', usage });

    return json({ ...result, remaining: 0, guest: true });
  } catch (error) {
    if (consumed && fingerprint && !(error instanceof GuestQuotaError)) {
      await refundGuestQuota(supabase, fingerprint);
    }
    return fail(safeMessage(error), error instanceof GuestQuotaError ? 429 : 400);
  }
}
