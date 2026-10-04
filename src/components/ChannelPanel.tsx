import { useState } from 'react';
import { api, type ChannelResult } from '../lib/api';
import { CHANNELS, CHANNEL_BY_KEY } from '../lib/channels';
import { exportPdf, exportWord } from '../lib/exportDoc';

/**
 * Channel-ready output (roadmap feature 15): reshape a result for one
 * placement within its character target, with a live counter. Reshaping is an
 * AI call (asks first); PDF and Word export are free.
 */
export function ChannelPanel({
  text,
  title,
  authenticated,
  ask,
  onRemaining,
  notify,
}: {
  text: string;
  title: string;
  authenticated: boolean;
  ask: (label: string, action: () => void) => void;
  onRemaining?: (remaining: number | null) => void;
  notify: (message: string) => void;
}) {
  const [channel, setChannel] = useState('whatsapp_message');
  const [result, setResult] = useState<ChannelResult | null>(null);
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const spec = CHANNEL_BY_KEY[channel];

  function reshape() {
    if (!authenticated) {
      notify('Sign in to reshape results for each channel.');
      return;
    }
    ask(`Make it ${spec.group}-ready`, async () => {
      setBusy(true);
      try {
        const next = await api.channel(text, channel);
        setResult(next);
        setDraft(next.text);
        setSubject(next.subject);
        if (next.remaining !== undefined) onRemaining?.(next.remaining);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Nurj could not reshape this.');
      } finally {
        setBusy(false);
      }
    });
  }

  const over = draft.length > spec.limit;
  const groups = Array.from(new Set(CHANNELS.map((item) => item.group)));

  return (
    <div className="channel-panel">
      <div className="channel-row">
        <label>
          <span>Post it to</span>
          <select className="field" value={channel} onChange={(event) => { setChannel(event.target.value); setResult(null); }}>
            {groups.map((group) => (
              <optgroup label={group} key={group}>
                {CHANNELS.filter((item) => item.group === group).map((item) => (
                  <option value={item.key} key={item.key}>{item.group}: {item.label} (up to {item.limit.toLocaleString('en-NG')})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" className="button button-secondary button-small" disabled={busy} onClick={reshape}>{busy ? 'Reshaping…' : 'Make it channel-ready'}</button>
        <button type="button" className="copy-button" onClick={() => exportPdf(title, text)}>PDF</button>
        <button type="button" className="copy-button" onClick={() => { exportWord(title, text).catch(() => notify('The Word file could not be created. Try again.')); }}>Word (.docx)</button>
      </div>
      {result && result.channel === channel && (
        <div className="channel-result">
          {spec.subject !== undefined && (
            <label><span>Subject ({subject.length}/{spec.subject})</span><input className="field" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
          )}
          <textarea className="field" value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} />
          <div className="channel-meta">
            <span className={over ? 'over' : ''}>{draft.length.toLocaleString('en-NG')} / {spec.limit.toLocaleString('en-NG')} characters{over ? ' — too long for this placement' : ''}</span>
            <small>Platform limit: {spec.platformLimit}</small>
            <button type="button" className="copy-button" onClick={() => { void navigator.clipboard.writeText(spec.subject !== undefined ? `${subject}\n\n${draft}` : draft); notify('Copied.'); }}>Copy</button>
          </div>
        </div>
      )}
    </div>
  );
}
