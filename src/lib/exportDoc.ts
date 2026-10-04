// PDF and Word export (roadmap feature 15). Both are file conversions in the
// browser, so they never count toward daily usage.
//
// Word: a real .docx built with the `docx` library (loaded only when someone
// exports, so it never slows the app down). Headings, bullets, numbered lists,
// bold and italics become proper Word formatting, not pasted symbols.

import { parseBlocks, type Block, type InlineRun } from './markdownBlocks';

const BRAND = '1F2A14';
const ACCENT = 'B07D1F';
const MUTED = '6B6B6B';
const FONT = 'Calibri';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function today(): string {
  return new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fileName(title: string, extension: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'nurj';
  return `${slug}.${extension}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Word (.docx) ----

export async function buildDocx(title: string, text: string) {
  const docx = await import('docx');
  const { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Paragraph, TextRun } = docx;

  const runs = (items: InlineRun[], size = 22) =>
    items.map((run) => new TextRun({ text: run.text, bold: run.bold, italics: run.italic, font: FONT, size }));

  const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const blocks: Block[] = parseBlocks(text);

  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, font: FONT })] }),
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 6 } },
      children: [new TextRun({ text: `Made with Nurj · ${today()}`, font: FONT, size: 18, color: MUTED })],
    }),
    ...blocks.map((block) => {
      switch (block.kind) {
        case 'heading':
          return new Paragraph({ heading: headingLevels[block.level - 1], children: runs(block.runs) });
        case 'bullet':
          return new Paragraph({ numbering: { reference: 'nurj-bullets', level: 0 }, children: runs(block.runs) });
        case 'numbered':
          return new Paragraph({ numbering: { reference: 'nurj-numbers', level: 0, instance: block.list }, children: runs(block.runs) });
        case 'rule':
          return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } }, children: [] });
        default:
          return new Paragraph({ children: runs(block.runs) });
      }
    }),
  ];

  return new Document({
    creator: 'Nurj',
    title,
    styles: {
      default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 140, line: 300 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 40, bold: true, color: BRAND }, paragraph: { spacing: { after: 60 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 30, bold: true, color: BRAND }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: BRAND }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 23, bold: true, color: ACCENT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'nurj-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'nurj-numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
}

export async function exportWord(title: string, text: string) {
  const { Packer } = await import('docx');
  const blob = await Packer.toBlob(await buildDocx(title, text));
  download(blob, fileName(title, 'docx'));
}

// ---- PDF (print to PDF), using the same structure ----

function inlineHtml(runs: InlineRun[]): string {
  return runs.map((run) => {
    let html = escapeHtml(run.text);
    if (run.bold) html = `<strong>${html}</strong>`;
    if (run.italic) html = `<em>${html}</em>`;
    return html;
  }).join('');
}

function documentHtml(title: string, text: string): string {
  const parts: string[] = [];
  let openList: 'ul' | 'ol' | null = null;
  let currentList = 0;
  const close = () => {
    if (openList) parts.push(`</${openList}>`);
    openList = null;
  };
  for (const block of parseBlocks(text)) {
    if (block.kind === 'bullet') {
      if (openList !== 'ul') { close(); parts.push('<ul>'); openList = 'ul'; }
      parts.push(`<li>${inlineHtml(block.runs)}</li>`);
      continue;
    }
    if (block.kind === 'numbered') {
      if (openList !== 'ol' || currentList !== block.list) { close(); parts.push('<ol>'); openList = 'ol'; currentList = block.list; }
      parts.push(`<li>${inlineHtml(block.runs)}</li>`);
      continue;
    }
    close();
    if (block.kind === 'heading') parts.push(`<h${block.level + 1}>${inlineHtml(block.runs)}</h${block.level + 1}>`);
    else if (block.kind === 'rule') parts.push('<hr>');
    else parts.push(`<p>${inlineHtml(block.runs)}</p>`);
  }
  close();

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page{margin:2.2cm}
body{font-family:Calibri,'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;color:#1a1a1a;line-height:1.55;font-size:11pt}
h1{font-size:20pt;color:#${BRAND};margin:0 0 2px}
h2{font-size:15pt;color:#${BRAND};margin:18px 0 6px}
h3{font-size:13pt;color:#${BRAND};margin:16px 0 6px}
h4{font-size:11.5pt;color:#${ACCENT};margin:14px 0 4px}
.meta{color:#${MUTED};font-size:9pt;padding-bottom:8px;border-bottom:1.5px solid #${ACCENT};margin-bottom:16px}
p{margin:0 0 8px} ul,ol{margin:0 0 8px;padding-left:22px} li{margin:0 0 4px}
hr{border:0;border-top:1px solid #ccc;margin:14px 0}
</style>
</head><body><h1>${escapeHtml(title)}</h1><div class="meta">Made with Nurj · ${today()}</div>${parts.join('')}</body></html>`;
}

export function exportPdf(title: string, text: string) {
  // Prints a clean copy; the browser's "Save as PDF" makes the file.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return;
  doc.open();
  doc.write(documentHtml(title, text));
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  window.setTimeout(() => frame.remove(), 60_000);
}
