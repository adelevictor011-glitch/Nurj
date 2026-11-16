// Calculators 11–30. Each is a body for an expandable row; the name and the
// question live in the registry in Calculators.tsx.
import { useState } from 'react';
import {
  ajo, bundle, dollarImpact, enquiriesNeeded, firstHire, freeDeliveryThreshold, inflationPrice, influencerDeal,
  lateFloat, lifetimeValue, loanCost, makerRate, markupMargin, parseAmount as n, paymentMethods, priceAfterPaystack,
  reorderPoint, savingsTarget, spaceVsHome, taxSetAside, wholesalePrice,
} from '../lib/calcMaths';
import { Choice, Field, Result, count, naira, percent } from './calcUi';

// ---- Cash and survival ----------------------------------------------------

export function LateFloat() {
  const [costs, setCosts] = useState('200000');
  const [sales, setSales] = useState('300000');
  const [days, setDays] = useState('30');
  const result = lateFloat(n(costs), n(sales), n(days));
  return (
    <div className="calc-body">
      <p className="calc-explain">When clients pay you weeks after the job, you still pay rent, data and staff in the meantime. That gap has to come out of your own pocket.</p>
      <div className="calc-grid">
        <Field label="Monthly costs" value={costs} onChange={setCosts} suffix="₦" />
        <Field label="Monthly sales on credit" value={sales} onChange={setSales} suffix="₦" />
        <Field label="Days clients take to pay" value={days} onChange={setDays} />
      </div>
      <Result headline={`Keep ${naira(result.float)} aside to cover the wait`}>
        <span>At any time, about {naira(result.owedToYou)} is owed to you. Asking for 50% upfront halves the gap.</span>
      </Result>
    </div>
  );
}

export function LoanCost() {
  const [amount, setAmount] = useState('200000');
  const [rate, setRate] = useState('5');
  const [months, setMonths] = useState('3');
  const [fees, setFees] = useState('0');
  const [kind, setKind] = useState<'flat' | 'reducing'>('flat');
  const result = loanCost({ amount: n(amount), ratePercentPerMonth: n(rate), months: n(months), fees: n(fees), flat: kind === 'flat' });
  return (
    <div className="calc-body">
      <p className="calc-explain">"5% a month" sounds small. On a loan app it is often charged on the full amount every month, even as you pay it down, so the true rate is higher.</p>
      <div className="calc-grid">
        <Field label="Amount borrowed" value={amount} onChange={setAmount} suffix="₦" />
        <Field label="Interest per month" value={rate} onChange={setRate} suffix="%" />
        <Field label="Months to repay" value={months} onChange={setMonths} />
        <Field label="Upfront fees taken off" value={fees} onChange={setFees} suffix="₦" hint="Processing, insurance or management fees." />
        <Choice label="How interest is charged" value={kind} onChange={setKind}
          options={[['flat', 'On the full amount every month'], ['reducing', 'On what is left to pay']]}
          hint="Check the loan terms. Most loan apps charge on the full amount." />
      </div>
      {result === null
        ? <Result headline="Add the amount and the months." />
        : <Result headline={`Pay ${naira(result.payment)} a month, ${naira(result.totalRepaid)} in total`}>
            <span>The loan costs you {naira(result.totalCost)}. That is really {percent(result.trueMonthlyPercent, 1)} a month, about {percent(result.trueYearlyPercent)} a year.</span>
          </Result>}
    </div>
  );
}

export function SavingsTarget() {
  const [target, setTarget] = useState('500000');
  const [saved, setSaved] = useState('100000');
  const [weeks, setWeeks] = useState('20');
  const result = savingsTarget(n(target), n(saved), n(weeks));
  return (
    <div className="calc-body">
      <p className="calc-explain">A big number feels far away. Split into weeks, it becomes something you can move today.</p>
      <div className="calc-grid">
        <Field label="Amount you need" value={target} onChange={setTarget} suffix="₦" />
        <Field label="Already saved" value={saved} onChange={setSaved} suffix="₦" />
        <Field label="Weeks until you need it" value={weeks} onChange={setWeeks} />
      </div>
      {result === null
        ? <Result headline="Add how many weeks you have." />
        : result.left === 0
          ? <Result headline="You already have enough." />
          : <Result headline={`Save ${naira(result.perWeek)} a week`}>
              <span>That is {naira(result.perDay)} a day or {naira(result.perMonth)} a month to cover the {naira(result.left)} left.</span>
            </Result>}
    </div>
  );
}

export function Ajo() {
  const [contribution, setContribution] = useState('20000');
  const [members, setMembers] = useState('10');
  const [position, setPosition] = useState('3');
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [goal, setGoal] = useState('200000');
  const result = ajo(n(contribution), n(members), n(position));
  return (
    <div className="calc-body">
      <p className="calc-explain">An ajo pays out exactly what you put in. Collecting early is like an interest-free loan; collecting late is plain saving. Your turn decides which.</p>
      <div className="calc-grid">
        <Field label="Contribution each round" value={contribution} onChange={setContribution} suffix="₦" />
        <Field label="Members" value={members} onChange={setMembers} />
        <Field label="Your turn to collect" value={position} onChange={setPosition} hint="1 means you collect first." />
        <Choice label="A round is every" value={period} onChange={setPeriod} options={[['week', 'Week'], ['month', 'Month']]} />
        <Field label="What you need the payout for" value={goal} onChange={setGoal} suffix="₦" />
      </div>
      {result === null
        ? <Result headline="Add the contribution and the members." />
        : <Result headline={`You collect ${naira(result.payout)} in ${period} ${result.turn}`} warn={result.payout < n(goal)}>
            <span>{result.payout >= n(goal) ? 'That covers what you need.' : `That is ${naira(n(goal) - result.payout)} short of what you need.`} By then you will have paid in {naira(result.paidBeforePayout)}{result.stillOwedAfter > 0 ? `, and you still owe ${naira(result.stillOwedAfter)} after` : ''}.</span>
          </Result>}
    </div>
  );
}

export function TaxSetAside() {
  const [salary, setSalary] = useState('4800000');
  const [profit, setProfit] = useState('200000');
  const [rent, setRent] = useState('1200000');
  const result = taxSetAside({ yearlySalary: n(salary), monthlyProfit: n(profit), yearlyRent: n(rent) });
  return (
    <div className="calc-body">
      <p className="calc-explain">Side hustle profit is added on top of your salary and taxed at your higher rate. Putting a little aside each month beats a big bill later.</p>
      <div className="calc-grid">
        <Field label="Yearly salary after pension" value={salary} onChange={setSalary} suffix="₦" hint="Use 0 if the business is your only income." />
        <Field label="Business profit each month" value={profit} onChange={setProfit} suffix="₦" />
        <Field label="Rent you pay each year" value={rent} onChange={setRent} suffix="₦" hint="20% of rent is deductible, up to ₦500,000." />
      </div>
      <Result headline={result.businessTax > 0 ? `Set aside ${naira(result.perMonth)} a month` : 'No extra tax on this profit'}>
        <span>{result.businessTax > 0 ? `About ${naira(result.businessTax)} a year, ${percent(result.sharePercent)} of your business profit.` : 'Your total income stays inside the tax-free band.'}</span>
        <small>An estimate for side hustles taxed as personal income, using the Nigeria Tax Act 2025 bands in force from January 2026. Registered companies follow company tax rules instead. Confirm with a tax adviser before filing.</small>
      </Result>
    </div>
  );
}

export function ReorderPoint() {
  const [perWeek, setPerWeek] = useState('35');
  const [lead, setLead] = useState('5');
  const [safety, setSafety] = useState('3');
  const [cover, setCover] = useState('30');
  const result = reorderPoint(n(perWeek), n(lead), n(safety), n(cover));
  return (
    <div className="calc-body">
      <p className="calc-explain">Restock when the shelf still has enough to last until the supplier delivers, plus a few spare days for Lagos traffic and late drivers.</p>
      <div className="calc-grid">
        <Field label="Units you sell each week" value={perWeek} onChange={setPerWeek} />
        <Field label="Days the supplier takes to deliver" value={lead} onChange={setLead} />
        <Field label="Spare days for delays" value={safety} onChange={setSafety} />
        <Field label="Days each order should last" value={cover} onChange={setCover} />
      </div>
      <Result headline={`Reorder when you have ${count(result.reorderAt)} left`}>
        <span>Order {count(result.orderQuantity)} units each time. You sell about {result.perDay.toFixed(1)} a day.</span>
      </Result>
    </div>
  );
}

// ---- Pricing and profit ---------------------------------------------------

export function MarkupMargin() {
  const [cost, setCost] = useState('7000');
  const [margin, setMargin] = useState('30');
  const [markup, setMarkup] = useState('30');
  const result = markupMargin(n(cost), n(margin), n(markup));
  return (
    <div className="calc-body">
      <p className="calc-explain">Markup is added to your cost; margin is your share of the price. Adding 30% to cost does not give you 30% of the price.</p>
      <div className="calc-grid">
        <Field label="Cost per unit" value={cost} onChange={setCost} suffix="₦" />
        <Field label="Margin you want" value={margin} onChange={setMargin} suffix="%" />
        <Field label="Or the markup you use now" value={markup} onChange={setMarkup} suffix="%" />
      </div>
      <Result headline={result.priceForMargin === null ? 'A margin must be under 100%.' : `Sell at ${naira(result.priceForMargin)} for a ${percent(n(margin))} margin`} warn={result.priceForMargin === null}>
        {result.markupForMargin !== null && <span>That is a {percent(result.markupForMargin, 1)} markup on cost.</span>}
        <span>Your {percent(n(markup))} markup prices it at {naira(result.priceForMarkup)}, a {percent(result.marginForMarkup, 1)} margin.</span>
      </Result>
    </div>
  );
}

export function PriceAfterFees() {
  const [target, setTarget] = useState('10000');
  const result = priceAfterPaystack(n(target));
  return (
    <div className="calc-body">
      <p className="calc-explain">If you want the customer to cover the payment fee, add it to the price so the amount that lands in your account is what you planned.</p>
      <div className="calc-grid">
        <Field label="Amount you want to receive" value={target} onChange={setTarget} suffix="₦" />
      </div>
      {result === null
        ? <Result headline="Add the amount you want to receive." />
        : <Result headline={`Charge ${naira(result.price)}`}>
            <span>Paystack keeps {naira(result.fee)} and you receive {naira(result.received)}. Uses Paystack's local rate: 1.5% + ₦100, ₦100 waived under ₦2,500, capped at ₦2,000.</span>
          </Result>}
    </div>
  );
}

export function InflationPrice() {
  const [price, setPrice] = useState('10000');
  const [cost, setCost] = useState('6000');
  const [rise, setRise] = useState('20');
  const result = inflationPrice(n(price), n(cost), n(rise));
  return (
    <div className="calc-body">
      <p className="calc-explain">When the market price of your inputs jumps, keeping last month's price quietly shrinks your profit. Two fair ways to update it:</p>
      <div className="calc-grid">
        <Field label="Current price" value={price} onChange={setPrice} suffix="₦" />
        <Field label="Current cost per unit" value={cost} onChange={setCost} suffix="₦" />
        <Field label="How much costs went up" value={rise} onChange={setRise} suffix="%" />
      </div>
      <Result headline={result.keepMarginPrice === null ? 'Your cost is at or above your price.' : `New price: ${naira(result.keepMarginPrice)} to keep your ${percent(result.margin)} margin`} warn={result.keepMarginPrice === null}>
        <span>Or {naira(result.keepProfitPrice)} to keep the same naira profit per sale. Cost is now {naira(result.newCost)}.</span>
      </Result>
    </div>
  );
}

export function DollarImpact() {
  const [usd, setUsd] = useState('10');
  const [oldRate, setOldRate] = useState('1500');
  const [newRate, setNewRate] = useState('1650');
  const [local, setLocal] = useState('3000');
  const [price, setPrice] = useState('30000');
  const result = dollarImpact({ usdCost: n(usd), oldRate: n(oldRate), newRate: n(newRate), nairaCosts: n(local), price: n(price) });
  return (
    <div className="calc-body">
      <p className="calc-explain">If you buy in dollars and sell in naira, every move in the exchange rate changes your cost before you sell a single unit.</p>
      <div className="calc-grid">
        <Field label="Item cost" value={usd} onChange={setUsd} suffix="$" />
        <Field label="Rate you bought at" value={oldRate} onChange={setOldRate} suffix="₦ per $" />
        <Field label="Rate now" value={newRate} onChange={setNewRate} suffix="₦ per $" />
        <Field label="Shipping and clearing per unit" value={local} onChange={setLocal} suffix="₦" />
        <Field label="Your selling price" value={price} onChange={setPrice} suffix="₦" />
      </div>
      <Result headline={`Each unit now costs ${naira(result.newCost)}, ${result.change >= 0 ? 'up' : 'down'} ${naira(Math.abs(result.change))}`} warn={result.newProfit <= 0}>
        <span>{result.newProfit > 0 ? `You make ${naira(result.newProfit)} per unit at your current price.` : `You lose ${naira(-result.newProfit)} per unit at your current price.`}{result.priceToKeepMargin !== null ? ` Price at ${naira(result.priceToKeepMargin)} to keep your old margin.` : ''}</span>
      </Result>
    </div>
  );
}

export function Bundle() {
  const [priceA, setPriceA] = useState('8000');
  const [costA, setCostA] = useState('5000');
  const [priceB, setPriceB] = useState('4000');
  const [costB, setCostB] = useState('2000');
  const [bundlePrice, setBundlePrice] = useState('11000');
  const result = bundle({ priceA: n(priceA), costA: n(costA), priceB: n(priceB), costB: n(costB), bundlePrice: n(bundlePrice) });
  const wins = result.bundleProfit > result.singleProfit;
  return (
    <div className="calc-body">
      <p className="calc-explain">A bundle earns less than selling both items at full price, but more than selling only the main item. It wins when it gets people to take the second one.</p>
      <div className="calc-grid">
        <Field label="Main item price" value={priceA} onChange={setPriceA} suffix="₦" />
        <Field label="Main item cost" value={costA} onChange={setCostA} suffix="₦" />
        <Field label="Add-on price" value={priceB} onChange={setPriceB} suffix="₦" />
        <Field label="Add-on cost" value={costB} onChange={setCostB} suffix="₦" />
        <Field label="Bundle price" value={bundlePrice} onChange={setBundlePrice} suffix="₦" />
      </div>
      <Result headline={`${naira(result.bundleProfit)} profit per bundle (${percent(result.discountPercent)} off)`} warn={result.bundleProfit <= 0}>
        <span>Both items separately: {naira(result.separateProfit)}. Main item alone: {naira(result.singleProfit)}. {wins ? 'The bundle pays if it turns single-item buyers into bundle buyers.' : 'The bundle earns less than the main item alone. Raise its price.'}</span>
      </Result>
    </div>
  );
}

export function FreeDelivery() {
  const [delivery, setDelivery] = useState('2500');
  const [margin, setMargin] = useState('25');
  const [average, setAverage] = useState('12000');
  const result = freeDeliveryThreshold(n(delivery), n(margin), n(average));
  return (
    <div className="calc-body">
      <p className="calc-explain">Free delivery comes out of your profit. Set a minimum order where the profit on the order still pays the rider.</p>
      <div className="calc-grid">
        <Field label="Delivery cost per order" value={delivery} onChange={setDelivery} suffix="₦" />
        <Field label="Your profit margin" value={margin} onChange={setMargin} suffix="%" />
        <Field label="Average order now" value={average} onChange={setAverage} suffix="₦" />
      </div>
      {result === null
        ? <Result headline="Add your profit margin." />
        : <Result headline={`Free delivery on orders over ${naira(result.rounded)}`}>
            <span>{result.profitOnAverage >= 0 ? `On your average order you keep ${naira(result.profitOnAverage)} after paying the rider.` : `On your average order, free delivery loses you ${naira(-result.profitOnAverage)}.`}</span>
          </Result>}
    </div>
  );
}

export function Wholesale() {
  const [cost, setCost] = useState('4000');
  const [retail, setRetail] = useState('10000');
  const [resellerMargin, setResellerMargin] = useState('35');
  const [units, setUnits] = useState('50');
  const result = wholesalePrice({ cost: n(cost), retail: n(retail), resellerMarginPercent: n(resellerMargin), units: n(units) });
  return (
    <div className="calc-body">
      <p className="calc-explain">A reseller needs room to make money at your retail price. Start from what they need, then check what is left for you.</p>
      <div className="calc-grid">
        <Field label="Your cost per unit" value={cost} onChange={setCost} suffix="₦" />
        <Field label="Retail price" value={retail} onChange={setRetail} suffix="₦" />
        <Field label="Margin the reseller needs" value={resellerMargin} onChange={setResellerMargin} suffix="%" hint="Resellers often ask for 30 to 40%." />
        <Field label="Units in the order" value={units} onChange={setUnits} />
      </div>
      <Result headline={`Wholesale at ${naira(result.price)} a unit`} warn={result.profitPerUnit <= 0}>
        <span>{result.profitPerUnit > 0 ? `You keep ${naira(result.profitPerUnit)} a unit, ${naira(result.orderProfit)} on this order of ${naira(result.orderValue)}.` : `That is below your cost. You would lose ${naira(-result.profitPerUnit)} a unit.`}</span>
      </Result>
    </div>
  );
}

export function PaymentMethods() {
  const [amount, setAmount] = useState('20000');
  const [posPercent, setPosPercent] = useState('0.5');
  const [posCap, setPosCap] = useState('1000');
  const [cash, setCash] = useState('150');
  const ranked = paymentMethods(n(amount), n(posPercent), n(posCap), n(cash));
  return (
    <div className="calc-body">
      <p className="calc-explain">Every way of getting paid costs something, even cash: the trip to the bank and the risk of holding it.</p>
      <div className="calc-grid">
        <Field label="Typical sale" value={amount} onChange={setAmount} suffix="₦" />
        <Field label="Your POS charge" value={posPercent} onChange={setPosPercent} suffix="%" hint="Check with your POS provider." />
        <Field label="POS charge cap" value={posCap} onChange={setPosCap} suffix="₦" hint="Use 0 if there is no cap." />
        <Field label="Cost of handling cash per sale" value={cash} onChange={setCash} suffix="₦" hint="Bank trips, change, risk." />
      </div>
      <Result headline={`Cheapest: ${ranked[0].method} (${naira(ranked[0].fee)})`}>
        <span>{ranked.slice(1).map((option) => `${option.method} ${naira(option.fee)}`).join(' · ')}</span>
      </Result>
    </div>
  );
}

export function MakerRate() {
  const [price, setPrice] = useState('25000');
  const [materials, setMaterials] = useState('9000');
  const [hours, setHours] = useState('4');
  const [target, setTarget] = useState('5000');
  const result = makerRate({ price: n(price), materials: n(materials), hours: n(hours), targetHourly: n(target) });
  return (
    <div className="calc-body">
      <p className="calc-explain">For cakes, outfits or crafts, your time is part of the cost. Divide what is left after materials by the hours it took.</p>
      <div className="calc-grid">
        <Field label="Price of one item" value={price} onChange={setPrice} suffix="₦" />
        <Field label="Materials for one item" value={materials} onChange={setMaterials} suffix="₦" />
        <Field label="Hours to make it" value={hours} onChange={setHours} />
        <Field label="What you want to earn per hour" value={target} onChange={setTarget} suffix="₦" />
      </div>
      {result === null
        ? <Result headline="Add the hours it takes." />
        : <Result headline={`You earn ${naira(result.perHour)} an hour`} warn={result.perHour < n(target)}>
            <span>{result.perHour >= n(target) ? 'That meets your target.' : `Price it at ${naira(result.priceForTarget)} to earn ${naira(n(target))} an hour.`}</span>
          </Result>}
    </div>
  );
}

// ---- Growth ---------------------------------------------------------------

export function EnquiriesNeeded() {
  const [target, setTarget] = useState('500000');
  const [order, setOrder] = useState('10000');
  const [conversion, setConversion] = useState('20');
  const result = enquiriesNeeded(n(target), n(order), n(conversion));
  return (
    <div className="calc-body">
      <p className="calc-explain">Not every "how much?" DM becomes a sale. Work backwards from your target to the conversations you need each week.</p>
      <div className="calc-grid">
        <Field label="Monthly sales target" value={target} onChange={setTarget} suffix="₦" />
        <Field label="Average order" value={order} onChange={setOrder} suffix="₦" />
        <Field label="Enquiries that buy" value={conversion} onChange={setConversion} suffix="%" hint="Out of 10 people who ask, how many pay? 2 is 20%." />
      </div>
      {result === null
        ? <Result headline="Add your average order and how many enquiries buy." />
        : <Result headline={`You need ${count(result.enquiries)} enquiries a month`}>
            <span>About {count(result.perWeek)} a week ({count(result.perDay)} a day) to land {count(result.orders)} orders.</span>
          </Result>}
    </div>
  );
}

export function LifetimeValue() {
  const [order, setOrder] = useState('10000');
  const [margin, setMargin] = useState('30');
  const [orders, setOrders] = useState('1');
  const [months, setMonths] = useState('12');
  const result = lifetimeValue({ orderValue: n(order), marginPercent: n(margin), ordersPerMonth: n(orders), months: n(months) });
  return (
    <div className="calc-body">
      <p className="calc-explain">A customer who comes back every month is worth far more than their first order. This is what keeping one is worth.</p>
      <div className="calc-grid">
        <Field label="Average order" value={order} onChange={setOrder} suffix="₦" />
        <Field label="Profit margin" value={margin} onChange={setMargin} suffix="%" />
        <Field label="Orders per month" value={orders} onChange={setOrders} />
        <Field label="Months they keep buying" value={months} onChange={setMonths} />
      </div>
      <Result headline={`A loyal customer is worth ${naira(result.lifetimeProfit)} in profit`}>
        <span>From {naira(result.lifetimeSales)} in sales. You could spend up to {naira(result.maxToWinOne)} to win one and still keep most of it.</span>
      </Result>
    </div>
  );
}

export function InfluencerDeal() {
  const [fee, setFee] = useState('100000');
  const [reach, setReach] = useState('20000');
  const [respond, setRespond] = useState('1');
  const [buy, setBuy] = useState('10');
  const [order, setOrder] = useState('15000');
  const [margin, setMargin] = useState('30');
  const result = influencerDeal({ fee: n(fee), reach: n(reach), responsePercent: n(respond), buyPercent: n(buy), orderValue: n(order), marginPercent: n(margin) });
  return (
    <div className="calc-body">
      <p className="calc-explain">Followers are not customers. Count how many buyers the post must bring just to pay for itself, then ask if that is realistic.</p>
      <div className="calc-grid">
        <Field label="Influencer's fee" value={fee} onChange={setFee} suffix="₦" />
        <Field label="People who will see the post" value={reach} onChange={setReach} hint="Ask for their average views, not followers." />
        <Field label="Viewers who click or DM" value={respond} onChange={setRespond} suffix="%" />
        <Field label="Of those, how many buy" value={buy} onChange={setBuy} suffix="%" />
        <Field label="Average order" value={order} onChange={setOrder} suffix="₦" />
        <Field label="Profit margin" value={margin} onChange={setMargin} suffix="%" />
      </div>
      {result === null
        ? <Result headline="Add your average order and margin." />
        : <Result headline={`The post needs ${count(result.buyersToBreakEven)} buyers to pay for itself`} warn={result.profit < 0}>
            <span>Your guesses give about {count(result.buyers)} buyers: {result.profit >= 0 ? `${naira(result.profit)} profit after the fee` : `a ${naira(-result.profit)} loss after the fee`}.</span>
          </Result>}
    </div>
  );
}

export function FirstHire() {
  const [cost, setCost] = useState('100000');
  const [margin, setMargin] = useState('25');
  const [extra, setExtra] = useState('500000');
  const result = firstHire({ monthlyCost: n(cost), marginPercent: n(margin), extraSales: n(extra) });
  return (
    <div className="calc-body">
      <p className="calc-explain">A helper pays for themselves when they bring in, or free you to bring in, enough extra sales to cover their pay.</p>
      <div className="calc-grid">
        <Field label="Monthly pay plus transport and data" value={cost} onChange={setCost} suffix="₦" />
        <Field label="Your profit margin" value={margin} onChange={setMargin} suffix="%" />
        <Field label="Extra monthly sales they make possible" value={extra} onChange={setExtra} suffix="₦" />
      </div>
      {result === null
        ? <Result headline="Add your profit margin." />
        : <Result headline={result.net >= 0 ? `The hire adds ${naira(result.net)} a month` : `The hire costs you ${naira(-result.net)} a month`} warn={result.net < 0}>
            <span>They need to bring in {naira(result.salesToCover)} in extra sales a month to cover themselves.</span>
          </Result>}
    </div>
  );
}

export function SpaceVsHome() {
  const [cost, setCost] = useState('150000');
  const [extra, setExtra] = useState('400000');
  const [margin, setMargin] = useState('30');
  const result = spaceVsHome({ monthlyCost: n(cost), extraSales: n(extra), marginPercent: n(margin) });
  return (
    <div className="calc-body">
      <p className="calc-explain">A shop or office looks serious, but rent, power and service charge arrive every month. It pays only if it brings in more profit than it costs.</p>
      <div className="calc-grid">
        <Field label="Monthly rent, power and service charge" value={cost} onChange={setCost} suffix="₦" hint="Spread yearly rent over 12 months." />
        <Field label="Extra monthly sales from having the space" value={extra} onChange={setExtra} suffix="₦" />
        <Field label="Your profit margin" value={margin} onChange={setMargin} suffix="%" />
      </div>
      {result === null
        ? <Result headline="Add your profit margin." />
        : <Result headline={result.net >= 0 ? `The space adds ${naira(result.net)} a month` : `The space costs you ${naira(-result.net)} a month`} warn={result.net < 0}>
            <span>It needs {naira(result.salesToCover)} in extra sales a month to pay for itself.</span>
          </Result>}
    </div>
  );
}
