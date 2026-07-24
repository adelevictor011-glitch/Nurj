import { activatePayment } from '../_lib/payments.js';
import { fail, json, safeMessage } from '../_lib/http.js';
import { verifyTransaction, verifyWebhookSignature } from '../_lib/paystack.js';
import { adminClient } from '../_lib/supabase.js';

interface PaystackEvent {
  event?: string;
  data?: { reference?: string };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    if (!verifyWebhookSignature(rawBody, request.headers.get('x-paystack-signature'))) {
      return fail('Invalid webhook signature.', 401);
    }

    const event = JSON.parse(rawBody) as PaystackEvent;
    if (event.event !== 'charge.success' || !event.data?.reference) return json({ received: true });

    const supabase = adminClient();
    const transaction = await verifyTransaction(event.data.reference);
    await activatePayment(supabase, event.data.reference, transaction);
    return json({ received: true });
  } catch (error) {
    return fail(safeMessage(error), 400);
  }
}
