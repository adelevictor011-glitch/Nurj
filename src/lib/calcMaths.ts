// Pure maths behind the naira calculators. Kept apart from the screens so every
// formula is unit-tested and the UI only formats numbers.

/** Parse what people type: "₦45,000", "45000", " 45 000 ". Anything else is 0. */
export function parseAmount(value: string): number {
  const number = Number(value.replace(/[₦,\s]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

// Paystack's published rate for local (Nigerian) payments, checked 16 Nov 2026
// at paystack.com/pricing: 1.5% + ₦100, the ₦100 waived under ₦2,500, and the
// whole fee capped at ₦2,000. Update here if Paystack changes it.
export const PAYSTACK_LOCAL = { rate: 0.015, flat: 100, flatWaivedBelow: 2500, cap: 2000 };

export function paystackLocalFee(amount: number): number {
  if (amount <= 0) return 0;
  const flat = amount < PAYSTACK_LOCAL.flatWaivedBelow ? 0 : PAYSTACK_LOCAL.flat;
  return Math.min(amount * PAYSTACK_LOCAL.rate + flat, PAYSTACK_LOCAL.cap);
}

export type PaymentMethod = 'paystack' | 'transfer' | 'custom';

export function paymentFee(amount: number, method: PaymentMethod, customPercent = 0): number {
  if (method === 'paystack') return paystackLocalFee(amount);
  if (method === 'custom') return Math.max(0, amount * (customPercent / 100));
  return 0; // direct bank transfer into your own account
}

/** Units to sell each month to cover fixed costs. null = every sale loses money. */
export function breakEven(fixedCosts: number, price: number, costPerUnit: number) {
  const marginPerUnit = price - costPerUnit;
  if (marginPerUnit <= 0) return null;
  const units = fixedCosts <= 0 ? 0 : Math.ceil(fixedCosts / marginPerUnit);
  return { marginPerUnit, units, revenue: units * price };
}

export function profitPerOrder(input: {
  price: number; productCost: number; packaging: number; delivery: number; other: number;
  method: PaymentMethod; customPercent?: number;
}) {
  const fee = paymentFee(input.price, input.method, input.customPercent);
  const costs = input.productCost + input.packaging + input.delivery + input.other + fee;
  const profit = input.price - costs;
  return { fee, costs, profit, margin: input.price > 0 ? profit / input.price : 0 };
}

/** Lowest hourly rate that pays you and the business costs from billable hours. */
export function hourlyRate(takeHome: number, businessCosts: number, billableHoursPerWeek: number) {
  const hoursPerMonth = billableHoursPerWeek * (52 / 12);
  if (hoursPerMonth <= 0) return null;
  const needed = takeHome + businessCosts;
  return { needed, hoursPerMonth, rate: needed / hoursPerMonth };
}

/** How many more sales a discount needs to earn the same profit. null = discount sells at a loss. */
export function discountImpact(price: number, costPerUnit: number, discountPercent: number, unitsNow: number) {
  const newPrice = price * (1 - discountPercent / 100);
  const marginBefore = price - costPerUnit;
  const marginAfter = newPrice - costPerUnit;
  const profitBefore = marginBefore * unitsNow;
  if (marginAfter <= 0) return { newPrice, marginBefore, marginAfter, profitBefore, unitsNeeded: null, extraPercent: null };
  const unitsNeeded = profitBefore <= 0 ? unitsNow : Math.ceil(profitBefore / marginAfter);
  const extraPercent = unitsNow > 0 ? (unitsNeeded / unitsNow - 1) * 100 : 0;
  return { newPrice, marginBefore, marginAfter, profitBefore, unitsNeeded, extraPercent };
}

/** Months for a paid-for customer to pay back what it cost to win them. */
export function customerPayback(input: {
  spend: number; customers: number; orderValue: number; marginPercent: number; ordersPerMonth: number;
}) {
  if (input.customers <= 0) return null;
  const costPerCustomer = input.spend / input.customers;
  const profitPerMonth = input.orderValue * (input.marginPercent / 100) * input.ordersPerMonth;
  const months = profitPerMonth > 0 ? costPerCustomer / profitPerMonth : Infinity;
  return { costPerCustomer, profitPerMonth, months };
}

/** Monthly business profit that safely replaces a salary, and how close you are. */
export function quitNumber(input: {
  salary: number; benefits: number; soloCosts: number; bufferPercent: number;
  monthsOfCover: number; currentProfit: number;
}) {
  const replace = input.salary + input.benefits + input.soloCosts;
  const target = replace * (1 + input.bufferPercent / 100);
  const savings = (input.salary + input.benefits) * input.monthsOfCover;
  const progress = target > 0 ? Math.min(1, Math.max(0, input.currentProfit / target)) : 0;
  return { replace, target, savings, gap: Math.max(0, target - input.currentProfit), progress };
}

// ---------------------------------------------------------------------------
// Calculators 11–30
// ---------------------------------------------------------------------------

/** Cash you must carry while you wait to be paid. */
export function lateFloat(monthlyCosts: number, monthlySales: number, daysToPay: number) {
  const months = Math.max(0, daysToPay) / 30;
  return { float: monthlyCosts * months, owedToYou: monthlySales * months };
}

/** Monthly rate that makes a stream of equal repayments worth the cash you actually received. */
function monthlyRateFor(received: number, payment: number, months: number): number {
  if (received <= 0 || payment <= 0 || months <= 0 || payment * months <= received) return 0;
  let low = 0;
  let high = 1; // 100% a month is beyond any real loan
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const value = payment * (1 - (1 + mid) ** -months) / mid;
    if (value > received) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

/** What a loan really costs. Flat = interest on the full amount every month (common with loan apps). */
export function loanCost(input: { amount: number; ratePercentPerMonth: number; months: number; fees: number; flat: boolean }) {
  const { amount, months, fees, flat } = input;
  if (amount <= 0 || months <= 0) return null;
  const r = input.ratePercentPerMonth / 100;
  let payment: number;
  if (flat) payment = (amount + amount * r * months) / months;
  else payment = r === 0 ? amount / months : amount * r / (1 - (1 + r) ** -months);
  const totalRepaid = payment * months;
  const interest = totalRepaid - amount;
  const trueMonthly = monthlyRateFor(amount - fees, payment, months);
  return { payment, totalRepaid, interest, totalCost: interest + fees, trueMonthlyPercent: trueMonthly * 100, trueYearlyPercent: ((1 + trueMonthly) ** 12 - 1) * 100 };
}

export function savingsTarget(target: number, saved: number, weeks: number) {
  if (weeks <= 0) return null;
  const left = Math.max(0, target - saved);
  return { left, perWeek: left / weeks, perDay: left / (weeks * 7), perMonth: left / (weeks / (52 / 12)) };
}

/** Ajo / esusu: everyone pays each round and one member collects the pot. */
export function ajo(contribution: number, members: number, position: number) {
  if (members < 1 || contribution <= 0) return null;
  const turn = Math.min(Math.max(1, Math.round(position)), members);
  const payout = contribution * members;
  return { payout, turn, paidBeforePayout: contribution * turn, stillOwedAfter: contribution * (members - turn) };
}

export function markupMargin(cost: number, marginPercent: number, markupPercent: number) {
  const margin = marginPercent / 100;
  const markup = markupPercent / 100;
  return {
    priceForMargin: margin < 1 ? cost / (1 - margin) : null,
    markupForMargin: margin < 1 ? (margin / (1 - margin)) * 100 : null,
    priceForMarkup: cost * (1 + markup),
    marginForMarkup: (markup / (1 + markup)) * 100,
  };
}

/** Price to charge so you still receive `target` after Paystack's local fee (Paystack's own formula). */
export function priceAfterPaystack(target: number) {
  if (target <= 0) return null;
  const { rate, flat, flatWaivedBelow, cap } = PAYSTACK_LOCAL;
  let price = target / (1 - rate);
  if (price >= flatWaivedBelow) price = (target + flat) / (1 - rate);
  if (paystackLocalFee(price) >= cap) price = target + cap;
  price = Math.ceil(price);
  return { price, fee: paystackLocalFee(price), received: price - paystackLocalFee(price) };
}

/** New price after costs rise, keeping either the same margin % or the same naira profit. */
export function inflationPrice(price: number, cost: number, costRisePercent: number) {
  const newCost = cost * (1 + costRisePercent / 100);
  const margin = price > 0 ? (price - cost) / price : 0;
  return {
    newCost,
    keepMarginPrice: margin < 1 ? newCost / (1 - margin) : null,
    keepProfitPrice: price + (newCost - cost),
    margin: margin * 100,
  };
}

/** Landed cost of a dollar-priced item at a new exchange rate. */
export function dollarImpact(input: { usdCost: number; oldRate: number; newRate: number; nairaCosts: number; price: number }) {
  const oldCost = input.usdCost * input.oldRate + input.nairaCosts;
  const newCost = input.usdCost * input.newRate + input.nairaCosts;
  const oldMargin = input.price > 0 ? (input.price - oldCost) / input.price : 0;
  return {
    oldCost, newCost, change: newCost - oldCost,
    newProfit: input.price - newCost,
    priceToKeepMargin: oldMargin < 1 ? newCost / (1 - oldMargin) : null,
  };
}

export function bundle(input: { priceA: number; costA: number; priceB: number; costB: number; bundlePrice: number }) {
  const separate = input.priceA + input.priceB;
  const costs = input.costA + input.costB;
  return {
    bundleProfit: input.bundlePrice - costs,
    separateProfit: separate - costs,
    singleProfit: input.priceA - input.costA,
    discountPercent: separate > 0 ? (1 - input.bundlePrice / separate) * 100 : 0,
  };
}

/** Smallest order whose profit still covers the delivery you pay for. */
export function freeDeliveryThreshold(deliveryCost: number, marginPercent: number, averageOrder: number) {
  const margin = marginPercent / 100;
  if (margin <= 0) return null;
  const threshold = deliveryCost / margin;
  return { threshold, rounded: Math.ceil(threshold / 500) * 500, profitOnAverage: averageOrder * margin - deliveryCost };
}

/** Highest wholesale price that still lets the reseller earn their margin at your retail price. */
export function wholesalePrice(input: { cost: number; retail: number; resellerMarginPercent: number; units: number }) {
  const price = input.retail * (1 - input.resellerMarginPercent / 100);
  const profitPerUnit = price - input.cost;
  return { price, profitPerUnit, orderProfit: profitPerUnit * input.units, orderValue: price * input.units };
}

export function enquiriesNeeded(salesTarget: number, averageOrder: number, conversionPercent: number) {
  if (averageOrder <= 0 || conversionPercent <= 0) return null;
  const orders = Math.ceil(salesTarget / averageOrder);
  const enquiries = Math.ceil(orders / (conversionPercent / 100));
  return { orders, enquiries, perWeek: Math.ceil(enquiries / (52 / 12)), perDay: Math.ceil(enquiries / 30) };
}

export function lifetimeValue(input: { orderValue: number; marginPercent: number; ordersPerMonth: number; months: number }) {
  const profitPerMonth = input.orderValue * (input.marginPercent / 100) * input.ordersPerMonth;
  const lifetimeProfit = profitPerMonth * input.months;
  return { profitPerMonth, lifetimeProfit, lifetimeSales: input.orderValue * input.ordersPerMonth * input.months, maxToWinOne: lifetimeProfit / 3 };
}

export function influencerDeal(input: { fee: number; reach: number; responsePercent: number; buyPercent: number; orderValue: number; marginPercent: number }) {
  const profitPerSale = input.orderValue * (input.marginPercent / 100);
  if (profitPerSale <= 0) return null;
  const buyers = input.reach * (input.responsePercent / 100) * (input.buyPercent / 100);
  return { buyers, profit: buyers * profitPerSale - input.fee, buyersToBreakEven: Math.ceil(input.fee / profitPerSale) };
}

export function firstHire(input: { monthlyCost: number; marginPercent: number; extraSales: number }) {
  const margin = input.marginPercent / 100;
  if (margin <= 0) return null;
  return { salesToCover: input.monthlyCost / margin, net: input.extraSales * margin - input.monthlyCost };
}

// Nigeria Tax Act 2025 personal income tax bands, in force from 1 January 2026.
// Checked 16 Nov 2026. Rent relief: 20% of annual rent, capped at ₦500,000.
export const NG_PIT_BANDS: Array<[number, number]> = [
  [800_000, 0], [2_200_000, 0.15], [9_000_000, 0.18], [13_000_000, 0.21], [25_000_000, 0.23], [Infinity, 0.25],
];
export const NG_RENT_RELIEF = { rate: 0.2, cap: 500_000 };

export function personalIncomeTax(chargeable: number): number {
  let left = Math.max(0, chargeable);
  let tax = 0;
  for (const [width, rate] of NG_PIT_BANDS) {
    const slice = Math.min(left, width);
    tax += slice * rate;
    left -= slice;
    if (left <= 0) break;
  }
  return tax;
}

/** Extra yearly tax a side business adds on top of a salary, and what to set aside monthly. */
export function taxSetAside(input: { yearlySalary: number; monthlyProfit: number; yearlyRent: number }) {
  const relief = Math.min(input.yearlyRent * NG_RENT_RELIEF.rate, NG_RENT_RELIEF.cap);
  const yearlyProfit = input.monthlyProfit * 12;
  const withoutBusiness = personalIncomeTax(input.yearlySalary - relief);
  const withBusiness = personalIncomeTax(input.yearlySalary + yearlyProfit - relief);
  const businessTax = withBusiness - withoutBusiness;
  return { relief, businessTax, perMonth: businessTax / 12, sharePercent: yearlyProfit > 0 ? (businessTax / yearlyProfit) * 100 : 0 };
}

export function reorderPoint(unitsPerWeek: number, leadDays: number, safetyDays: number, coverDays: number) {
  const perDay = unitsPerWeek / 7;
  return { perDay, reorderAt: Math.ceil(perDay * (leadDays + safetyDays)), orderQuantity: Math.ceil(perDay * coverDays) };
}

export function spaceVsHome(input: { monthlyCost: number; extraSales: number; marginPercent: number }) {
  const margin = input.marginPercent / 100;
  if (margin <= 0) return null;
  return { salesToCover: input.monthlyCost / margin, net: input.extraSales * margin - input.monthlyCost };
}

export function paymentMethods(amount: number, posPercent: number, posCap: number, cashCostPerSale: number) {
  const pos = posCap > 0 ? Math.min(amount * (posPercent / 100), posCap) : amount * (posPercent / 100);
  const options = [
    { method: 'Bank transfer', fee: 0 },
    { method: 'Paystack', fee: paystackLocalFee(amount) },
    { method: 'POS', fee: pos },
    { method: 'Cash', fee: Math.max(0, cashCostPerSale) },
  ];
  return options.sort((a, b) => a.fee - b.fee);
}

export function makerRate(input: { price: number; materials: number; hours: number; targetHourly: number }) {
  if (input.hours <= 0) return null;
  return { perHour: (input.price - input.materials) / input.hours, priceForTarget: input.materials + input.targetHourly * input.hours };
}
