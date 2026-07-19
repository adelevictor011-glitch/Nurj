import { assertText, fail, json, readJson, safeMessage } from './_lib/http';
import { createStructuredResponse } from './_lib/openai';
import { consumeQuota, QuotaError, refundQuota } from './_lib/quota';
import { AuthError, requireUser } from './_lib/supabase';

interface EnhanceBody {
  prompt?: unknown;
  stage?: unknown;
  business?: unknown;
}

interface EnhancedPayload {
  title: string;
  enhanced_prompt: string;
  diagnosis: string;
  changes: string[];
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    enhanced_prompt: { type: 'string' },
    diagnosis: { type: 'string' },
    changes: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'enhanced_prompt', 'diagnosis', 'changes'],
};

export async function POST(request: Request): Promise<Response> {
  let quotaConsumed = false;
  let userId = '';
  let quotaClient: Awaited<ReturnType<typeof requireUser>>['supabase'] | null = null;

  try {
    const { user, supabase } = await requireUser(request);
    userId = user.id;
    quotaClient = supabase;
    const body = await readJson<EnhanceBody>(request);
    const originalPrompt = assertText(body.prompt, 'Prompt', 6000);
    const stage = assertText(body.stage, 'Stage', 30, false);
    const business = assertText(body.business, 'Business context', 800, false);

    const quota = await consumeQuota(supabase, user.id, 'enhance');
    quotaConsumed = quota.plan === 'free';

    const result = await createStructuredResponse<EnhancedPayload>({
      name: 'nurj_prompt_enhancement',
      schema,
      instructions: `You are Nurj's prompt quality engine. Diagnose an existing prompt and rebuild it for clarity, context, control and commercial usefulness. Preserve the user's legitimate intent. Add missing role, context, output structure, constraints and success criteria. Do not insert invented facts. Do not imitate a living person's distinctive voice. Keep the enhanced prompt practical and ready to copy. Return four to six meaningful changes.`,
      input: `Original prompt:
${originalPrompt}

Business stage: ${stage || 'Not supplied'}
Saved business context: ${business || 'Not supplied'}

Return a concise title, the complete enhanced prompt, a diagnosis of the original weakness, and the meaningful changes made.`,
    });

    await supabase.from('prompt_history').insert({
      user_id: user.id,
      kind: 'enhanced',
      title: result.title,
      goal: 'Enhance an existing prompt',
      input: { original_prompt: originalPrompt, stage, business },
      output: result,
    });

    return json({ ...result, remaining: quota.remaining });
  } catch (error) {
    if (quotaConsumed && userId && quotaClient) await refundQuota(quotaClient, userId, 'enhance');
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : 400;
    return fail(safeMessage(error), status);
  }
}
