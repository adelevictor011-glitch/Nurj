import { assertText, fail, json, readJson, safeMessage } from './_lib/http';
import { createStructuredResponse } from './_lib/openai';
import { consumeQuota, QuotaError, refundQuota } from './_lib/quota';
import { AuthError, requireUser } from './_lib/supabase';

interface GenerateBody {
  goal?: unknown;
  business?: unknown;
  customer?: unknown;
  context?: unknown;
  mentor?: unknown;
  stage?: unknown;
}

interface GeneratedPayload {
  title: string;
  prompt: string;
  why_it_works: string;
  next_action: string;
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    prompt: { type: 'string' },
    why_it_works: { type: 'string' },
    next_action: { type: 'string' },
  },
  required: ['title', 'prompt', 'why_it_works', 'next_action'],
};

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

    const quota = await consumeQuota(supabase, user.id, 'prompt');
    quotaConsumed = true;

    const result = await createStructuredResponse<GeneratedPayload>({
      name: 'nurj_prompt_architecture',
      schema,
      instructions: `You are Nurj, a commercially rigorous prompt architect for Nigerian founders and side-hustle operators. Your job is to write the prompt the user should give another capable AI—not to complete the business task itself.

Build prompts with a precise expert role, concrete business context, exact objective, useful output format, quality constraints, Nigerian market context only when relevant, and one immediate execution endpoint. Do not imitate a living person's distinctive voice. You may apply broadly known principles associated with an expert, but state them as principles. Avoid generic motivation, stereotypes, fabricated data and unnecessary length. The final prompt must be ready to copy and use.`,
      input: `Growth stage: ${stage}
Goal: ${goal}
Business: ${business}
Target customer: ${customer}
Task context: ${context || 'No extra context supplied.'}
Strategic influence: ${mentor || 'None supplied.'}

Create a title, the complete prompt, a concise explanation of why it works, and one next action the founder can complete today.`,
    });

    const output = { ...result, remaining: quota.remaining };
    await Promise.all([
      supabase.from('prompt_history').insert({
        user_id: user.id,
        kind: 'generated',
        title: result.title,
        goal,
        input: { business, customer, context, mentor, stage },
        output: result,
      }),
      supabase.from('profiles').update({
        business_description: business,
        target_customer: customer,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', user.id),
    ]);

    return json(output);
  } catch (error) {
    if (quotaConsumed && userId && quotaClient) await refundQuota(quotaClient, userId, 'prompt');
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : 400;
    return fail(safeMessage(error), status);
  }
}
