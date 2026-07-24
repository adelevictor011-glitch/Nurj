import OpenAI from 'openai';
import { env } from './_lib/env';
import { assertText, fail, json, readJson, safeMessage } from './_lib/http';
import { consumeQuota, QuotaError, refundQuota } from './_lib/quota';
import { AuthError, requireUser } from './_lib/supabase';
import { logModelUsage } from './_lib/telemetry';

let client: OpenAI | null = null;

/**
 * Runs the architected prompt and returns the actual work product.
 *
 * This is the difference between a prompt formatter and an operating layer:
 * the outcome now happens inside Nurj, so we can ask whether it worked.
 */
export async function POST(request: Request): Promise<Response> {
  let quotaConsumed = false;
  let userId = '';
  let quotaClient: Awaited<ReturnType<typeof requireUser>>['supabase'] | null = null;

  try {
    const { user, supabase } = await requireUser(request);
    userId = user.id;
    quotaClient = supabase;

    const body = await readJson<{ prompt?: unknown; historyId?: unknown }>(request);
    const prompt = assertText(body.prompt, 'Prompt', 8000);
    const historyId = assertText(body.historyId, 'History reference', 60, false);

    const quota = await consumeQuota(supabase, user.id, 'prompt');
    quotaConsumed = quota.plan === 'free';

    client ??= new OpenAI({ apiKey: env.openaiApiKey });
    const model = env.openaiModel;
    const response = await client.responses.create({
      model,
      instructions:
        'You are executing a prompt written by a Nigerian founder inside their business tool. Produce the finished work product the prompt asks for — not advice about how to produce it, and not a restatement of the prompt. Be specific and commercially usable. Use naira, WhatsApp, Instagram and local market context only where it materially improves the output. State any assumption you had to make in one short line at the end.',
      input: prompt,
    });

    const output = response.output_text?.trim();
    if (!output) throw new Error('The AI returned an empty response.');

    logModelUsage(supabase, {
      userId: user.id,
      kind: 'generate',
      usage: {
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    });

    const { data: run } = await supabase
      .from('prompt_runs')
      .insert({
        user_id: user.id,
        history_id: historyId || null,
        prompt,
        output,
      })
      .select('id')
      .maybeSingle();

    return json({ output, remaining: quota.remaining, run_id: run?.id ?? null });
  } catch (error) {
    if (quotaConsumed && userId && quotaClient) await refundQuota(quotaClient, userId, 'prompt');
    const status = error instanceof AuthError ? 401 : error instanceof QuotaError ? 429 : 400;
    return fail(safeMessage(error), status);
  }
}
