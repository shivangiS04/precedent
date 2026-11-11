/**
 * avi:jira:created:issue / avi:jira:updated:issue.
 * Runs as the app with no user context, so it never calls Teamwork Graph.
 * M3 adds the deterministic check, caching, and the optional single comment / label.
 */
interface IssueEvent {
  issue?: { id?: string; key?: string };
  selfGenerated?: boolean;
}

export const onIssueEvent = async (event: IssueEvent): Promise<void> => {
  if (event.selfGenerated) return; // belt and braces on top of filter.ignoreSelf
  console.log('Precedent: issue event received', event.issue?.key);
};
