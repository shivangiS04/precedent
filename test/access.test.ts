import {
  AccessDeniedError,
  filterVisible,
  requireAccountId,
  type HasSources,
  type PermissionClient,
} from '../src/permissions/access';

const ALICE = '712020:alice';

/** Fake client: `issues` = browsable issue ids, `pages` = readable page ids. */
function fakeClient(opts: { issues?: number[]; pages?: string[]; jiraThrows?: boolean; confluenceThrows?: boolean }) {
  const calls = { jira: 0, confluence: 0 };
  const client: PermissionClient = {
    async browsableIssueIds(_accountId, ids) {
      calls.jira++;
      if (opts.jiraThrows) throw new Error('boom');
      return new Set(ids.filter((id) => (opts.issues ?? []).includes(id)));
    },
    async canReadPage(_accountId, pageId) {
      calls.confluence++;
      if (opts.confluenceThrows) throw new Error('boom');
      return (opts.pages ?? []).includes(pageId);
    },
  };
  return { client, calls };
}

const fromPage = (id: string, pageId: string): HasSources => ({
  id,
  sources: [{ kind: 'confluence-page', ref: pageId }],
});
const fromIssue = (id: string, issueId: number): HasSources => ({
  id,
  sources: [{ kind: 'jira-issue', ref: `PLAT-${issueId}`, refNumericId: issueId }],
});

describe('requireAccountId', () => {
  it('reads principal.accountId', () => {
    expect(requireAccountId({ principal: { accountId: ALICE } })).toBe(ALICE);
  });

  it('accepts top-level accountId', () => {
    expect(requireAccountId({ accountId: ALICE })).toBe(ALICE);
  });

  it.each([undefined, null, {}, { principal: {} }, { principal: { accountId: '' } }, { accountId: '   ' }, { accountId: 42 }])(
    'rejects a context with no usable accountId: %p',
    (ctx) => {
      expect(() => requireAccountId(ctx)).toThrow(AccessDeniedError);
    },
  );
});

describe('filterVisible', () => {
  it('does not return a decision whose Confluence source the user cannot view', async () => {
    const { client } = fakeClient({ pages: ['100'] });
    const result = await filterVisible([fromPage('visible', '100'), fromPage('hidden', '200')], ALICE, client);
    expect(result.map((d) => d.id)).toEqual(['visible']);
  });

  it('does not return a decision whose Jira source the user cannot browse', async () => {
    const { client } = fakeClient({ issues: [10001] });
    const result = await filterVisible([fromIssue('visible', 10001), fromIssue('hidden', 10002)], ALICE, client);
    expect(result.map((d) => d.id)).toEqual(['visible']);
  });

  it('requires ALL sources to be visible', async () => {
    const { client } = fakeClient({ issues: [10001], pages: [] });
    const mixed: HasSources = {
      id: 'mixed',
      sources: [
        { kind: 'jira-issue', ref: 'PLAT-1', refNumericId: 10001 },
        { kind: 'confluence-page', ref: '999' },
      ],
    };
    expect(await filterVisible([mixed], ALICE, client)).toEqual([]);
  });

  it('returns ledger-only decisions (no sources)', async () => {
    const { client } = fakeClient({});
    const result = await filterVisible([{ id: 'ledger-only', sources: [] }], ALICE, client);
    expect(result.map((d) => d.id)).toEqual(['ledger-only']);
  });

  it('fails closed when the Jira check errors', async () => {
    const { client } = fakeClient({ issues: [10001], jiraThrows: true });
    expect(await filterVisible([fromIssue('d', 10001)], ALICE, client)).toEqual([]);
  });

  it('fails closed when the Confluence check errors', async () => {
    const { client } = fakeClient({ pages: ['100'], confluenceThrows: true });
    expect(await filterVisible([fromPage('d', '100')], ALICE, client)).toEqual([]);
  });

  it('withholds Jira sources that lack a numeric id', async () => {
    const { client } = fakeClient({ issues: [10001] });
    const noId: HasSources = { id: 'd', sources: [{ kind: 'jira-issue', ref: 'PLAT-1' }] };
    expect(await filterVisible([noId], ALICE, client)).toEqual([]);
  });

  it('batches Jira ids and caches page checks', async () => {
    const { client, calls } = fakeClient({ issues: [1, 2], pages: ['p'] });
    await filterVisible([fromIssue('a', 1), fromIssue('b', 2), fromPage('c', 'p'), fromPage('d', 'p')], ALICE, client);
    expect(calls.jira).toBe(1);
    expect(calls.confluence).toBe(1);
  });

  it('rejects an empty accountId', async () => {
    const { client } = fakeClient({});
    await expect(filterVisible([fromPage('d', '1')], '', client)).rejects.toThrow(AccessDeniedError);
  });
});
