import { daysBetween } from '../src/domain/dates';
import { decisionsToMarkdown } from '../src/domain/markdown';
import { northwindDecisions } from './fixtures';

describe('daysBetween', () => {
  it('counts whole days across month ends', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2026-11-13', '2026-12-13')).toBe(30);
    expect(daysBetween('2026-11-13', '2026-11-01')).toBe(-12);
  });
});

describe('decisionsToMarkdown', () => {
  it('renders titles, statuses, alternatives and the superseded note', () => {
    const md = decisionsToMarkdown(northwindDecisions(), '2026-11-21');
    expect(md.startsWith('# Decision Ledger')).toBe(true);
    expect(md).toContain('## Session cache on Postgres, not Redis');
    expect(md).toContain('- Redis: Second stateful system to run');
    expect(md).toContain('**Status:** superseded');
    expect(md).toContain('_Superseded by decision observability-datadog._');
  });
  it('handles an empty ledger', () => {
    expect(decisionsToMarkdown([], '2026-11-21')).toContain('0 decisions');
  });
});
