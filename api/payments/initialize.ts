import { randomUUID } from 'node:crypto';
import { env } from '../_lib/env';
import { fail, json, readJson, safeMessage } from '../_lib/http';
import { initializeTransaction, PLANS, type PaidPlan } from '../_lib/paystack';
import { AuthError, requireUser } from '../_lib/supabase';

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readJson<{ plan?: unknown }>(request);
    if (body.plan !== 'builder' && body.plan !== 'operator') throw new Error('Choose a valid plan.');
    const plan = body.plan as PaidPlan;
    const planConfig = PLANS[plan];
    if (!user.email) throw new Error('Your account needs an email address before checkout.');

    const reference = `nurj-${plan}-${randomUUID().replaceAll('-', '')}`;
    const { error } = await supabase.from('payments').insert({
      user_id: user.id,
      reference,
      plan,
      amount: planConfig.amount,
      currency: 'NGN',
      status: 'initialized',
    });
    if (error) throw new Error('The payment record could not be created.');

    const transaction = await initializeTransaction({
      email: user.email,
      amount: String(planConfig.amount),
      currency: 'NGN',
      reference,
      callback_url: `${env.appUrl}/?reference=${encodeURIComponent(reference)}`,
      metadata: JSON.stringify({ user_id: user.id, plan, product: 'nurj_access_30_days' }),
    });

    return json({ authorization_url: transaction.authorization_url, reference: transaction.reference });
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 400);
  }
}
