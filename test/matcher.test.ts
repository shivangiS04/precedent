import { matchDecisions, matchDecision } from '../src/domain/matcher';
import { adfToText, stem, tokenize } from '../src/domain/text';
import { northwindDecisions, WORK } from './fixtures';

const decisions = northwindDecisions();
const top = (work: (typeof WORK)[keyof typeof WORK]) => matchDecisions(work, decisions);

describe('text', () => {
  it('stems plural and verb forms to the same token', () => {
    expect(stem('flags')).toBe(stem('flag'));
    expect(stem('encrypted')).toBe(stem('encrypt'));
    expect(stem('caching')).toBe(stem('cache'));
    expect(stem('services')).toBe(stem('service'));
  });
  it('tokenizes punctuation away', () => {
    expect(tokenize('Redis (ElastiCache)!')).toEqual(['redi', 'elasticach']);
  });
  it('flattens ADF', () => {
    const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add ' }, { type: 'text', text: 'Redis' }] }] };
    expect(adfToText(adf).trim()).toBe('Add Redis');
  });
});

describe('matcher on Northwind demo work', () => {
  const CASES: [keyof typeof WORK, string, string][] = [
    ['redis', 'session-cache', 'Redis'],
    ['flags', 'feature-flags', 'Homegrown flags'],
    ['graphql', 'public-api-rest', 'GraphQL'],
    ['pan', 'card-data', 'Store encrypted PANs'],
    ['float', 'money-minor-units', 'Float/double'],
  ];
  for (const [work, decisionId, alternative] of CASES) {
    it(`${work} conflicts with ${decisionId} via "${alternative}"`, () => {
      const [first] = top(WORK[work]);
      expect(first).toMatchObject({ decisionId, kind: 'conflict', level: 'high' });
      expect(first.collidesWith?.alternative).toBe(alternative);
      expect(first.explanation).toContain(alternative);
    });
  }

  it('flags the new microservice as related to the ADR policy, not a hard conflict', () => {
    const [first] = top(WORK.service);
    expect(first).toMatchObject({ decisionId: 'microservices-adr', kind: 'related' });
  });

  it('finds nothing for unrelated work', () => {
    expect(top(WORK.neutral)).toEqual([]);
  });

  it('does not match a decision against the work item it was recorded from', () => {
    expect(top(WORK.spike).map((m) => m.decisionId)).not.toContain('session-cache');
  });

  it('never returns superseded decisions', () => {
    const elk = matchDecisions({ summary: 'Add Kibana dashboards for ELK logging' }, decisions);
    expect(elk.map((m) => m.decisionId)).not.toContain('logs-elk');
    expect(elk[0]).toMatchObject({ decisionId: 'observability-datadog', kind: 'conflict' });
  });

  it('does not treat a generic single keyword as related', () => {
    expect(matchDecisions({ summary: 'Fix typo in API docs', projectKey: 'PLAT' }, decisions)).toEqual([]);
  });

  it('lowers confidence outside the decision scope and says so', () => {
    const inScope = matchDecision({ summary: 'Add Redis cache', projectKey: 'PLAT' }, decisions.find((d) => d.id === 'session-cache')!)!;
    const outScope = matchDecision({ summary: 'Add Redis cache', projectKey: 'MKT' }, decisions.find((d) => d.id === 'session-cache')!)!;
    expect(outScope.confidence).toBeLessThan(inScope.confidence);
    expect(outScope.inScope).toBe(false);
    expect(outScope.explanation).toContain('scoped to PLAT');
  });

  it('discounts proposed decisions and says they are not agreed', () => {
    const m = matchDecisions({ summary: 'Switch to the Datadog-native tracer for OpenTelemetry tracing', projectKey: 'PLAT' }, decisions).find(
      (x) => x.decisionId === 'otel-tracing',
    )!;
    expect(m.explanation).toContain('only proposed');
  });

  it('uses admin aliases', () => {
    const d = decisions.find((x) => x.id === 'session-cache')!;
    expect(matchDecision({ summary: 'Try Valkey for faster dashboards' }, d)).toBeNull();
    expect(matchDecision({ summary: 'Try Valkey for session caching' }, d, { aliases: { redis: ['valkey'] } })).not.toBeNull();
  });

  it('puts conflicts before related matches', () => {
    const res = matchDecisions({ summary: 'Add Redis queue for async jobs and a new microservice', projectKey: 'PLAT' }, decisions);
    const firstRelated = res.findIndex((m) => m.kind === 'related');
    const lastConflict = res.map((m) => m.kind).lastIndexOf('conflict');
    expect(lastConflict).toBeLessThan(firstRelated === -1 ? Infinity : firstRelated);
  });
});
