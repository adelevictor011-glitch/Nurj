import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { api, type ChannelResult } from '../lib/api';
import {
  breakEven, customerPayback, discountImpact, hourlyRate, parseAmount as n, profitPerOrder, quitNumber,
  type PaymentMethod,
} from '../lib/calcMaths';

const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;
const percent = (value: number) => `${Math.round(value)}%`;

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
    <div className="calc-body">
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
    </div>
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
    <div className="calc-body">
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
    </div>
  );
}

function Retainer() {
  const [target, setTarget] = useState('600000');
  const [hours, setHours] = useState('10');
  const [rate, setRate] = useState('7500');
  const retainer = n(hours) * n(rate);
  const clients = retainer > 0 ? Math.ceil(n(target) / retainer) : 0;
  return (
    <div className="calc-body">
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
    </div>
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
    <div className="calc-body">
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
    </div>
  );
}

function BreakEven() {
  const [fixed, setFixed] = useState('150000');
  const [price, setPrice] = useState('5000');
  const [unitCost, setUnitCost] = useState('3000');
  const result = breakEven(n(fixed), n(price), n(unitCost));
  return (
    <div className="calc-body">
      <p className="calc-explain">Like a danfo driver: the first trips of the day only pay the owner and the fuel. Everything after that is his. Break-even is the trip where the money starts being yours.</p>
      <div className="calc-grid">
        <Field label="Monthly fixed costs" value={fixed} onChange={setFixed} suffix="₦" hint="Rent, data, salaries: costs that don't change with sales." />
        <Field label="Selling price per unit" value={price} onChange={setPrice} suffix="₦" />
        <Field label="Cost to make or buy one unit" value={unitCost} onChange={setUnitCost} suffix="₦" />
      </div>
      <div className="calc-result">
        {result === null
          ? <strong className="calc-warn">Each sale loses money. Raise the price or cut the unit cost first.</strong>
          : <><strong>Sell {result.units.toLocaleString('en-NG')} a month to break even</strong>
            <span>That is {naira(result.revenue)} in sales, about {Math.ceil(result.units / 30).toLocaleString('en-NG')} a day. Each sale after that adds {naira(result.marginPerUnit)} profit.</span></>}
      </div>
    </div>
  );
}

function ProfitPerOrder() {
  const [price, setPrice] = useState('15000');
  const [productCost, setProductCost] = useState('8000');
  const [packaging, setPackaging] = useState('500');
  const [delivery, setDelivery] = useState('2000');
  const [other, setOther] = useState('0');
  const [method, setMethod] = useState<PaymentMethod>('paystack');
  const [customPercent, setCustomPercent] = useState('1.5');
  const result = profitPerOrder({ price: n(price), productCost: n(productCost), packaging: n(packaging), delivery: n(delivery), other: n(other), method, customPercent: n(customPercent) });
  return (
    <div className="calc-body">
      <p className="calc-explain">The price is not the profit. Packaging, the dispatch rider and the payment fee all come out before you see a kobo.</p>
      <div className="calc-grid">
        <Field label="Selling price" value={price} onChange={setPrice} suffix="₦" />
        <Field label="Product cost" value={productCost} onChange={setProductCost} suffix="₦" />
        <Field label="Packaging" value={packaging} onChange={setPackaging} suffix="₦" />
        <Field label="Delivery you pay for" value={delivery} onChange={setDelivery} suffix="₦" hint="Leave at 0 if the customer pays the rider." />
        <Field label="Other costs per order" value={other} onChange={setOther} suffix="₦" />
        <label className="calc-field"><span>How the customer pays</span>
          <select className="field" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            <option value="paystack">Paystack (card, USSD, transfer)</option>
            <option value="transfer">Bank transfer to my account</option>
            <option value="custom">Other, with a % fee</option>
          </select>
          {method === 'paystack' && <small>Paystack local rate: 1.5% + ₦100, ₦100 waived under ₦2,500, capped at ₦2,000.</small>}
        </label>
        {method === 'custom' && <Field label="Payment fee" value={customPercent} onChange={setCustomPercent} suffix="%" />}
      </div>
      <div className="calc-result">
        <strong className={result.profit <= 0 ? 'calc-warn' : undefined}>{result.profit <= 0 ? `You lose ${naira(-result.profit)} on every order` : `${naira(result.profit)} profit per order`}</strong>
        <span>{percent(result.margin * 100)} margin. Payment fee {naira(result.fee)}, total costs {naira(result.costs)}.</span>
      </div>
    </div>
  );
}

function HourlyRate() {
  const [takeHome, setTakeHome] = useState('400000');
  const [costs, setCosts] = useState('60000');
  const [hours, setHours] = useState('20');
  const result = hourlyRate(n(takeHome), n(costs), n(hours));
  return (
    <div className="calc-body">
      <p className="calc-explain">You can't bill every hour you work. Messages, travel and chasing payments eat time, so price from the hours clients actually pay for.</p>
      <div className="calc-grid">
        <Field label="Monthly take-home you want" value={takeHome} onChange={setTakeHome} suffix="₦" />
        <Field label="Monthly business costs" value={costs} onChange={setCosts} suffix="₦" />
        <Field label="Hours clients pay for each week" value={hours} onChange={setHours} hint="Be honest. Most freelancers bill 15 to 25." />
      </div>
      <div className="calc-result">
        {result === null
          ? <strong>Add the hours clients pay for.</strong>
          : <><strong>Charge at least {naira(result.rate)} an hour</strong>
            <span>That covers {naira(result.needed)} a month from about {Math.round(result.hoursPerMonth)} paid hours. A 4-hour job is {naira(result.rate * 4)}.</span></>}
      </div>
    </div>
  );
}

function DiscountImpact() {
  const [price, setPrice] = useState('10000');
  const [unitCost, setUnitCost] = useState('6000');
  const [discount, setDiscount] = useState('20');
  const [units, setUnits] = useState('50');
  const result = discountImpact(n(price), n(unitCost), n(discount), n(units));
  return (
    <div className="calc-body">
      <p className="calc-explain">A discount comes out of your profit, not your price. A 20% promo on a thin margin can mean selling twice as much just to stand still.</p>
      <div className="calc-grid">
        <Field label="Normal price" value={price} onChange={setPrice} suffix="₦" />
        <Field label="Cost per unit" value={unitCost} onChange={setUnitCost} suffix="₦" />
        <Field label="Discount" value={discount} onChange={setDiscount} suffix="%" />
        <Field label="Units you sell now" value={units} onChange={setUnits} hint="In the same period as the promo." />
      </div>
      <div className="calc-result">
        {result.unitsNeeded === null
          ? <strong className="calc-warn">At {naira(result.newPrice)} you sell below cost. Every promo sale loses {naira(-result.marginAfter)}.</strong>
          : <><strong>Sell {result.unitsNeeded.toLocaleString('en-NG')} to earn the same profit</strong>
            <span>{result.extraPercent && result.extraPercent > 0 ? `That is ${percent(result.extraPercent)} more sales. ` : ''}Profit per sale drops from {naira(result.marginBefore)} to {naira(result.marginAfter)}.</span></>}
      </div>
    </div>
  );
}

function CustomerPayback() {
  const [spend, setSpend] = useState('50000');
  const [customers, setCustomers] = useState('10');
  const [orderValue, setOrderValue] = useState('12000');
  const [margin, setMargin] = useState('30');
  const [orders, setOrders] = useState('1');
  const result = customerPayback({ spend: n(spend), customers: n(customers), orderValue: n(orderValue), marginPercent: n(margin), ordersPerMonth: n(orders) });
  return (
    <div className="calc-body">
      <p className="calc-explain">An ad is worth it when the customer it brings in earns back what they cost. A customer who buys every month pays back faster than one who buys once.</p>
      <div className="calc-grid">
        <Field label="Spent on ads or promo" value={spend} onChange={setSpend} suffix="₦" />
        <Field label="New paying customers it brought" value={customers} onChange={setCustomers} />
        <Field label="Average order value" value={orderValue} onChange={setOrderValue} suffix="₦" />
        <Field label="Profit margin" value={margin} onChange={setMargin} suffix="%" />
        <Field label="Orders per customer each month" value={orders} onChange={setOrders} hint="Use 0.5 for every other month." />
      </div>
      <div className="calc-result">
        {result === null
          ? <strong>Add how many customers the spend brought in.</strong>
          : <><strong>{Number.isFinite(result.months) ? `Each customer pays back in ${result.months < 1 ? 'under a month' : `${result.months.toFixed(1)} months`}` : 'These customers never pay back at this margin'}</strong>
            <span>Each one cost {naira(result.costPerCustomer)} to win and earns you {naira(result.profitPerMonth)} profit a month.</span></>}
      </div>
    </div>
  );
}

function QuitNumber() {
  const [salary, setSalary] = useState('400000');
  const [benefits, setBenefits] = useState('50000');
  const [soloCosts, setSoloCosts] = useState('50000');
  const [buffer, setBuffer] = useState('20');
  const [months, setMonths] = useState('6');
  const [profit, setProfit] = useState('250000');
  const result = quitNumber({ salary: n(salary), benefits: n(benefits), soloCosts: n(soloCosts), bufferPercent: n(buffer), monthsOfCover: n(months), currentProfit: n(profit) });
  return (
    <div className="calc-body">
      <p className="calc-explain">Your salary is not the only thing you lose. HMO, pension and transport allowance go too, and a business month is never as steady as payday.</p>
      <div className="calc-grid">
        <Field label="Monthly take-home salary" value={salary} onChange={setSalary} suffix="₦" />
        <Field label="Benefits you would lose each month" value={benefits} onChange={setBenefits} suffix="₦" hint="HMO, pension, transport or lunch allowance." />
        <Field label="New monthly costs of going solo" value={soloCosts} onChange={setSoloCosts} suffix="₦" />
        <Field label="Safety buffer" value={buffer} onChange={setBuffer} suffix="%" hint="For slow months. 20% is a sensible start." />
        <Field label="Months of savings you want first" value={months} onChange={setMonths} />
        <Field label="Business profit each month now" value={profit} onChange={setProfit} suffix="₦" />
      </div>
      <div className="calc-result">
        <strong>Your quit number: {naira(result.target)} profit a month</strong>
        <span>{result.gap > 0 ? `You are ${naira(result.gap)} a month away.` : 'Your business already clears it.'} Also save {naira(result.savings)} first to cover {n(months)} months of living costs.</span>
        <div className="calc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(result.progress * 100)} aria-label="Progress to your quit number"><i style={{ width: `${result.progress * 100}%` }} /></div>
        <small>{percent(result.progress * 100)} of the way there</small>
      </div>
    </div>
  );
}

type CalcProps = { ask: (label: string, action: () => void) => void; authenticated: boolean; notify: (message: string) => void; onRemaining: (remaining: number | null) => void };

interface CalcEntry { id: string; name: string; question: string; group: string; render: (props: CalcProps) => ReactNode }

/** Add a calculator here and it appears in its group, searchable. */
const CALCULATORS: CalcEntry[] = [
  { id: 'runway', name: 'Runway', question: 'How long can the business keep going?', group: 'Cash and survival', render: () => <Runway /> },
  { id: 'burn-rate', name: 'Burn rate', question: 'What does the business cost to run each month?', group: 'Cash and survival', render: () => <BurnRate /> },
  { id: 'break-even', name: 'Break-even', question: 'How many sales before I stop losing money?', group: 'Cash and survival', render: () => <BreakEven /> },
  { id: 'profit-per-order', name: 'True profit per order', question: "What's left after cost, delivery and payment fees?", group: 'Pricing and profit', render: () => <ProfitPerOrder /> },
  { id: 'hourly-rate', name: 'Hourly rate', question: 'What must I charge to earn my monthly goal?', group: 'Pricing and profit', render: () => <HourlyRate /> },
  { id: 'retainer', name: 'Retainer maths', question: 'How many monthly clients do you need?', group: 'Pricing and profit', render: () => <Retainer /> },
  { id: 'price-rise', name: 'Price rise', question: 'Can you raise prices without losing money?', group: 'Pricing and profit', render: (props) => <PriceRise {...props} /> },
  { id: 'discount', name: 'Discount impact', question: 'How many extra sales does a promo need to be worth it?', group: 'Pricing and profit', render: () => <DiscountImpact /> },
  { id: 'payback', name: 'Customer payback', question: 'How long before a paid-for customer earns back what they cost?', group: 'Growth', render: () => <CustomerPayback /> },
  { id: 'quit-number', name: 'Quit-the-9–5 number', question: 'What monthly profit safely replaces my salary?', group: 'Leaving your 9–5', render: () => <QuitNumber /> },
];

function CalcRow({ entry, props }: { entry: CalcEntry; props: CalcProps }) {
  return (
    <details className="panel calc-item" id={`calc-${entry.id}`}>
      <summary className="calc-summary">
        <span><strong>{entry.name}</strong><small>{entry.question}</small></span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      {entry.render(props)}
    </details>
  );
}

/** Interactive naira calculators (roadmap feature 16). The maths runs in the browser, free and offline. */
export function Calculators(props: CalcProps) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = CALCULATORS.filter((entry) => {
      const text = `${entry.name} ${entry.question} ${entry.group}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    const byGroup = new Map<string, CalcEntry[]>();
    for (const entry of matches) byGroup.set(entry.group, [...(byGroup.get(entry.group) ?? []), entry]);
    return [...byGroup.entries()];
  }, [query]);

  return (
    <div className="screen-stack calc-screen">
      <section className="screen-heading"><div><span className="eyebrow">Naira calculators</span><h1>Do the sums before the move.</h1><p>These work offline and never count toward your daily usage. Only the customer message uses AI.</p></div></section>
      <label className="calc-search">
        <Search size={16} aria-hidden="true" />
        <input className="field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Find a calculator (${CALCULATORS.length})`} aria-label="Find a calculator" />
      </label>
      {groups.length === 0 && <p className="muted-line">No calculator matches “{query}”.</p>}
      {groups.map(([group, entries]) => (
        <section className="calc-group" key={group} aria-label={group}>
          <h2>{group}</h2>
          <div className="calc-list">
            {entries.map((entry) => <CalcRow key={entry.id} entry={entry} props={props} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
