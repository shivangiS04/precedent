/**
 * dynamicProperties for jira:issueContext: sets the lozenge shown next to the
 * "Precedent" label in the issue sidebar. M2 replaces this with a real conflict count.
 */
export const contextStatus = async (): Promise<unknown> => ({
  status: { type: 'lozenge', value: { label: 'Not checked', type: 'default' } },
});
