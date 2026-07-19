import { describe, expect, it } from 'vitest';
import { assignStage, classifyBusiness } from './business';

describe('business intelligence helpers', () => {
  it('assigns the correct growth stage', () => {
    expect(assignStage([0, 0, 1, 0, 1]).key).toBe('validation');
    expect(assignStage([1, 2, 1, 2, 2]).key).toBe('launch');
    expect(assignStage([2, 3, 2, 3, 2]).key).toBe('scaling');
    expect(assignStage([3, 3, 3, 3, 3]).key).toBe('exit');
  });

  it('classifies common Nigerian small-business descriptions', () => {
    expect(classifyBusiness('I make organic skincare products')).toBe('beauty_skincare');
    expect(classifyBusiness('A dispatch and delivery company')).toBe('logistics');
    expect(classifyBusiness('I design logos for fashion brands')).toBe('fashion');
  });
});
