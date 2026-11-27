import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, Clock, Copy, Landmark, Mail, ShieldCheck, X } from 'lucide-react';
import { api, type TransferCheckout as Checkout } from '../lib/api';
import { useDismiss } from '../lib/useDismiss';

type PaidPlan = 'builder' | 'operator' | 'business_addon';
type Phase = 'preparing' | 'details' | 'waiting' | 'done' | 'error';

const STEPS = ['Reserving your plan', 'Creating your payment token', 'Loading our account details'];
const MIN_PREPARE_MS = 1800; // long enough to read the steps, short enough not to stall
const POLL_MS = 15_000;

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

function CopyRow({ label, value, display, strong }: { label: string; value: string; display?: string; strong?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the value is still on screen to copy by hand.
    }
  }
  return (
    <div className={`transfer-row${strong ? ' strong' : ''}`}>
      <span>{label}</span>
      <strong>{display ?? value}</strong>
      <button type="button" className="icon-button transfer-copy" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

/**
 * Bank transfer checkout, used while card payments are not live.
 * A short preparing animation, then the account details, the exact amount
 * and a NURJ-XXXXXX token for the narration and the proof email. After
 * "I've sent it" it waits for the payment inbox agent to confirm.
 */
export function TransferCheckout({ plan, onClose, onActivated }: { plan: PaidPlan; onClose: () => void; onActivated: (label: string) => void }) {
  const [phase, setPhase] = useState<Phase>('preparing');
  const [step, setStep] = useState(0);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState('');
  const [proofSeen, setProofSeen] = useState(false);
  const activatedRef = useRef(false);
  const onActivatedRef = useRef(onActivated);
  onActivatedRef.current = onActivated;
  useDismiss(true, onClose);

  // Preparing: run the request and the step animation together.
  useEffect(() => {
    if (phase !== 'preparing') return;
    let cancelled = false;
    const timers = STEPS.map((_, index) => window.setTimeout(() => !cancelled && setStep(index), (index * MIN_PREPARE_MS) / STEPS.length));
    const started = Date.now();
    api.startTransfer(plan)
      .then(async (result) => {
        const left = MIN_PREPARE_MS - (Date.now() - started);
        if (left > 0) await new Promise((resolve) => window.setTimeout(resolve, left));
        if (cancelled) return;
        setCheckout(result);
        setProofSeen(result.proof_received);
        // Someone coming back after already sending goes straight to waiting.
        setPhase(result.status === 'proof_received' ? 'waiting' : 'details');
      })
      .catch((startError: unknown) => {
        if (cancelled) return;
        setError(startError instanceof Error ? startError.message : 'The transfer could not be started.');
        setPhase('error');
      });
    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [phase, plan]);

  // Waiting: poll until the inbox agent (or an admin) confirms.
  useEffect(() => {
    if (phase !== 'waiting' || !checkout) return;
    let stopped = false;
    async function poll() {
      try {
        const status = await api.transferStatus(checkout!.reference);
        if (stopped) return;
        setProofSeen(status.proof_received);
        if (status.status === 'success' && !activatedRef.current) {
          activatedRef.current = true;
          setPhase('done');
          onActivatedRef.current(checkout!.plan_label);
        } else if (status.status === 'rejected') {
          setError('We could not match this transfer. Reply to our email or write to support and we will sort it out.');
          setPhase('error');
        }
      } catch {
        // Offline or a blip: try again on the next tick.
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [phase, checkout]);

  const mailto = checkout
    ? `mailto:${checkout.proof_email}?subject=${encodeURIComponent(`Payment proof ${checkout.token}`)}&body=${encodeURIComponent(
        `Hi Nurj,\n\nI have paid ${naira(checkout.amount_kobo)} for ${checkout.plan_label}.\nPayment token: ${checkout.token}\n\nMy receipt is attached.\n`,
      )}`
    : '';

  return (
    <div className="usage-confirm transfer-backdrop" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
      <motion.div className="panel transfer-card" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22 }}>
        <button type="button" className="icon-button transfer-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <AnimatePresence mode="wait">
          {phase === 'preparing' && (
            <motion.div key="preparing" className="transfer-preparing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="transfer-orbit" aria-hidden="true"><span /><span /><span /></div>
              <h3 id="transfer-title">Preparing your payment</h3>
              <ol className="transfer-steps" aria-live="polite">
                {STEPS.map((label, index) => (
                  <li key={label} className={index < step ? 'done' : index === step ? 'active' : ''}>
                    <i>{index < step ? <Check size={12} /> : null}</i>{label}
                  </li>
                ))}
              </ol>
            </motion.div>
          )}

          {phase === 'details' && checkout && (
            <motion.div key="details" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span className="eyebrow"><Landmark size={13} /> Pay by bank transfer</span>
              <h3 id="transfer-title">{checkout.plan_label}: {naira(checkout.amount_kobo)}</h3>
              <p className="transfer-lead">Card payments are launching soon. For now, transfer directly to our account. Your plan switches on as soon as the money arrives.</p>
              <div className="transfer-details">
                <CopyRow label="Amount" value={String(checkout.amount_kobo / 100)} display={naira(checkout.amount_kobo)} />
                <CopyRow label="Account number" value={checkout.bank.account_number} />
                <div className="transfer-row"><span>Bank</span><strong>{checkout.bank.name}</strong></div>
                <div className="transfer-row"><span>Account name</span><strong>{checkout.bank.account_name}</strong></div>
                <CopyRow label="Narration / description" value={checkout.token} strong />
              </div>
              <ol className="transfer-howto">
                <li>Transfer exactly <strong>{naira(checkout.amount_kobo)}</strong>. A different amount needs a manual check.</li>
                <li>Put <strong>{checkout.token}</strong> in the narration or description.</li>
                <li>Email your receipt with the token in the subject to <a href={mailto}>{checkout.proof_email}</a>.</li>
              </ol>
              <div className="account-actions">
                <button className="button button-primary button-small" onClick={() => setPhase('waiting')}>I&apos;ve sent it</button>
                <a className="button button-ghost button-small" href={mailto}><Mail size={14} /> Email receipt</a>
              </div>
              <p className="muted-line"><ShieldCheck size={13} /> This token is held for 72 hours. Only use the account shown here; Nurj never asks you to pay anyone else.</p>
            </motion.div>
          )}

          {phase === 'waiting' && checkout && (
            <motion.div key="waiting" className="transfer-waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="transfer-pulse" aria-hidden="true"><Clock size={22} /></div>
              <h3 id="transfer-title">Waiting for your transfer</h3>
              <p>We are watching for {naira(checkout.amount_kobo)} with token <strong>{checkout.token}</strong>. Most transfers are confirmed within 30 minutes during the day.</p>
              <ul className="transfer-checks">
                <li className="done"><Check size={13} /> Token created</li>
                <li className={proofSeen ? 'done' : ''}>{proofSeen ? <Check size={13} /> : <i />} Receipt email received</li>
                <li><i /> Transfer confirmed</li>
              </ul>
              <p className="muted-line">You can close this. Your plan switches on by itself and we email you when it does.</p>
              <div className="account-actions">
                {!proofSeen && <a className="button button-secondary button-small" href={mailto}><Mail size={14} /> Email receipt</a>}
                <button className="button button-ghost button-small" onClick={() => setPhase('details')}>Show account details</button>
              </div>
            </motion.div>
          )}

          {phase === 'done' && checkout && (
            <motion.div key="done" className="transfer-waiting" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
              <motion.div className="transfer-success" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}><CheckCircle2 size={34} /></motion.div>
              <h3 id="transfer-title">Payment received</h3>
              <p>{checkout.plan_label} is now active. Thank you.</p>
              <div className="account-actions"><button className="button button-primary button-small" onClick={onClose}>Continue</button></div>
            </motion.div>
          )}

          {phase === 'error' && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h3 id="transfer-title">{checkout ? 'We need to check this transfer' : 'Transfer not started'}</h3>
              <p className="transfer-lead">{error}</p>
              <div className="account-actions">
                <button className="button button-primary button-small" onClick={() => { setError(''); setStep(0); setPhase('preparing'); }}>Try again</button>
                <button className="button button-ghost button-small" onClick={onClose}>Close</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
