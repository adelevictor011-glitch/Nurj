import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Win {
  id: string;
  amount_kobo: number;
  note: string;
  won_on: string;
}

const PRICE_KOBO: Record<string, number> = { builder: 1_000_000, operator: 2_500_000 };

export const formatNaira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

export async function fetchWinsTotal(userId: string | null): Promise<number> {
  if (!userId || !supabase) return 0;
  const { data } = await supabase.from('wins').select('amount_kobo');
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount_kobo), 0);
}

/** "Nurj has paid for itself N times" (roadmap feature 5). Renders nothing until there are wins. */
export function RoiLine({ userId, plan }: { userId: string | null; plan: string }) {
  const [total, setTotal] = useState(0);
  useEffect(() => { void fetchWinsTotal(userId).then(setTotal); }, [userId]);
  if (!total) return null;
  const price = PRICE_KOBO[plan] ?? PRICE_KOBO.builder;
  const times = Math.floor(total / price);
  const name = plan === 'operator' ? 'Operator' : 'Builder';
  return (
    <p className="roi-line">
      You have logged {formatNaira(total)} in wins. {name} costs {formatNaira(price)} for 30 days
      {times >= 1 ? `, so Nurj has paid for itself ${times} time${times === 1 ? '' : 's'}.` : '.'}
      <small> Self-reported.</small>
    </p>
  );
}

/** Win Log (roadmap feature 5): self-reported wins in naira. */
export function WinLog({ userId, businessId, plan, notify }: { userId: string | null; businessId?: string | null; plan: string; notify: (message: string) => void }) {
  const [wins, setWins] = useState<Win[]>([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!userId || !supabase) return;
    const { data } = await supabase.from('wins').select('id, amount_kobo, note, won_on').order('won_on', { ascending: false }).order('created_at', { ascending: false }).limit(200);
    setWins((data ?? []) as Win[]);
  }

  useEffect(() => { void load(); }, [userId]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const naira = Number(amount.replace(/[₦,\s]/g, ''));
    if (!Number.isFinite(naira) || naira < 0 || !note.trim() || !supabase || !userId) return;
    setBusy(true);
    const { error } = await supabase.from('wins').insert({ user_id: userId, business_id: businessId ?? null, amount_kobo: Math.round(naira * 100), note: note.trim() });
    setBusy(false);
    if (error) { notify('The win could not be saved.'); return; }
    setAmount('');
    setNote('');
    notify('Win logged. That is the number that matters.');
    void load();
  }

  async function remove(id: string) {
    if (!supabase) return;
    await supabase.from('wins').delete().eq('id', id);
    setWins((current) => current.filter((win) => win.id !== id));
  }

  if (!userId) return null;

  const total = wins.reduce((sum, win) => sum + Number(win.amount_kobo), 0);
  const weekStart = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const thisWeek = wins.filter((win) => win.won_on >= weekStart).reduce((sum, win) => sum + Number(win.amount_kobo), 0);

  return (
    <article className="panel win-log">
      <div className="panel-title"><div><span className="eyebrow">WIN LOG</span><h3>{formatNaira(total)} logged</h3></div><span>{formatNaira(thisWeek)} in the last 7 days</span></div>
      <form className="win-form" onSubmit={add}>
        <input className="field" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="₦ amount" aria-label="Amount in naira" />
        <input className="field" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Landed a ₦90,000 client, sold 14 units…" aria-label="What happened" />
        <button className="button button-secondary button-small" disabled={busy || !amount || !note.trim()}>Log win</button>
      </form>
      {wins.length > 0 && (
        <ul className="win-list">
          {wins.slice(0, 5).map((win) => (
            <li key={win.id}><strong>{formatNaira(Number(win.amount_kobo))}</strong><span>{win.note}</span><small>{new Date(win.won_on).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</small><button className="copy-button" onClick={() => void remove(win.id)} aria-label="Delete win">×</button></li>
          ))}
        </ul>
      )}
      <RoiLineInline total={total} plan={plan} />
    </article>
  );
}

function RoiLineInline({ total, plan }: { total: number; plan: string }) {
  if (!total || plan === 'free') return null;
  const price = PRICE_KOBO[plan] ?? PRICE_KOBO.builder;
  const times = Math.floor(total / price);
  return times >= 1 ? <p className="roi-line">Nurj has paid for itself {times} time{times === 1 ? '' : 's'}. <small>Self-reported.</small></p> : null;
}
