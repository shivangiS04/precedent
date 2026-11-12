import { searchDecisions } from '../src/domain/search';
import { northwindDecisions } from './fixtures';

const decisions = northwindDecisions();
const ids = (q: string, opts = {}) => searchDecisions(q, decisions, opts).map((h) => h.decision.id);

describe('searchDecisions', () => {
  it('answers "what did we decide about caching" with the session cache decision first', () => {
    expect(ids('What did we decide about caching and why?')[0]).toBe('session-cache');
  });

  it('finds decisions by a rejected alternative', () => {
    expect(ids('redis')[0]).toBe('session-cache');
    expect(ids('graphql')[0]).toBe('public-api-rest');
  });

  it('ranks the live decision above the superseded one it replaced', () => {
    const res = ids('logging');
    expect(res.indexOf('observability-datadog')).toBeLessThan(res.indexOf('logs-elk'));
  });

  it('returns nothing for question words alone or unrelated topics', () => {
    expect(ids('what did we decide?')).toEqual([]);
    expect(ids('office coffee machine')).toEqual([]);
  });

  it('can list a project when the query has no topic words', () => {
    const res = searchDecisions('', decisions, { project: 'PAY', limit: 20 });
    expect(res.length).toBeGreaterThan(3);
    expect(res.every((h) => h.decision.scope.projects.includes('PAY'))).toBe(true);
  });

  it('respects the limit', () => {
    expect(searchDecisions('service', decisions, { limit: 2 }).length).toBeLessThanOrEqual(2);
  });
});
