import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { classifyBusiness } from '../lib/business';
import type { UserProfile } from '../types';

interface Business {
  id: string;
  name: string;
  description: string | null;
  target_customer: string | null;
  created_at: string;
}

/**
 * Multiple businesses (roadmap feature 17). Free 1, Builder 1, Operator 3,
 * plus up to 2 extra slots at ₦5,000 per business per 30 days on a paid plan.
 * Daily AI usage is shared across the account, not per business.
 */
export function Businesses({
  profile,
  userId,
  notify,
  onSwitched,
  onBuySlot,
  buying,
}: {
  profile: UserProfile;
  userId: string | null;
  notify: (message: string) => void;
  onSwitched: () => void;
  onBuySlot: () => void;
  buying: boolean;
}) {
  const [items, setItems] = useState<Business[]>([]);
  const [allowance, setAllowance] = useState(1);
  const [addons, setAddons] = useState<Array<{ expires_at: string }>>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', target: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!userId || !supabase) return;
    const [list, allowed, slots] = await Promise.all([
      supabase.from('businesses').select('id, name, description, target_customer, created_at').order('created_at').order('id'),
      supabase.rpc('business_allowance', { p_user: userId }),
      supabase.from('business_addons').select('expires_at').gt('expires_at', new Date().toISOString()),
    ]);
    setItems((list.data ?? []) as Business[]);
    if (typeof allowed.data === 'number') setAllowance(allowed.data);
    setAddons((slots.data ?? []) as Array<{ expires_at: string }>);
  }

  useEffect(() => { void load(); }, [userId, profile.plan, profile.active_business_id]);

  async function switchTo(id: string) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('switch_business', { p_business: id });
    setBusy(false);
    if (error) { notify(error.message); return; }
    notify('Switched business. Your prompts now use its details.');
    onSwitched();
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !userId || !form.name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('businesses').insert({
      user_id: userId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      target_customer: form.target.trim() || null,
      category: form.description.trim() ? classifyBusiness(form.description) : null,
      stage: profile.stage,
    });
    setBusy(false);
    if (error) { notify(error.message.includes('limit') ? 'You have reached your business limit for this plan.' : 'The business could not be added.'); return; }
    setForm({ name: '', description: '', target: '' });
    setAdding(false);
    void load();
  }

  async function remove(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) { notify('Switch to another business before deleting this one.'); return; }
    void load();
  }

  if (!userId) return null;

  const paid = profile.plan !== 'free';
  const canAdd = items.length < allowance;
  const canBuy = paid && addons.length < 2 && !canAdd;

  return (
    <article className="panel businesses-card">
      <div className="panel-title"><div><span className="eyebrow">YOUR BUSINESSES</span><h3>{items.length} of {allowance} in use</h3></div></div>
      <p className="muted-line">Each business keeps its own details, saved prompts and wins. Daily AI usage is shared across all of them.</p>
      <ul className="business-list">
        {items.map((business, index) => {
          const active = business.id === profile.active_business_id;
          const locked = index >= allowance;
          return (
            <li key={business.id} className={active ? 'active' : locked ? 'locked' : ''}>
              <div><strong>{business.name}</strong><small>{active ? 'In use now' : locked ? 'Locked: read-only until you upgrade or add a slot' : business.description?.slice(0, 80) ?? ''}</small></div>
              {!active && !locked && <button className="copy-button" disabled={busy} onClick={() => void switchTo(business.id)}>Switch to this</button>}
              {!active && <button className="copy-button" disabled={busy} onClick={() => void remove(business.id)}>Delete</button>}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <form className="business-form" onSubmit={add}>
          <input className="field" value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Business name" aria-label="Business name" />
          <textarea className="field" value={form.description} maxLength={800} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What it sells and the result it creates" aria-label="Business description" />
          <textarea className="field" value={form.target} maxLength={800} onChange={(event) => setForm({ ...form, target: event.target.value })} placeholder="Target audience" aria-label="Target audience" />
          <div className="account-actions">
            <button className="button button-primary button-small" disabled={busy || !form.name.trim()}>Add business</button>
            <button type="button" className="button button-ghost button-small" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : canAdd ? (
        <button className="button button-secondary button-small" onClick={() => setAdding(true)}>Add a business</button>
      ) : canBuy ? (
        <div className="addon-offer">
          <p>Add another business for ₦5,000 per 30 days. You can have up to 2 extra slots.</p>
          <button className="button button-secondary button-small" disabled={buying} onClick={onBuySlot}>{buying ? 'Opening checkout…' : 'Add a business slot'}</button>
        </div>
      ) : (
        <p className="muted-line">{paid ? 'You have every business slot your plan allows.' : 'Builder and Operator can add more businesses.'}</p>
      )}
      {addons.length > 0 && <p className="muted-line">{addons.length} extra slot{addons.length === 1 ? '' : 's'} active until {new Date(addons[0].expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}.</p>}
    </article>
  );
}
