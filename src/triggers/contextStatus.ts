import { badgeFor } from '../core/check';

/**
 * dynamicProperties for jira:issueContext: the lozenge next to "Precedent" in the issue
 * sidebar. Reads the cached check (written by the trigger and the live panel).
 */
interface Payload {
  extension?: { issue?: { id?: string } };
}

export const contextStatus = async (payload: Payload, context?: { principal?: { accountId?: string }; accountId?: string }): Promise<unknown> => {
  const issueId = payload?.extension?.issue?.id;
  const accountId = context?.principal?.accountId ?? context?.accountId ?? null;
  let value: { label: string; type: string } = { label: 'Not checked', type: 'default' };
  if (issueId) {
    try {
      value = await badgeFor(String(issueId), accountId);
    } catch (err) {
      console.warn('Precedent: badge lookup failed', err);
    }
  }
  return { status: { type: 'lozenge', value } };
};
