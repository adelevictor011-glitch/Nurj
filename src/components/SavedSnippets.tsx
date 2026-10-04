import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type SnippetKind = 'context' | 'mentor';

interface Snippet {
  id: string;
  kind: SnippetKind;
  title: string;
  body: string;
}

const LOCAL_KEY = 'nurj-snippets-v1';
const MAX_PER_KIND = 30;

function readLocal(): Snippet[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Snippet[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: Snippet[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — the list simply will not persist */
  }
}

/**
 * A reusable list under a free-text field. Picking an item only copies it into
 * the field. Nothing in the list changes unless the user presses
 * "Save as new", "Update saved" or "Delete".
 */
export function SavedSnippets({
  kind,
  value,
  maxLength,
  userId,
  onPick,
  notify,
}: {
  kind: SnippetKind;
  value: string;
  maxLength: number;
  userId: string | null;
  onPick: (text: string) => void;
  notify: (message: string) => void;
}) {
  const [items, setItems] = useState<Snippet[]>([]);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId || !supabase) {
        setItems(readLocal().filter((item) => item.kind === kind));
        return;
      }
      const { data, error } = await supabase
        .from('saved_snippets')
        .select('id, kind, title, body')
        .eq('kind', kind)
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('[nurj] could not load saved list', error.message);
        return;
      }
      setItems((data ?? []) as Snippet[]);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, userId]);

  const active = items.find((item) => item.id === activeId) ?? null;
  const text = value.trim();
  const canUpdate = Boolean(active && text && text !== active.body);

  function persistLocal(next: Snippet[]) {
    const others = readLocal().filter((item) => item.kind !== kind);
    writeLocal([...others, ...next]);
    setItems(next);
  }

  async function saveNew() {
    const name = title.trim();
    if (!name || !text) return;
    if (items.length >= MAX_PER_KIND) {
      notify(`Your saved list is full (${MAX_PER_KIND}). Delete one first.`);
      return;
    }
    setBusy(true);
    try {
      if (userId && supabase) {
        const { data, error } = await supabase
          .from('saved_snippets')
          .insert({ user_id: userId, kind, title: name.slice(0, 60), body: text.slice(0, maxLength) })
          .select('id, kind, title, body')
          .single();
        if (error) throw new Error(error.message);
        setItems((current) => [data as Snippet, ...current]);
        setActiveId((data as Snippet).id);
      } else {
        const created: Snippet = { id: crypto.randomUUID(), kind, title: name.slice(0, 60), body: text.slice(0, maxLength) };
        persistLocal([created, ...items]);
        setActiveId(created.id);
      }
      setNaming(false);
      setTitle('');
      setOpen(true);
      notify('Saved to your list.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function updateActive() {
    if (!active || !text) return;
    setBusy(true);
    try {
      const body = text.slice(0, maxLength);
      if (userId && supabase) {
        const { error } = await supabase
          .from('saved_snippets')
          .update({ body, updated_at: new Date().toISOString() })
          .eq('id', active.id);
        if (error) throw new Error(error.message);
        setItems((current) => current.map((item) => (item.id === active.id ? { ...item, body } : item)));
      } else {
        persistLocal(items.map((item) => (item.id === active.id ? { ...item, body } : item)));
      }
      notify(`Updated “${active.title}”.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Snippet) {
    setBusy(true);
    try {
      if (userId && supabase) {
        const { error } = await supabase.from('saved_snippets').delete().eq('id', item.id);
        if (error) throw new Error(error.message);
        setItems((current) => current.filter((entry) => entry.id !== item.id));
      } else {
        persistLocal(items.filter((entry) => entry.id !== item.id));
      }
      if (activeId === item.id) setActiveId(null);
      notify('Removed from your list.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  const noun = kind === 'context' ? 'task contexts' : 'mentors / frameworks';

  return (
    <div className="snippets">
      <div className="snippets-bar">
        <button type="button" className="snippets-link" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
          Saved {noun} ({items.length})
        </button>
        {!naming && (
          <button type="button" className="snippets-link" disabled={!text || busy} onClick={() => setNaming(true)}>
            Save as new
          </button>
        )}
        {canUpdate && (
          <button type="button" className="snippets-link" disabled={busy} onClick={() => void updateActive()}>
            Update “{active?.title}”
          </button>
        )}
      </div>

      {naming && (
        <div className="snippets-name">
          <input
            className="field"
            value={title}
            maxLength={60}
            autoFocus
            autoComplete="off"
            placeholder="Name this so you can find it later"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void saveNew();
              }
            }}
          />
          <button type="button" className="button button-secondary button-small" disabled={!title.trim() || busy} onClick={() => void saveNew()}>Save</button>
          <button type="button" className="button button-ghost button-small" onClick={() => { setNaming(false); setTitle(''); }}>Cancel</button>
        </div>
      )}

      {open && (
        <ul className="snippets-list">
          {items.length === 0 && <li className="snippets-empty">Nothing saved yet. Write one above, then press “Save as new”.</li>}
          {items.map((item) => (
            <li key={item.id} className={item.id === activeId ? 'active' : ''}>
              <div>
                <strong>{item.title}</strong>
                <small>{item.body.length > 110 ? `${item.body.slice(0, 110)}…` : item.body}</small>
              </div>
              <button type="button" className="button button-secondary button-small" onClick={() => { onPick(item.body); setActiveId(item.id); }}>Use</button>
              <button type="button" className="button button-ghost button-small" disabled={busy} onClick={() => void remove(item)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
