import {
  canTransition,
  parseAlternatives,
  parseList,
  parseProjectKeys,
  parseSourceUrl,
  validateDecisionInput,
} from '../src/domain/parse';

describe('parseList', () => {
  it('splits on newlines and commas, trims, dedupes case-insensitively', () => {
    expect(parseList('redis\n Cache, elasticache\nRedis\n\n')).toEqual(['redis', 'Cache', 'elasticache']);
  });
  it('strips bullet markers and can lowercase', () => {
    expect(parseList('- Redis\n• ElastiCache', { lowercase: true })).toEqual(['redis', 'elasticache']);
  });
  it('handles empty input', () => {
    expect(parseList(undefined)).toEqual([]);
    expect(parseList('   ')).toEqual([]);
  });
});

describe('parseProjectKeys', () => {
  it('uppercases and drops invalid keys', () => {
    expect(parseProjectKeys('pay, PLAT\n1BAD\nx')).toEqual(['PAY', 'PLAT']);
  });
});

describe('parseAlternatives', () => {
  it('parses "alternative :: reason" lines and keeps commas in reasons', () => {
    expect(parseAlternatives('Redis :: ops burden, another cluster\nMemcached')).toEqual([
      { alternative: 'Redis', reason: 'ops burden, another cluster' },
      { alternative: 'Memcached', reason: '' },
    ]);
  });
});

describe('parseSourceUrl', () => {
  it('recognises Jira issue URLs', () => {
    expect(parseSourceUrl('https://acme.atlassian.net/browse/PLAT-412')).toMatchObject({ kind: 'jira-issue', ref: 'PLAT-412' });
  });
  it('recognises Jira comment URLs', () => {
    expect(parseSourceUrl('https://acme.atlassian.net/browse/PAY-7?focusedCommentId=10042')).toMatchObject({
      kind: 'jira-comment',
      ref: 'PAY-7',
      commentId: '10042',
    });
  });
  it('recognises Confluence page URLs', () => {
    expect(parseSourceUrl('https://acme.atlassian.net/wiki/spaces/ENG/pages/393219/ADR+Redis')).toMatchObject({
      kind: 'confluence-page',
      ref: '393219',
    });
  });
  it('rejects non-Atlassian and non-https URLs', () => {
    expect(parseSourceUrl('https://evil.example.com/browse/PLAT-1')).toBeNull();
    expect(parseSourceUrl('http://acme.atlassian.net/browse/PLAT-1')).toBeNull();
    expect(parseSourceUrl('not a url')).toBeNull();
  });
});

describe('canTransition', () => {
  it('allows the documented lifecycle', () => {
    expect(canTransition('proposed', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'revisit')).toBe(true);
    expect(canTransition('revisit', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'superseded')).toBe(true);
  });
  it('treats superseded as terminal', () => {
    expect(canTransition('superseded', 'accepted')).toBe(false);
  });
  it('does not allow going back to proposed', () => {
    expect(canTransition('accepted', 'proposed')).toBe(false);
  });
});

describe('validateDecisionInput', () => {
  const base = { title: 'Session cache', statement: 'We will use Postgres, not Redis.', rationale: 'Ops burden.' };

  it('accepts a minimal decision and defaults status to proposed', () => {
    const r = validateDecisionInput(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('proposed');
  });

  it('reports every missing required field', () => {
    const r = validateDecisionInput({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['rationale', 'statement', 'title']);
  });

  it('parses newline-delimited action inputs', () => {
    const r = validateDecisionInput({
      ...base,
      alternatives: 'Redis :: ops burden\nMemcached :: no persistence',
      scope: { keywords: 'Redis\ncache', projects: 'plat\npay' },
    });
    expect(r.ok && r.value.alternatives).toHaveLength(2);
    expect(r.ok && r.value.scope?.keywords).toEqual(['redis', 'cache']);
    expect(r.ok && r.value.scope?.projects).toEqual(['PLAT', 'PAY']);
  });

  it('accepts arrays from the UI form', () => {
    const r = validateDecisionInput({ ...base, scope: { keywords: ['Redis', 'redis', 'Cache'] } });
    expect(r.ok && r.value.scope?.keywords).toEqual(['redis', 'cache']);
  });

  it('rejects bad dates and revisit-before-decision', () => {
    const bad = validateDecisionInput({ ...base, decidedAt: '2026-02-30' });
    expect(!bad.ok && bad.errors.decidedAt).toBeTruthy();
    const order = validateDecisionInput({ ...base, decidedAt: '2026-05-01', revisitBy: '2026-01-01' });
    expect(!order.ok && order.errors.revisitBy).toBeTruthy();
  });

  it('rejects unknown status', () => {
    const r = validateDecisionInput({ ...base, status: 'approved' });
    expect(!r.ok && r.errors.status).toBeTruthy();
  });

  it('keeps only recognised sources', () => {
    const r = validateDecisionInput({
      ...base,
      sources: [{ url: 'https://acme.atlassian.net/browse/PLAT-1' }, { url: 'https://evil.example.com/x' }, { kind: 'nope', ref: 'x' }],
    });
    expect(r.ok && r.value.sources).toEqual([expect.objectContaining({ kind: 'jira-issue', ref: 'PLAT-1' })]);
  });
});
