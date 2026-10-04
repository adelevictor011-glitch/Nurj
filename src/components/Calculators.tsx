import { useState } from 'react';
import { api, type ChannelResult } from '../lib/api';

const n = (value: string) => {
  const number = Number(value.replace(/[₦,\s]/g, ''));
  return Number.isFinite(number) ? number : 0;
};
const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

function Field({ label, value, onChange, hint, suffix }: { label: string; value: string; onChange: (value: string) => void; hint?: string; suffix?: string }) {
  return (
    <label className="calc-field">
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input className="field" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Runway() {
  const [cash, setCash] = useState('450000');
  const [costs, setCosts] = useState('200000');
  const [revenue, setRevenue] = useState('50000');
  const burn = n(costs) - n(revenue);
  const months = burn > 0 ? n(cash) / burn : Infinity;
  return (
    <article className="panel calc-card">
      <span className="eyebrow">RUNWAY</span>
      <h3>How long can the business keep going?</h3>
      <p className="calc-explain">Like fuel in a generator: cash in the bank is the fuel, and what you spend each month after sales is how fast it burns.</p>
      <div className="calc-grid">
        <Field label="Cash you have now" value={cash} onChange={setCash} suffix="₦" />
        <Field label="Monthly costs" value={costs} onChange={setCosts} suffix="₦" />
        <Field label="Monthly sales coming in" value={revenue} onChange={setRevenue} suffix="₦" />
      </div>
      <div className="calc-result">
        {burn <= 0
          ? <strong>Sales cover your costs. You are not burning cash.</strong>
          : <><strong>{months < 1 ? 'Less than 1 month' : `${months.toFixed(1)} months`} of runway</strong><span>You burn {naira(burn)} a month ({naira(burn / 30)} a day).</span></>}
      </div>
    </article>
  );
}

function BurnRate() {
  const [lines, setLines] = useState([
    { label: 'Rent or shop space', amount: '60000' },
    { label: 'Data and airtime', amount: '15000' },
    { label: 'Transport and delivery', amount: '25000' },
    { label: 'Stock or materials', amount: '80000' },
    { label: 'Staff or helpers', amount: '0' },
  ]);
  const total = lines.reduce((sum, line) => sum + n(line.amount), 0);
  return (
    <article className="panel calc-card">
      <span className="eyebrow">BURN RATE</span>
      <h3>What does the business cost to run each month?</h3>
      <p className="calc-explain">Add every monthly cost, even small ones. Data, fuel and delivery add up faster than rent.</p>
      <div className="burn-lines">
        {lines.map((line, index) => (
          <div className="burn-line" key={index}>
            <input className="field" value={line.label} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} aria-label="Cost name" />
            <input className="field" inputMode="decimal" value={line.amount} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} aria-label="Monthly amount in naira" />
            <button type="button" className="copy-button" onClick={() => setLines(lines.filter((_, i) => i !== index))} aria-label="Remove line">×</button>
          </div>
        ))}
        <button type="button" className="copy-button" onClick={() => setLines([...lines, { label: 'Other cost', amount: '0' }])}>Add a cost</button>
      </div>
      <div className="calc-result"><strong>{naira(total)} a month</strong><span>{naira(total / 4.33)} a week · {naira(total / 30)} a day</span></div>
    </article>
  );
}

function Retainer() {
  const [target, setTarget] = useState('600000');
  const [hours, setHours] = useState('10');
  const [rate, setRate] = useState('7500');
  const retainer = n(hours) * n(rate);
  const clients = retainer > 0 ? Math.ceil(n(target) / retainer) : 0;
  return (
    <article className="panel calc-card">
      <span className="eyebrow">RETAINER MATHS</span>
      <h3>How many monthly clients do you need?</h3>
      <p className="calc-explain">A retainer is a fixed monthly fee for agreed work, like a monthly maintenance contract instead of one-off repairs.</p>
      <div className="calc-grid">
        <Field label="Monthly income target" value={target} onChange={setTarget} suffix="₦" />
        <Field label="Hours per client per month" value={hours} onChange={setHours} />
        <Field label="Your hourly rate" value={rate} onChange={setRate} suffix="₦" />
      </div>
      <div className="calc-result">
        <strong>Charge {naira(retainer)} a month per client</strong>
        <span>{clients ? `You need ${clients} client${clients === 1 ? '' : 's'} to reach ${naira(n(target))}, about ${clients * n(hours)} hours a month.` : 'Add your hours and rate.'}</span>
      </div>
    </article>
  );
}

function PriceRise({ ask, authenticated, notify, onRemaining }: { ask: (label: string, action: () => void) => void; authenticated: boolean; notify: (message: string) => void; onRemaining: (remaining: number | null) => void }) {
  const [product, setProduct] = useState('Small chops tray (50 pieces)');
  const [oldPrice, setOldPrice] = useState('15000');
  const [newPrice, setNewPrice] = useState('18000');
  const [units, setUnits] = useState('40');
  const [reason, setReason] = useState('');
  const [channel, setChannel] = useState('whatsapp_message');
  const [script, setScript] = useState<ChannelResult | null>(null);
  const [busy, setBusy] = useState(false);

  const before = n(oldPrice) * n(units);
  const breakEven = n(newPrice) > 0 ? (1 - n(oldPrice) / n(newPrice)) * 100 : 0;
  const keepUnits = n(newPrice) > 0 ? Math.ceil(before / n(newPrice)) : 0;

  function write() {
    if (!authenticated) { notify('Sign in to write the customer message.'); return; }
    ask('Write the price-rise message', async () => {
      setBusy(true);
      try {
        const result = await api.priceScript({ product, oldPrice: `₦${n(oldPrice).toLocaleString('en-NG')}`, newPrice: `₦${n(newPrice).toLocaleString('en-NG')}`, reason, channel });
        setScript(result);
        if (result.remaining !== undefined) onRemaining(result.remaining);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'The message could not be written.');
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <article className="panel calc-card">
      <span className="eyebrow">PRICE RISE</span>
      <h3>Can you raise prices without losing money?</h3>
      <p className="calc-explain">If a few customers leave after a price rise, you can still earn the same or more. This shows how many you can afford to lose.</p>
      <div className="calc-grid">
        <Field label="Product or service" value={product} onChange={setProduct} />
        <Field label="Current price" value={oldPrice} onChange={setOldPrice} suffix="₦" />
        <Field label="New price" value={newPrice} onChange={setNewPrice} suffix="₦" />
        <Field label="Units sold a month now" value={units} onChange={setUnits} />
      </div>
      <div className="calc-result">
        <strong>Sell {keepUnits} a month at the new price to earn the same {naira(before)}</strong>
        <span>You can lose up to {Math.max(0, breakEven).toFixed(0)}% of sales before the rise costs you money.</span>
      </div>
      <div className="calc-script">
        <label className="calc-field"><span>Reason to give customers (optional)</span><input className="field" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Ingredient costs went up 30% since June" /></label>
        <label className="calc-field"><span>Send it on</span>
          <select className="field" value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="whatsapp_message">WhatsApp message</option>
            <option value="whatsapp_status">WhatsApp Status</option>
            <option value="instagram_caption">Instagram caption</option>
            <option value="email">Email</option>
          </select>
        </label>
        <button className="button button-secondary button-small" disabled={busy} onClick={write}>{busy ? 'Writing…' : 'Write the customer message'}</button>
      </div>
      {script && (
        <div className="channel-result">
          {script.subject && <p><strong>Subject:</strong> {script.subject}</p>}
          <pre>{script.text}</pre>
          <div className="channel-meta"><span>{script.text.length} / {script.limit} characters</span>
            <button className="copy-button" onClick={() => { void navigator.clipboard.writeText(script.subject ? `${script.subject}\n\n${script.text}` : script.text); notify('Copied.'); }}>Copy</button></div>
        </div>
      )}
    </article>
  );
}

/** Interactive naira calculators (roadmap feature 16). The maths runs in the browser, free and offline. */
export function Calculators({ ask, authenticated, notify, onRemaining }: { ask: (label: string, action: () => void) => void; authenticated: boolean; notify: (message: string) => void; onRemaining: (remaining: number | null) => void }) {
  return (
    <div className="screen-stack calc-screen">
      <section className="screen-heading"><div><span className="eyebrow">NAIRA CALCULATORS</span><h1>Do the sums before the move.</h1><p>These work offline and never count toward your daily usage. Only the customer message uses AI.</p></div></section>
      <section className="calc-layout">
        <Runway />
        <BurnRate />
        <Retainer />
        <PriceRise ask={ask} authenticated={authenticated} notify={notify} onRemaining={onRemaining} />
      </section>
    </div>
  );
}
