import { describe, expect, it } from 'vitest';
import { GUIDES } from './data';
import { GUIDE_CONTENT } from './guides-content';

describe('guide library', () => {
  const stages = Object.entries(GUIDES);
  const items = stages.flatMap(([, sections]) => sections.flatMap((section) => section.items));

  it('has 52 guides: 13 per stage in four sections', () => {
    expect(items).toHaveLength(52);
    for (const [, sections] of stages) {
      expect(sections).toHaveLength(4);
      expect(sections.reduce((sum, section) => sum + section.items.length, 0)).toBe(13);
    }
  });

  it('keeps 2 to 3 free guides per stage', () => {
    for (const [, sections] of stages) {
      const free = sections.flatMap((section) => section.items).filter((item) => item.free).length;
      expect(free).toBeGreaterThanOrEqual(2);
      expect(free).toBeLessThanOrEqual(3);
    }
  });

  it('has written content for every guide, and no orphans', () => {
    const titles = new Set(items.map((item) => item.title));
    expect(titles.size).toBe(52);
    for (const title of titles) expect(GUIDE_CONTENT[title]?.length ?? 0).toBeGreaterThan(2);
    for (const title of Object.keys(GUIDE_CONTENT)) expect(titles.has(title)).toBe(true);
  });
});
