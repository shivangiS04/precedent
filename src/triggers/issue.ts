import { checkIssueInBackground } from '../core/check';

/**
 * avi:jira:created:issue / avi:jira:updated:issue.
 * Runs as the app with no viewer, so it never calls Teamwork Graph. It refreshes the
 * conflict cache (for the sidebar badge), labels high-confidence conflicts and, if an
 * admin enabled it, posts a single comment.
 */
interface IssueEvent {
  issue?: { id?: string; key?: string };
  atlassianId?: string;
  selfGenerated?: boolean;
}

export const onIssueEvent = async (event: IssueEvent): Promise<void> => {
  if (event.selfGenerated) return; // belt and braces on top of filter.ignoreSelf
  const issueId = event.issue?.id;
  if (!issueId) return;
  try {
    await checkIssueInBackground(String(issueId), event.atlassianId ?? null);
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    if (/doesn't exist|not exist|unknown table/i.test(message)) return; // migrations still running
    console.error(`Precedent: background check failed for ${event.issue?.key}`, err);
  }
};
