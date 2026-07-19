import { activatePayment } from '../_lib/payments';
import { fail, json, safeMessage } from '../_lib/http';
import { verifyTransaction } from '../_lib/paystack';
import { AuthError, requireUser } from '../_lib/supabase';

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const reference = new URL(request.url).searchParams.get('reference')?.trim();
    if (!reference || reference.length > 160) throw new Error('A valid transaction reference is required.');

    const { data: payment } = await supabase.from('payments').select('user_id').eq('reference', reference).maybeSingle();
    if (!payment || payment.user_id !== user.id) throw new Error('This payment does not belong to your account.');

    const transaction = await verifyTransaction(reference);
    const activation = await activatePayment(supabase, reference, transaction);
    return json(activation);
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 400);
  }
}
