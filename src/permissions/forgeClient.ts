import api, { route } from '@forge/api';
import type { PermissionClient } from './access';

/**
 * asApp()-based permission checks (safe for third-party MCP invocations).
 * - Jira:       POST /rest/api/3/permissions/check  (scope: read:permission:jira)
 * - Confluence: POST /wiki/rest/api/content/{id}/permission/check  (scope: read:confluence-content.permission)
 */
export const forgePermissionClient: PermissionClient = {
  async browsableIssueIds(accountId, issueIds) {
    const res = await api.asApp().requestJira(route`/rest/api/3/permissions/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        accountId,
        projectPermissions: [{ permissions: ['BROWSE_PROJECTS'], issues: issueIds }],
      }),
    });
    if (!res.ok) throw new Error(`Jira permission check failed: ${res.status}`);
    const body = (await res.json()) as {
      projectPermissions?: { permission: string; issues: number[] }[];
    };
    const entry = body.projectPermissions?.find((p) => p.permission === 'BROWSE_PROJECTS');
    return new Set(entry?.issues ?? []);
  },

  async canReadPage(accountId, pageId) {
    const res = await api
      .asApp()
      .requestConfluence(route`/wiki/rest/api/content/${pageId}/permission/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ subject: { type: 'user', identifier: accountId }, operation: 'read' }),
      });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`Confluence permission check failed: ${res.status}`);
    const body = (await res.json()) as { hasPermission?: boolean };
    return body.hasPermission === true;
  },
};
