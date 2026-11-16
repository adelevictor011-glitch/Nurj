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
