import { describe, expect, it } from 'vitest';
import {
  ajo, breakEven, bundle, customerPayback, discountImpact, dollarImpact, enquiriesNeeded, firstHire,
  freeDeliveryThreshold, hourlyRate, inflationPrice, influencerDeal, lateFloat, lifetimeValue, loanCost,
  makerRate, markupMargin, parseAmount, paymentFee, paymentMethods, paystackLocalFee, personalIncomeTax,
  priceAfterPaystack, profitPerOrder, quitNumber, reorderPoint, savingsTarget, spaceVsHome, taxSetAside,
  wholesalePrice,
} from './calcMaths';

describe('parseAmount', () => {
  it('reads naira the way people type it', () => {
    expect(parseAmount('₦45,000')).toBe(45000);
    expect(parseAmount(' 12 500 ')).toBe(12500);
    expect(parseAmount('abc')).toBe(0);
  });
});

describe('paystackLocalFee', () => {
  it('waives the ₦100 under ₦2,500', () => {
    expect(paystackLocalFee(2000)).toBeCloseTo(30);
  });
  it('adds ₦100 from ₦2,500', () => {
    expect(paystackLocalFee(10000)).toBeCloseTo(250);
  });
  it('caps the fee at ₦2,000', () => {
    expect(paystackLocalFee(1_000_000)).toBe(2000);
  });
  it('charges nothing on a direct transfer', () => {
    expect(paymentFee(10000, 'transfer')).toBe(0);
    expect(paymentFee(10000, 'custom', 2)).toBe(200);
  });
});

describe('breakEven', () => {
  it('rounds units up', () => {
    expect(breakEven(100000, 5000, 3000)).toEqual({ marginPerUnit: 2000, units: 50, revenue: 250000 });
    expect(breakEven(100001, 5000, 3000)?.units).toBe(51);
  });
  it('flags a price at or below cost', () => {
    expect(breakEven(100000, 3000, 3000)).toBeNull();
  });
});

describe('profitPerOrder', () => {
  it('takes every cost and the payment fee off the price', () => {
    const result = profitPerOrder({ price: 15000, productCost: 8000, packaging: 500, delivery: 2000, other: 0, method: 'paystack' });
    expect(result.fee).toBeCloseTo(325);
    expect(result.profit).toBeCloseTo(4175);
    expect(result.margin).toBeCloseTo(4175 / 15000);
  });
});

describe('hourlyRate', () => {
  it('covers take-home pay and costs from billable hours', () => {
    const result = hourlyRate(300000, 60000, 20);
    expect(result?.hoursPerMonth).toBeCloseTo(86.67, 1);
    expect(result?.rate).toBeCloseTo(4153.8, 0);
  });
  it('needs some billable hours', () => {
    expect(hourlyRate(300000, 0, 0)).toBeNull();
  });
});

describe('discountImpact', () => {
  it('shows the extra sales a discount needs', () => {
    const result = discountImpact(10000, 6000, 20, 50);
    expect(result.newPrice).toBe(8000);
    expect(result.unitsNeeded).toBe(100);
    expect(result.extraPercent).toBeCloseTo(100);
  });
  it('flags a discount that sells at a loss', () => {
    expect(discountImpact(10000, 9000, 20, 50).unitsNeeded).toBeNull();
  });
});

describe('customerPayback', () => {
  it('divides the cost of a customer by their monthly profit', () => {
    const result = customerPayback({ spend: 50000, customers: 10, orderValue: 10000, marginPercent: 25, ordersPerMonth: 1 });
    expect(result?.costPerCustomer).toBe(5000);
    expect(result?.profitPerMonth).toBe(2500);
    expect(result?.months).toBe(2);
  });
  it('needs at least one customer', () => {
    expect(customerPayback({ spend: 50000, customers: 0, orderValue: 1, marginPercent: 1, ordersPerMonth: 1 })).toBeNull();
  });
});

describe('quitNumber', () => {
  it('adds a buffer and tracks progress', () => {
    const result = quitNumber({ salary: 400000, benefits: 50000, soloCosts: 50000, bufferPercent: 20, monthsOfCover: 6, currentProfit: 300000 });
    expect(result.target).toBe(600000);
    expect(result.savings).toBe(2700000);
    expect(result.gap).toBe(300000);
    expect(result.progress).toBe(0.5);
  });
});

describe('cash and survival, calculators 11–20', () => {
  it('late-payer float covers costs for the waiting days', () => {
    expect(lateFloat(200000, 300000, 45)).toEqual({ float: 300000, owedToYou: 450000 });
  });
  it('flat-rate loans cost more than their headline rate', () => {
    const flat = loanCost({ amount: 100000, ratePercentPerMonth: 5, months: 3, fees: 0, flat: true })!;
    expect(flat.payment).toBeCloseTo(38333.33, 1);
    expect(flat.interest).toBeCloseTo(15000);
    expect(flat.trueMonthlyPercent).toBeCloseTo(7.33, 1);
    const reducing = loanCost({ amount: 100000, ratePercentPerMonth: 5, months: 3, fees: 0, flat: false })!;
    expect(reducing.trueMonthlyPercent).toBeCloseTo(5, 2);
  });
  it('counts upfront fees in the true cost', () => {
    const result = loanCost({ amount: 100000, ratePercentPerMonth: 0, months: 1, fees: 5000, flat: true })!;
    expect(result.totalCost).toBe(5000);
    expect(result.trueMonthlyPercent).toBeCloseTo(5.26, 1);
  });
  it('splits a savings target into weeks', () => {
    expect(savingsTarget(500000, 100000, 20)?.perWeek).toBe(20000);
    expect(savingsTarget(500000, 0, 0)).toBeNull();
  });
  it('works out an ajo payout and what is still owed', () => {
    expect(ajo(20000, 10, 3)).toEqual({ payout: 200000, turn: 3, paidBeforePayout: 60000, stillOwedAfter: 140000 });
  });
  it('uses the 2026 personal income tax bands', () => {
    expect(personalIncomeTax(800000)).toBe(0);
    expect(personalIncomeTax(3000000)).toBeCloseTo(330000);
    expect(personalIncomeTax(15000000)).toBeCloseTo(2580000);
  });
  it('sets aside the extra tax a side business adds to a salary', () => {
    const result = taxSetAside({ yearlySalary: 4800000, monthlyProfit: 200000, yearlyRent: 1200000 });
    expect(result.relief).toBe(240000);
    expect(result.businessTax).toBeCloseTo(432000);
    expect(result.perMonth).toBeCloseTo(36000);
  });
  it('caps rent relief at ₦500,000', () => {
    expect(taxSetAside({ yearlySalary: 0, monthlyProfit: 0, yearlyRent: 10000000 }).relief).toBe(500000);
  });
  it('sets a reorder point from lead time and a safety margin', () => {
    expect(reorderPoint(35, 5, 3, 30)).toEqual({ perDay: 5, reorderAt: 40, orderQuantity: 150 });
  });
});

describe('pricing and profit, calculators 11–20', () => {
  it('converts markup and margin both ways', () => {
    const result = markupMargin(7000, 30, 30);
    expect(result.priceForMargin).toBeCloseTo(10000);
    expect(result.markupForMargin).toBeCloseTo(42.86, 1);
    expect(result.marginForMarkup).toBeCloseTo(23.08, 1);
  });
  it('grosses a price up so you receive the target after Paystack', () => {
    for (const target of [2000, 2470, 10000, 200000]) {
      const result = priceAfterPaystack(target)!;
      expect(result.received).toBeGreaterThanOrEqual(target);
      expect(result.received - target).toBeLessThan(2);
    }
    expect(priceAfterPaystack(200000)?.price).toBe(202000);
  });
  it('updates a price after costs rise', () => {
    expect(inflationPrice(10000, 6000, 20)).toMatchObject({ newCost: 7200, keepProfitPrice: 11200 });
    expect(inflationPrice(10000, 6000, 20).keepMarginPrice).toBeCloseTo(12000);
  });
  it('recosts dollar-priced stock at a new rate', () => {
    const result = dollarImpact({ usdCost: 10, oldRate: 1500, newRate: 1650, nairaCosts: 3000, price: 30000 });
    expect(result.change).toBe(1500);
    expect(result.priceToKeepMargin).toBeCloseTo(32500);
  });
  it('compares a bundle with separate sales', () => {
    expect(bundle({ priceA: 8000, costA: 5000, priceB: 4000, costB: 2000, bundlePrice: 11000 }))
      .toMatchObject({ bundleProfit: 4000, separateProfit: 5000, singleProfit: 3000 });
  });
  it('finds the free-delivery threshold', () => {
    expect(freeDeliveryThreshold(2500, 25, 12000)).toMatchObject({ threshold: 10000, rounded: 10000, profitOnAverage: 500 });
    expect(freeDeliveryThreshold(2500, 0, 12000)).toBeNull();
  });
  it('prices wholesale so the reseller keeps their margin', () => {
    expect(wholesalePrice({ cost: 4000, retail: 10000, resellerMarginPercent: 35, units: 50 }))
      .toMatchObject({ price: 6500, profitPerUnit: 2500, orderProfit: 125000 });
  });
  it('ranks payment methods by fee', () => {
    const ranked = paymentMethods(20000, 0.5, 1000, 150).map((option) => option.method);
    expect(ranked).toEqual(['Bank transfer', 'POS', 'Cash', 'Paystack']);
  });
  it('shows what a maker earns per hour', () => {
    expect(makerRate({ price: 25000, materials: 9000, hours: 4, targetHourly: 5000 })).toEqual({ perHour: 4000, priceForTarget: 29000 });
  });
});

describe('growth, calculators 11–20', () => {
  it('turns a sales target into enquiries', () => {
    expect(enquiriesNeeded(500000, 10000, 20)).toMatchObject({ orders: 50, enquiries: 250 });
  });
  it('values a repeat customer', () => {
    expect(lifetimeValue({ orderValue: 10000, marginPercent: 30, ordersPerMonth: 1, months: 12 }))
      .toMatchObject({ profitPerMonth: 3000, lifetimeProfit: 36000, maxToWinOne: 12000 });
  });
  it('finds the buyers an influencer post needs', () => {
    expect(influencerDeal({ fee: 100000, reach: 20000, responsePercent: 1, buyPercent: 10, orderValue: 15000, marginPercent: 30 }))
      .toMatchObject({ buyers: 20, buyersToBreakEven: 23 });
  });
  it('checks a first hire and a shop space', () => {
    expect(firstHire({ monthlyCost: 100000, marginPercent: 25, extraSales: 500000 })).toEqual({ salesToCover: 400000, net: 25000 });
    expect(spaceVsHome({ monthlyCost: 150000, extraSales: 400000, marginPercent: 30 })?.net).toBeCloseTo(-30000);
  });
});
