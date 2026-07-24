import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS, type PaidPlan } from './paystack';

export async function activatePayment(supabase: SupabaseClient, reference: string, transaction: {
  status: string;
  amount: number;
  currency: string;
  paid_at: string | null;
}) {
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('user_id, plan, amount, currency, status')
    .eq('reference', reference)
    .maybeSingle();

  if (paymentError || !payment) throw new Error('Payment record was not found.');
  const plan = payment.plan as PaidPlan;
  const expected = PLANS[plan];
  if (!expected || transaction.status !== 'success' || transaction.amount !== expected.amount || transaction.amount !== payment.amount || transaction.currency !== 'NGN') {
    throw new Error('The verified transaction does not match the selected Nurj plan.');
  }

  const { data, error } = await supabase.rpc('activate_verified_payment', {
    p_reference: reference,
    p_paid_at: transaction.paid_at,
  });
  if (error) throw new Error('The plan could not be activated.');
  return data as { activated: boolean; plan: PaidPlan; expires_at: string };
}
