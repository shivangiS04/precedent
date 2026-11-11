import { guarded } from '../src/actions/guard';

describe('guarded action', () => {
  it('rejects when context has no accountId and never runs the handler', async () => {
    const handler = jest.fn(async () => ({ ok: true }));
    const action = guarded(handler);
    const result = await action({ query: 'redis' }, { installContext: 'ari:cloud:jira::site/1' });
    expect(result).toMatchObject({ status: 'rejected' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores an accountId smuggled in through inputs', async () => {
    const handler = jest.fn(async () => ({ ok: true }));
    const action = guarded(handler);
    const result = await action({ accountId: '712020:attacker' }, {});
    expect(result).toMatchObject({ status: 'rejected' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes the context accountId to the handler', async () => {
    const handler = jest.fn(async (_p: unknown, accountId: string) => ({ accountId }));
    const action = guarded(handler);
    const result = await action({}, { principal: { accountId: '712020:alice' } });
    expect(result).toEqual({ accountId: '712020:alice' });
  });

  it('hides internal errors from the caller', async () => {
    const action = guarded(async () => {
      throw new Error('SQL timeout on decisions table');
    });
    const result = await action({}, { principal: { accountId: '712020:alice' } });
    expect(result).toEqual({ status: 'error', reason: expect.not.stringContaining('SQL') });
  });
});
