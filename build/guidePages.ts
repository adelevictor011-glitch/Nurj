// Public, indexable guide pages (roadmap feature 14).
//
// At build time this turns every free guide into a static HTML page at
// /guides/<slug>/ plus a /guides/ index and /sitemap.xml, so search engines
// and WhatsApp link previews see real content instead of an empty app shell.
// Locked guides are listed by title only and link back to the app.

import type { Plugin } from 'vite';
import { GUIDES, STAGES } from '../src/data';
import { GUIDE_CONTENT } from '../src/guides-content';
import type { GuideBlock, StageKey } from '../src/types';

const SITE = (process.env.APP_URL || 'https://nurjai.com').replace(/\/$/, '');

export function guideSlug(title: string): string {
  return title.toLowerCase().replace(/₦/g, 'naira-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function blockHtml(block: GuideBlock): string {
  if (block.kind === 'callout') return `<aside class="callout">${esc(block.body ?? '')}</aside>`;
  if (block.kind === 'text') return `<p>${esc(block.body ?? '')}</p>`;
  const tag = block.kind === 'steps' ? 'ol' : 'ul';
  return `${block.heading ? `<h2>${esc(block.heading)}</h2>` : ''}<${tag}>${(block.items ?? []).map((item) => `<li>${esc(item)}</li>`).join('')}</${tag}>`;
}

const STYLE = `
:root{color-scheme:dark;--bg:#080907;--panel:#121410;--line:rgba(255,255,255,.09);--text:#f5f6ef;--muted:#b4b9aa;--dim:#7d8376;--gold:#edb84c;--lime:#bdf56a}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
a{color:var(--gold)}
.wrap{max-width:720px;margin:0 auto;padding:22px 16px 64px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:34px}
.brand{color:var(--text);font-weight:800;letter-spacing:.02em;text-decoration:none;font-size:18px}
.top-cta{font-size:14px;text-decoration:none;border:1px solid var(--line);padding:8px 12px;border-radius:10px;color:var(--text)}
.eyebrow{color:var(--gold);font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px}
h1{font-size:clamp(28px,6vw,40px);line-height:1.15;margin:0 0 12px}
.lede{color:var(--muted);margin:0 0 28px;font-size:18px}
h2{font-size:20px;margin:30px 0 10px}
p,li{color:#dfe2d8}
ol,ul{padding-left:22px}li{margin:0 0 10px}
.callout{border-left:3px solid var(--gold);background:var(--panel);padding:14px 16px;border-radius:0 12px 12px 0;margin:24px 0;color:var(--text)}
.cta{margin:40px 0 0;padding:20px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}
.cta strong{display:block;font-size:19px;margin-bottom:6px}.cta p{margin:0 0 14px;color:var(--muted)}
.button{display:inline-block;background:var(--gold);color:#140f02;font-weight:700;text-decoration:none;padding:11px 16px;border-radius:11px}
.stage{margin:34px 0 0}.stage h2{margin-bottom:4px}.stage>p{margin:0 0 12px;color:var(--muted)}
.list{list-style:none;padding:0;margin:0}.list li{border-top:1px solid var(--line);padding:12px 0;margin:0}
.list a{text-decoration:none;font-weight:600}.list small{display:block;color:var(--dim);font-size:14px}
.tag{font-size:12px;color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:1px 6px;margin-left:6px}
footer{margin-top:48px;color:var(--dim);font-size:14px}footer a{color:var(--dim);margin-right:14px}
`;

function page(opts: { title: string; description: string; path: string; body: string; jsonLd?: unknown }): string {
  const url = `${SITE}${opts.path}`;
  return `<!doctype html>
<html lang="en-NG"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Nurj">
<meta property="og:title" content="${esc(opts.title)}"><meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icon-512.png">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
${opts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head><body><div class="wrap">
<header><a class="brand" href="/">Nurj</a><a class="top-cta" href="/">Open Nurj</a></header>
${opts.body}
<footer><a href="/guides/">All guides</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><p>Nurj is an AI business command centre for Nigerian side hustlers. Guides are general information, not legal, tax or financial advice.</p></footer>
</div></body></html>`;
}

const CTA = `<section class="cta"><strong>Turn this into your next move.</strong><p>Answer five questions and Nurj writes the exact AI prompt for your business and stage. Free to start.</p><a class="button" href="/">Run my free signal scan</a></section>`;

export function guidePagesPlugin(): Plugin {
  return {
    name: 'nurj-guide-pages',
    apply: 'build',
    generateBundle() {
      const urls: string[] = [`${SITE}/`, `${SITE}/guides/`, `${SITE}/terms`, `${SITE}/privacy`, `${SITE}/refunds`];
      const stageBlocks: string[] = [];

      for (const [stageKey, sections] of Object.entries(GUIDES) as Array<[StageKey, typeof GUIDES[StageKey]]>) {
        const stage = STAGES[stageKey];
        const rows: string[] = [];
        for (const section of sections) {
          for (const item of section.items) {
            const slug = guideSlug(item.title);
            if (item.free) {
              const blocks = GUIDE_CONTENT[item.title] ?? [];
              const path = `/guides/${slug}/`;
              urls.push(`${SITE}${path}`);
              this.emitFile({
                type: 'asset',
                fileName: `guides/${slug}/index.html`,
                source: page({
                  title: `${item.title} | Nurj guide for Nigerian side hustlers`,
                  description: item.description,
                  path,
                  body: `<p class="eyebrow">${esc(stage.label)} stage · ${item.minutes} min read</p><h1>${esc(item.title)}</h1><p class="lede">${esc(item.description)}</p>${blocks.map(blockHtml).join('\n')}${CTA}`,
                  jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: item.title, description: item.description, inLanguage: 'en-NG', publisher: { '@type': 'Organization', name: 'Nurj' }, mainEntityOfPage: `${SITE}${path}` },
                }),
              });
              rows.push(`<li><a href="${path}">${esc(item.title)}</a><small>${esc(item.description)} · ${item.minutes} min</small></li>`);
            } else {
              rows.push(`<li>${esc(item.title)}<span class="tag">Builder</span><small>${esc(item.description)}</small></li>`);
            }
          }
        }
        stageBlocks.push(`<section class="stage"><h2>${esc(stage.label)}</h2><p>${esc(stage.description)}</p><ul class="list">${rows.join('')}</ul></section>`);
      }

      this.emitFile({
        type: 'asset',
        fileName: 'guides/index.html',
        source: page({
          title: 'Free business guides for Nigerian side hustlers | Nurj',
          description: '52 practical guides for each stage of a Nigerian side hustle: validation, launch, scaling and leaving your 9-5. Read the free ones here.',
          path: '/guides/',
          body: `<p class="eyebrow">Nurj playbooks</p><h1>Guides for every stage of your side hustle</h1><p class="lede">Practical, Nigeria-specific playbooks. Free guides are open to everyone; the full library of 52 comes with Builder.</p>${stageBlocks.join('\n')}${CTA}`,
        }),
      });

      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`,
      });
    },
  };
}
