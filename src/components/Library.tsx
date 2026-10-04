import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { api, type PromptPack } from '../lib/api';
import type { UserProfile } from '../types';
import { SaveToLibrary } from './SaveToLibrary';

interface SavedPrompt {
  id: string;
  business_id: string | null;
  title: string;
  prompt: string;
  tags: string[];
  source: string;
  created_at: string;
}

const CACHE_KEY = 'nurj-library-cache-v1';
const LIMITS: Record<string, number | null> = { free: 10, builder: 200, operator: null };

function OperatorPack({ profile, userId, notify, onUpgrade }: { profile: UserProfile; userId: string | null; notify: (message: string) => void; onUpgrade: () => void }) {
  const [pack, setPack] = useState<PromptPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const operator = profile.plan === 'operator';

  useEffect(() => {
    if (!operator || !open || pack) return;
    api.pack().then(setPack).catch((packError) => setError(packError instanceof Error ? packError.message : 'The pack could not be loaded.'));
  }, [operator, open, pack]);

  if (!operator) {
    return (
      <article className="panel pack-card locked">
        <span className="eyebrow">OPERATOR MONTHLY PACK</span>
        <h3>Six fresh prompts for your sector, every month.</h3>
        <p>Operator members get a pack written for their business sector and stage, plus unlimited daily runs and up to 3 businesses.</p>
        <button className="button button-secondary button-small" onClick={onUpgrade}>See Operator</button>
      </article>
    );
  }

  return (
    <article className="panel pack-card">
      <div className="panel-title"><div><span className="eyebrow">OPERATOR MONTHLY PACK</span><h3>{pack?.title ?? 'This month’s prompts for your sector'}</h3></div>
        <button onClick={() => setOpen((value) => !value)}>{open ? 'Hide' : 'Open pack'}</button></div>
      {open && !pack && !error && <p className="muted-line">Preparing this month's pack…</p>}
      {error && <p className="muted-line">{error}</p>}
      {open && pack && (
        <div className="pack-list">
          {pack.prompts.map((item) => (
            <div key={item.title} className="pack-item">
              <strong>{item.title}</strong>
              <small>{item.use_when}</small>
              <pre>{item.prompt}</pre>
              <div className="canvas-footer">
                <button className="copy-button" onClick={() => { void navigator.clipboard.writeText(item.prompt); notify('Prompt copied.'); }}>Copy</button>
                <SaveToLibrary prompt={item.prompt} defaultTitle={item.title} source="pack" userId={userId} businessId={profile.active_business_id} notify={notify} />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function Library({
  profile,
  userId,
  notify,
  onUpgrade,
  renderRun,
}: {
  profile: UserProfile;
  userId: string | null;
  notify: (message: string) => void;
  onUpgrade: () => void;
  renderRun: (prompt: string) => ReactNode;
}) {
  const [items, setItems] = useState<SavedPrompt[]>(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as SavedPrompt[]; } catch { return []; }
  });
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [scope, setScope] = useState<'business' | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; tags: string } | null>(null);
  const [offline, setOffline] = useState(false);

  async function load() {
    if (!userId || !supabase) return;
    const { data, error } = await supabase
      .from('saved_prompts')
      .select('id, business_id, title, prompt, tags, source, created_at')
      .order('updated_at', { ascending: false });
    if (error) {
      setOffline(true);
      return;
    }
    setOffline(false);
    setItems((data ?? []) as SavedPrompt[]);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data ?? [])); } catch { /* storage full */ }
  }

  useEffect(() => { void load(); }, [userId]);

  const tags = useMemo(() => Array.from(new Set(items.flatMap((item) => item.tags))).sort(), [items]);
  const visible = items.filter((item) => {
    if (scope === 'business' && profile.active_business_id && item.business_id !== profile.active_business_id) return false;
    if (tag && !item.tags.includes(tag)) return false;
    const q = query.trim().toLowerCase();
    return !q || item.title.toLowerCase().includes(q) || item.prompt.toLowerCase().includes(q);
  });
  const limit = LIMITS[profile.plan] ?? null;

  async function remove(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('saved_prompts').delete().eq('id', id);
    if (error) { notify('Could not delete. Check your connection.'); return; }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function saveEdit() {
    if (!editing || !supabase) return;
    const tagList = editing.tags.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    const { error } = await supabase.from('saved_prompts').update({ title: editing.title.trim() || 'Saved prompt', tags: tagList, updated_at: new Date().toISOString() }).eq('id', editing.id);
    if (error) { notify('Could not save the change.'); return; }
    setItems((current) => current.map((item) => item.id === editing.id ? { ...item, title: editing.title.trim() || 'Saved prompt', tags: tagList } : item));
    setEditing(null);
  }

  if (!userId) {
    return (
      <div className="screen-stack">
        <section className="screen-heading"><div><span className="eyebrow">PROMPT LIBRARY</span><h1>Keep the prompts that work.</h1><p>Sign in to save prompts, tag them and run them again.</p></div></section>
      </div>
    );
  }

  return (
    <div className="screen-stack library-screen">
      <section className="screen-heading">
        <div><span className="eyebrow">PROMPT LIBRARY</span><h1>Keep the prompts that work.</h1><p>Copying and searching are free. Running or improving a prompt counts toward your daily usage.</p></div>
        <div className="usage-pill"><span>{items.length}/{limit ?? '∞'}</span><div><strong>saved prompts</strong><small>{limit === null ? 'No limit on Operator' : `${Math.max(0, limit - items.length)} left on your plan`}</small></div></div>
      </section>

      <OperatorPack profile={profile} userId={userId} notify={notify} onUpgrade={onUpgrade} />

      {offline && <p className="muted-line">Showing your last saved copy. Changes need a connection.</p>}

      <section className="library-filters">
        <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your prompts" aria-label="Search prompts" />
        <select className="field" value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter by tag">
          <option value="">All tags</option>
          {tags.map((value) => <option value={value} key={value}>{value}</option>)}
        </select>
        {profile.active_business_id && (
          <select className="field" value={scope} onChange={(event) => setScope(event.target.value as 'business' | 'all')} aria-label="Which business">
            <option value="all">All businesses</option>
            <option value="business">Current business only</option>
          </select>
        )}
      </section>

      {visible.length ? (
        <div className="library-list">
          {visible.map((item) => (
            <article className="panel library-item" key={item.id}>
              {editing?.id === item.id ? (
                <div className="save-library">
                  <input className="field" value={editing.title} maxLength={120} onChange={(event) => setEditing({ ...editing, title: event.target.value })} aria-label="Name" />
                  <input className="field" value={editing.tags} maxLength={120} onChange={(event) => setEditing({ ...editing, tags: event.target.value })} aria-label="Tags" placeholder="Tags, comma separated" />
                  <button className="button button-secondary button-small" onClick={() => void saveEdit()}>Save</button>
                  <button className="button button-ghost button-small" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div className="library-head">
                  <div><h3>{item.title}</h3><small>{item.source} · {new Date(item.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}{item.tags.length ? ` · ${item.tags.join(', ')}` : ''}</small></div>
                  <div className="library-actions">
                    <button className="copy-button" onClick={() => { void navigator.clipboard.writeText(item.prompt); notify('Prompt copied.'); }}>Copy</button>
                    <button className="copy-button" onClick={() => setOpenId(openId === item.id ? null : item.id)}>{openId === item.id ? 'Close' : 'Open'}</button>
                    <button className="copy-button" onClick={() => setEditing({ id: item.id, title: item.title, tags: item.tags.join(', ') })}>Edit</button>
                    <button className="copy-button" onClick={() => void remove(item.id)}>Delete</button>
                  </div>
                </div>
              )}
              {openId === item.id && (
                <>
                  <pre>{item.prompt}</pre>
                  {renderRun(item.prompt)}
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state large panel"><strong>{items.length ? 'Nothing matches that search.' : 'Your library is empty.'}</strong><p>Press "Save to library" under any prompt you want to keep.</p></div>
      )}
    </div>
  );
}
