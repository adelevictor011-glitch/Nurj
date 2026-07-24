import { env } from '../_lib/env';
import { fail, json, safeMessage } from '../_lib/http';
import { adminClient } from '../_lib/supabase';

/**
 * Runs daily via Vercel Cron. Reaches the customer whose access ends in three
 * days — previously the only signal was getting blocked mid-task.
 *
 * If RESEND_API_KEY is absent the job still runs and reports who is due, so
 * you can send manually until an email provider is connected.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
      return fail('Unauthorized.', 401);
    }

    const supabase = adminClient();
    const windowStart = new Date();
    const windowEnd = new Date(Date.now() + 3 * 86_400_000);

    const { data: due, error } = await supabase
      .from('profiles')
      .select('id, display_name, plan, plan_expires_at, expiry_reminded_at')
      .neq('plan', 'free')
      .gt('plan_expires_at', windowStart.toISOString())
      .lte('plan_expires_at', windowEnd.toISOString())
      .is('expiry_reminded_at', null);

    if (error) throw new Error('Expiring accounts could not be read.');
    const rows = due ?? [];
    if (!rows.length) return json({ checked: 0, sent: 0 });

    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.REMINDER_FROM_EMAIL;
    let sent = 0;

    for (const row of rows) {
      let delivered = false;

      if (resendKey && from) {
        const { data: authUser } = await supabase.auth.admin.getUserById(row.id);
        const email = authUser?.user?.email;
        if (email) {
          const expires = new Date(row.plan_expires_at as string).toLocaleDateString('en-NG', {
            day: 'numeric', month: 'long', year: 'numeric',
          });
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from,
              to: email,
              subject: 'Your Nurj access ends in 3 days',
              text: `Hi ${row.display_name ?? 'there'},\n\nYour Nurj ${row.plan === 'builder' ? 'Builder' : 'Operator'} access ends on ${expires}.\n\nRenewing keeps the daily limits off and your saved history exactly where it is: ${env.appUrl}\n\nIf you would rather pause, nothing happens automatically — you simply move back to the free plan.\n\n— Nurj`,
            }),
          });
          delivered = response.ok;
        }
      }

      await supabase
        .from('profiles')
        .update({ expiry_reminded_at: new Date().toISOString() })
        .eq('id', row.id);

      if (delivered) sent += 1;
    }

    return json({ checked: rows.length, sent, emailConfigured: Boolean(resendKey && from) });
  } catch (error) {
    return fail(safeMessage(error), 500);
  }
}
