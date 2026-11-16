import { describe, expect, it } from 'vitest';
import {
  breakEven, customerPayback, discountImpact, hourlyRate, parseAmount, paymentFee,
  paystackLocalFee, profitPerOrder, quitNumber,
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
