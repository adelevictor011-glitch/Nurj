import { assertText, fail, json, readJson, safeMessage } from './_lib/http';
import { createStructuredResponse } from './_lib/openai';
import { buildGenerateInput, generateSchema, GENERATE_INSTRUCTIONS, type GeneratedPayload } from './_lib/prompts';
import { consumeQuota, QuotaError, refundQuota } from './_lib/quota';
import { AuthError, requireUser } from './_lib/supabase';
import { logModelUsage } from './_lib/telemetry';

interface GenerateBody {
  goal?: unknown;
  business?: unknown;
  customer?: unknown;
  context?: unknown;
  mentor?: unknown;
  stage?: unknown;
  category?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let quotaConsumed = false;
  let userId = '';
  let quotaClient: Awaited<ReturnType<typeof requireUser>>['supabase'] | null = null;

  try {
    const { user, supabase } = await requireUser(request);
    userId = user.id;
    quotaClient = supabase;
    const body = await readJson<GenerateBody>(request);
    const goal = assertText(body.goal, 'Goal', 240);
    const business = assertText(body.business, 'Business', 800);
    const customer = assertText(body.customer, 'Target customer', 800);
    const context = assertText(body.context, 'Context', 1800, false);
    const mentor = assertText(body.mentor, 'Strategic influence', 300, false);
    const stage = assertText(body.stage, 'Stage', 30);
    const category = assertText(body.category, 'Category', 40, false);

    const quota = await consumeQuota(supabase, user.id, 'prompt');
    quotaConsumed = quota.plan === 'free';

    const { data: result, usage } = await createStructuredResponse<GeneratedPayload>({
      name: 'nurj_prompt_architecture',
      schema: generateSchema,
      instructions: GENERATE_INSTRUCTIONS,
      input: buildGenerateInput({ stage, goal, business, customer, context, mentor, category }),
    });

    // The expensive call has already succeeded. Nothing below this line is
    // allowed to take the result away from the user.
    logModelUsage(supabase, { userId: user.id, kind: 'generate', usage });

    void supabase
      .from('prompt_history')
      .insert({
        user_id: user.id,
        kind: 'generated',
        title: result.title,
        goal,
        input: { business, customer, context, mentor, stage, category },
        output: result,
      })
      .then(({ error }) => {
        if (error) console.error('[generate] history insert failed', error.message);
      });

    void supabase
      .from('profiles')
      .update({
        business_description: business,
        target_customer: customer,
        ...(category ? { business_category: category } : {}),
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) console.error('[generate] profile update failed', error.message);
      });

    return json({ ...result, remaining: quota.remaining });
  } catch (error) {
    if (quotaConsumed && userId && quotaClient) await refundQuota(quotaClient, userId, 'prompt');
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : 400;
    return fail(safeMessage(error), status);
  }
}
