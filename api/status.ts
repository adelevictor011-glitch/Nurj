import { AuthError, requireUser } from './_lib/supabase.js';
import { fail, json, safeMessage } from './_lib/http.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, supabase } = await requireUser(request);
    const today = new Date().toISOString().slice(0, 10);

    const [profileResult, usageResult, historyResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('daily_usage').select('prompt_count, enhance_count').eq('user_id', user.id).eq('usage_date', today).maybeSingle(),
      supabase.from('prompt_history').select('id, kind, title, goal, output, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    ]);

    // Self-heal: if the on_auth_user_created trigger never fired, create the
    // row now instead of permanently bricking the account.
    let profile = profileResult.data;
    if (profileResult.error || !profile) {
      const fallbackName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split('@')[0] ??
        'Builder';
      const { data: healed, error: healError } = await supabase.rpc('ensure_profile', {
        p_user_id: user.id,
        p_display_name: fallbackName,
      });
      if (healError || !healed) throw new Error('Your profile could not be loaded.');
      profile = healed;
    }
    const expired = profile.plan !== 'free' && (!profile.plan_expires_at || new Date(profile.plan_expires_at) <= new Date());
    if (expired) {
      const { data: downgraded } = await supabase
        .from('profiles')
        .update({ plan: 'free', plan_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('*')
        .single();
      if (downgraded) profile = downgraded;
    }
    const paid = profile.plan !== 'free' && Boolean(profile.plan_expires_at) && new Date(profile.plan_expires_at) > new Date();
    const promptUsed = usageResult.data?.prompt_count ?? 0;
    const enhanceUsed = usageResult.data?.enhance_count ?? 0;

    return json({
      profile,
      usage: {
        prompt: { used: promptUsed, limit: paid ? null : 5, remaining: paid ? null : Math.max(0, 5 - promptUsed) },
        enhance: { used: enhanceUsed, limit: paid ? null : 3, remaining: paid ? null : Math.max(0, 3 - enhanceUsed) },
      },
      history: historyResult.data ?? [],
    });
  } catch (error) {
    return fail(safeMessage(error), error instanceof AuthError ? 401 : 500);
  }
}
