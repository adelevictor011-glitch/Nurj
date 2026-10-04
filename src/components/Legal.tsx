import { useState } from 'react';
import { LEGAL_DOCUMENTS, LEGAL_UPDATED, type LegalKey } from '../legal';

export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="Legal">
      <a href="/terms" target="_blank" rel="noopener">Terms</a>
      <a href="/privacy" target="_blank" rel="noopener">Privacy</a>
      <a href="/refunds" target="_blank" rel="noopener">Refunds</a>
    </nav>
  );
}

export function LegalPage({ docKey }: { docKey: LegalKey }) {
  const doc = LEGAL_DOCUMENTS[docKey];
  return (
    <main className="focus-shell legal-shell">
      <div className="focus-top"><a className="legal-home" href="/">Nurj</a><span>Last updated {LEGAL_UPDATED}</span></div>
      <article className="legal-doc">
        <h1>{doc.title}</h1>
        <p className="legal-intro">{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
          </section>
        ))}
      </article>
      <LegalLinks />
    </main>
  );
}

export function ConsentCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="consent-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        I agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Use</a> and{' '}
        <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
      </span>
    </label>
  );
}

/**
 * Shown once to signed-in users who have not accepted the current version of
 * the Terms and Privacy Policy (for example, accounts created before they
 * existed, or after a material update).
 */
export function ConsentGate({ onAccept, onSignOut }: { onAccept: () => Promise<void>; onSignOut: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="consent-gate" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="panel consent-card">
        <span className="eyebrow">BEFORE YOU CONTINUE</span>
        <h2 id="consent-title">Our Terms and Privacy Policy</h2>
        <p>They explain what Nurj does with your data, your 7-day refund, and how to download or delete everything. Please read and accept them to keep using Nurj.</p>
        <ConsentCheckbox checked={agreed} onChange={setAgreed} />
        <div className="account-actions">
          <button
            className="button button-primary"
            disabled={!agreed || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAccept();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Saving…' : 'Accept and continue'}
          </button>
          <button className="button button-ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
