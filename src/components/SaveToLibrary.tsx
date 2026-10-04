import { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Saves a prompt to the library (roadmap feature 8). Saving costs nothing.
 * Guests are asked to sign in, because the library lives on the account.
 */
export function SaveToLibrary({
  prompt,
  defaultTitle,
  source,
  userId,
  businessId,
  notify,
}: {
  prompt: string;
  defaultTitle: string;
  source: 'generated' | 'enhanced' | 'refined' | 'pack' | 'manual';
  userId: string | null;
  businessId?: string | null;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle.slice(0, 120));
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!userId || !supabase) {
      notify('Sign in to keep a library of your prompts.');
      return;
    }
    setBusy(true);
    const tagList = tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    const { error } = await supabase.from('saved_prompts').insert({
      user_id: userId,
      business_id: businessId ?? null,
      title: title.trim() || 'Saved prompt',
      prompt: prompt.slice(0, 8000),
      tags: tagList,
      source,
    });
    setBusy(false);
    if (error) {
      notify(error.message.includes('full') ? error.message : 'The prompt could not be saved.');
      return;
    }
    setSaved(true);
    setOpen(false);
    notify('Saved to your library.');
  }

  if (saved) return <span className="save-done">Saved to library</span>;
  if (!open) return <button type="button" className="copy-button" onClick={() => setOpen(true)}>Save to library</button>;

  return (
    <div className="save-library">
      <input className="field" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Name" aria-label="Prompt name" />
      <input className="field" value={tags} maxLength={120} onChange={(event) => setTags(event.target.value)} placeholder="Tags, comma separated" aria-label="Tags" />
      <button type="button" className="button button-secondary button-small" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      <button type="button" className="button button-ghost button-small" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
