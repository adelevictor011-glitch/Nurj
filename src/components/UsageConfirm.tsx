import { useState, type ReactNode } from 'react';
import type { PlanKey, UsageStatus } from '../types';

/**
 * The shared "this counts toward your daily usage" prompt (roadmap rule for
 * features 2, 8, 9, 15 and 16). Any action that spends an AI call asks first;
 * cancelling costs nothing. Offline, it explains instead of asking.
 */
export function useUsageConfirm(usage: UsageStatus, plan: PlanKey, notify: (message: string) => void) {
  const [pending, setPending] = useState<{ action: () => void; label: string } | null>(null);

  function ask(label: string, action: () => void) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      notify('You are offline. Connect to the internet to use AI actions.');
      return;
    }
    setPending({ action, label });
  }

  const paid = plan !== 'free';
  const line = paid
    ? `Paid plans include up to 150 AI actions a day.${plan === 'builder' ? ' Builder also includes 10 prompt runs a day.' : ''}`
    : `You have used ${usage.prompt.used} of ${usage.prompt.limit ?? 5} prompts today.`;

  const modal: ReactNode = pending ? (
    <div className="usage-confirm" role="dialog" aria-modal="true" aria-labelledby="usage-confirm-title">
      <div className="panel usage-confirm-card">
        <span className="eyebrow">{pending.label.toUpperCase()}</span>
        <h3 id="usage-confirm-title">This action counts toward your daily usage.</h3>
        <p>{line} Continue or cancel?</p>
        <div className="account-actions">
          <button className="button button-primary button-small" onClick={() => { const { action } = pending; setPending(null); action(); }}>Continue</button>
          <button className="button button-ghost button-small" onClick={() => setPending(null)}>Cancel</button>
        </div>
      </div>
    </div>
  ) : null;

  return { ask, modal };
}
