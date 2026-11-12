/**
 * Builds a decision draft from a Confluence page (storage format). Pure and tested.
 * Recognises common ADR headings (Status, Decision, Context, Alternatives/Options) and
 * falls back to the first "we will ..." sentence. The user always reviews the draft.
 */
import type { DecisionStatus } from './types';

export interface PageDraft {
  title: string;
  statement: string;
  rationale: string;
  alternatives: string; // "alternative :: reason" per line
  keywords: string; // one per line
  status: DecisionStatus;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–' };
export const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);

export const htmlToText = (html: string) =>
  decode(
    html
      .replace(/<(br|\/p|\/li|\/tr|\/h\d)[^>]*>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

/** Splits storage HTML into { heading -> html } sections. */
function sections(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = html.split(/<h[1-4][^>]*>/i);
  out.set('', parts[0] ?? '');
  for (const part of parts.slice(1)) {
    const close = part.search(/<\/h[1-4]>/i);
    if (close < 0) continue;
    const heading = htmlToText(part.slice(0, close)).toLowerCase();
    out.set(heading, part.slice(close).replace(/^<\/h[1-4]>/i, ''));
  }
  return out;
}

const find = (secs: Map<string, string>, re: RegExp) => {
  for (const [h, body] of secs) if (h && re.test(h)) return body;
  return null;
};

const firstSentence = (text: string) => (text.match(/^[\s\S]*?[.!?](\s|$)/)?.[0] ?? text).trim();

export function cleanTitle(title: string): string {
  return title.replace(/^\s*(ADR|RFC|DR)[-\s]?\d+\s*(\((draft|proposed)\))?\s*[:\-–]\s*/i, '').trim() || title.trim();
}

export function draftFromPage(pageTitle: string, storage: string): PageDraft {
  const secs = sections(storage ?? '');
  const all = htmlToText(storage ?? '');

  // Statement: bold text in a "Decision" section, else its first sentence, else a "we will" sentence.
  const decisionHtml = find(secs, /^(the )?decision( outcome)?$|^decision\b/);
  let statement = '';
  if (decisionHtml) {
    const strong = decisionHtml.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    statement = htmlToText(strong ? strong[1] : '') || firstSentence(htmlToText(decisionHtml));
  }
  if (!statement) statement = all.match(/\bwe (will|decided to|chose)\b[^.\n]*[.]?/i)?.[0]?.trim() ?? '';

  const rationale = [find(secs, /context|rationale|why|background|consequence|reason/)]
    .filter((x): x is string => !!x)
    .map(htmlToText)
    .join('\n')
    .trim();

  // Alternatives: table rows (first two cells) or list items.
  const altHtml = find(secs, /alternative|options|rejected|considered/);
  const alts: string[] = [];
  if (altHtml) {
    for (const row of altHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      if (/<th/i.test(row)) continue;
      const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(htmlToText);
      if (cells[0]) alts.push(cells[1] ? `${cells[0]} :: ${cells[1]}` : cells[0]);
    }
    if (!alts.length) {
      for (const li of altHtml.match(/<li[\s\S]*?<\/li>/gi) ?? []) {
        const t = htmlToText(li);
        const [a, ...r] = t.split(/\s[-–—:]\s/);
        if (a) alts.push(r.length ? `${a.trim()} :: ${r.join(' - ').trim()}` : a.trim());
      }
    }
  }

  const keywords = [...new Set(alts.map((a) => a.split('::')[0].trim().toLowerCase()).filter((k) => k && k.length <= 40))];

  const statusText = htmlToText(find(secs, /^status$/) ?? '').toLowerCase();
  const isDraft = /\b(draft|proposed)\b/i.test(pageTitle) || /\b(draft|proposed)\b/.test(statusText);
  const status: DecisionStatus = !isDraft && /\baccepted\b/.test(statusText) ? 'accepted' : 'proposed';

  return {
    title: cleanTitle(pageTitle).slice(0, 255),
    statement: statement.slice(0, 2000),
    rationale: rationale.slice(0, 8000),
    alternatives: alts.join('\n'),
    keywords: keywords.join('\n'),
    status,
  };
}
