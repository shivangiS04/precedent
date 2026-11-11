import api, { route } from '@forge/api';
import type { Source } from '../domain/types';

/**
 * Resolves user-entered sources as the CURRENT USER (asUser), which both fills in
 * numeric ids/titles and proves the user can see what they're citing.
 */
export async function resolveSourcesAsUser(sources: Source[]): Promise<{ sources: Source[]; error?: string }> {
  const out: Source[] = [];
  for (const s of sources) {
    if (s.kind === 'jira-issue' || s.kind === 'jira-comment') {
      const res = await api.asUser().requestJira(route`/rest/api/3/issue/${s.ref}?fields=summary`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return { sources: [], error: `You can't see ${s.ref}, or it doesn't exist.` };
      const body = (await res.json()) as { id: string; key: string; fields?: { summary?: string } };
      out.push({ ...s, ref: body.key, refNumericId: Number(body.id), title: body.fields?.summary ?? null });
    } else {
      const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${s.ref}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return { sources: [], error: `You can't see Confluence page ${s.ref}, or it doesn't exist.` };
      const body = (await res.json()) as { id: string; title?: string };
      out.push({ ...s, ref: body.id, title: body.title ?? null });
    }
  }
  return { sources: out };
}

/** True if the user holds the Jira ADMINISTER global permission (checked as app). */
export async function isJiraAdmin(accountId: string): Promise<boolean> {
  const res = await api.asApp().requestJira(route`/rest/api/3/permissions/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ accountId, globalPermissions: ['ADMINISTER'] }),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { globalPermissions?: string[] };
  return (body.globalPermissions ?? []).includes('ADMINISTER');
}
