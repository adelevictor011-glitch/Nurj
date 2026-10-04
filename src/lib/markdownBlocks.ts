// Turns the light markdown AI outputs use (headings, bullets, numbered lists,
// **bold**, *italic*) into structured blocks, so Word and PDF exports keep the
// formatting instead of showing raw symbols.

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: InlineRun[] }
  | { kind: 'paragraph'; runs: InlineRun[] }
  | { kind: 'bullet'; runs: InlineRun[] }
  | { kind: 'numbered'; runs: InlineRun[]; list: number }
  | { kind: 'rule' };

export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  // **bold**, __bold__, *italic*, _italic_ (underscores only at word edges)
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*?)\*|(?<![A-Za-z0-9])_([^_\s][^_]*?)_(?![A-Za-z0-9]))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) runs.push({ text: text.slice(last, index) });
    if (match[2] ?? match[3]) runs.push({ text: (match[2] ?? match[3]) as string, bold: true });
    else runs.push({ text: (match[4] ?? match[5]) as string, italic: true });
    last = index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.filter((run) => run.text.length > 0);
}

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let listCounter = 0;
  let inNumbered = false;

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', runs: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };

  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*•+]\s+(.*)$/.exec(line);
    const numbered = /^\d{1,3}[.)]\s+(.*)$/.exec(line);

    if (!line) {
      flush();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      inNumbered = false;
      blocks.push({ kind: 'rule' });
      continue;
    }
    if (heading) {
      flush();
      inNumbered = false;
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, runs: parseInline(heading[2].replace(/\*\*/g, '')) });
      continue;
    }
    if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', runs: parseInline(bullet[1]) });
      continue;
    }
    if (numbered) {
      flush();
      if (!inNumbered) {
        listCounter += 1;
        inNumbered = true;
      }
      blocks.push({ kind: 'numbered', runs: parseInline(numbered[1]), list: listCounter });
      continue;
    }
    // A plain line ends a numbered list unless it continues a paragraph.
    if (!paragraph.length) inNumbered = false;
    paragraph.push(line);
  }
  flush();
  return blocks;
}
