import { cleanTitle, draftFromPage, htmlToText } from '../src/domain/pageDraft';
import { validateDecisionInput } from '../src/domain/parse';

// Same shape scripts/seed-site.mjs writes for the NWENG ADR pages.
const adr = `
<h2>Status</h2><p>Accepted</p>
<h2>Decision</h2><p><strong>We will store user sessions in Postgres unlogged tables, not Redis or ElastiCache.</strong></p>
<h2>Context</h2><p>Session reads peak around 2k rps. Adding Redis means a second stateful system &amp; its own on-call.</p>
<h2>Alternatives considered</h2>
<table><tbody><tr><th>Alternative</th><th>Why rejected</th></tr>
<tr><td>Redis</td><td>Second stateful system; on-call burden</td></tr><tr><td>Memcached</td><td>No persistence</td></tr>
</tbody></table>`;

describe('draftFromPage', () => {
  it('extracts an ADR page into a valid decision draft', () => {
    const d = draftFromPage('ADR-007: Session cache on Postgres, not Redis', adr);
    expect(d.title).toBe('Session cache on Postgres, not Redis');
    expect(d.statement).toBe('We will store user sessions in Postgres unlogged tables, not Redis or ElastiCache.');
    expect(d.rationale).toContain('second stateful system & its own on-call');
    expect(d.alternatives).toBe('Redis :: Second stateful system; on-call burden\nMemcached :: No persistence');
    expect(d.keywords).toBe('redis\nmemcached');
    expect(d.status).toBe('accepted');
    expect(validateDecisionInput({ ...d, scope: { keywords: d.keywords } }).ok).toBe(true);
  });

  it('treats draft pages as proposed', () => {
    expect(draftFromPage('ADR-015 (draft): Adopt OpenTelemetry', adr).status).toBe('proposed');
  });

  it('falls back to a "we will" sentence and list alternatives on free-form pages', () => {
    const d = draftFromPage(
      'Queue choice',
      '<p>After a long thread we will use Kafka for domain events. Ops agreed.</p><h3>Options</h3><ul><li>SQS - no replay</li><li>RabbitMQ</li></ul>',
    );
    expect(d.statement).toBe('we will use Kafka for domain events.');
    expect(d.alternatives).toBe('SQS :: no replay\nRabbitMQ');
  });

  it('returns empty fields rather than guessing when nothing matches', () => {
    const d = draftFromPage('Team offsite', '<p>Lunch at noon.</p>');
    expect(d.statement).toBe('');
    expect(d.alternatives).toBe('');
  });
});

describe('helpers', () => {
  it('cleans ADR prefixes', () => {
    expect(cleanTitle('ADR-2: Flags')).toBe('Flags');
    expect(cleanTitle('RFC 12 - Thing')).toBe('Thing');
    expect(cleanTitle('Plain title')).toBe('Plain title');
  });
  it('strips tags and decodes entities', () => {
    expect(htmlToText('<p>A &lt;b&gt; &amp; C</p>')).toBe('A <b> & C');
  });
});
