// PDF and Word export (roadmap feature 15). Both are file conversions in the
// browser, so they never count toward daily usage.

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function documentHtml(title: string, text: string): string {
  const body = escapeHtml(text).split(/\n{2,}/).map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;max-width:680px;margin:40px auto;padding:0 16px;color:#111;line-height:1.6;font-size:12pt}h1{font-size:18pt;margin:0 0 4px}small{color:#666}</style>
</head><body><h1>${escapeHtml(title)}</h1><small>Made with Nurj · ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</small>${body}</body></html>`;
}

function fileName(title: string, extension: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'nurj';
  return `${slug}.${extension}`;
}

export function exportWord(title: string, text: string) {
  // Word opens HTML saved as .doc, which keeps paragraphs and headings.
  const blob = new Blob(['﻿', documentHtml(title, text)], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(title, 'doc');
  link.click();
  URL.revokeObjectURL(url);
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
