/** Renders decisions as a Markdown document for copying into Confluence or a wiki. Pure. */
import type { Decision } from './types';

const esc = (s: string) => s.replace(/\r/g, '').trim();

export function decisionsToMarkdown(decisions: Decision[], generatedOn: string): string {
  const lines: string[] = [`# Decision Ledger`, '', `Exported ${generatedOn} · ${decisions.length} decision${decisions.length === 1 ? '' : 's'}`, ''];
  for (const d of decisions) {
    lines.push(`## ${esc(d.title)}`, '', `**Status:** ${d.status}${d.decidedAt ? ` · **Decided:** ${d.decidedAt}` : ''}${d.revisitBy ? ` · **Revisit by:** ${d.revisitBy}` : ''}`, '');
    lines.push(`**Decision:** ${esc(d.statement)}`, '');
    if (d.rationale) lines.push(`**Why:** ${esc(d.rationale)}`, '');
    if (d.alternatives.length) {
      lines.push('**Rejected alternatives:**');
      for (const a of d.alternatives) lines.push(`- ${esc(a.alternative)}${a.reason ? `: ${esc(a.reason)}` : ''}`);
      lines.push('');
    }
    if (d.status === 'superseded' && d.supersededBy) lines.push(`_Superseded by decision ${d.supersededBy}._`, '');
    const links = d.sources.filter((s) => s.url).map((s) => `[${s.kind === 'confluence-page' ? `page ${s.ref}` : s.ref}](${s.url})`);
    if (links.length) lines.push(`**Sources:** ${links.join(', ')}`, '');
  }
  return lines.join('\n');
}
