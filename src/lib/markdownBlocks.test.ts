import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline } from './markdownBlocks';

describe('markdown export blocks', () => {
  it('keeps bold and italic as formatting, not symbols', () => {
    expect(parseInline('Charge **₦12,500** for the *premium* box')).toEqual([
      { text: 'Charge ' },
      { text: '₦12,500', bold: true },
      { text: ' for the ' },
      { text: 'premium', italic: true },
      { text: ' box' },
    ]);
  });

  it('does not treat snake_case words as italics', () => {
    expect(parseInline('use business_category here')).toEqual([{ text: 'use business_category here' }]);
  });

  it('builds headings, bullets and restarting numbered lists', () => {
    const blocks = parseBlocks('## Plan\n1. One\n2. Two\n\nNext\n\n1. Again\n- A bullet');
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'numbered', 'numbered', 'paragraph', 'numbered', 'bullet']);
    const lists = blocks.filter((block) => block.kind === 'numbered').map((block) => (block.kind === 'numbered' ? block.list : 0));
    expect(lists).toEqual([1, 1, 2]);
  });
});
