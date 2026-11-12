import api, { route } from '@forge/api';
import type { Source } from '../domain/types';
import { forgePermissionClient } from '../permissions/forgeClient';

/** Display names for account ids (asApp; read:jira-user). Missing ids are simply omitted. */
export async function displayNames(accountIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(accountIds.filter((a): a is string => !!a))].slice(0, 90);
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const params = new URLSearchParams();
  for (const id of ids) params.append('accountId', id);
  params.set('maxResults', '100');
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/user/bulk?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return out;
    const body = (await res.json()) as { values?: { accountId: string; displayName?: string }[] };
    for (const u of body.values ?? []) if (u.displayName) out.set(u.accountId, u.displayName);
  } catch (err) {
    console.warn('Precedent: user lookup failed', err);
  }
  return out;
}

/**
 * Resolves sources for an action caller WITHOUT asUser (unreliable from MCP clients):
 * reads as the app, then checks the caller's permission explicitly. Fails closed.
 */
export async function resolveSourcesForCaller(sources: Source[], accountId: string): Promise<{ sources: Source[]; error?: string }> {
  const out: Source[] = [];
  for (const s of sources) {
    if (s.kind === 'confluence-page') {
      const res = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${s.ref}`, { headers: { Accept: 'application/json' } });
      const ok = res.ok && (await forgePermissionClient.canReadPage(accountId, s.ref).catch(() => false));
      if (!ok) return { sources: [], error: `Source page ${s.ref} doesn't exist or you can't view it.` };
      const body = (await res.json()) as { id: string; title?: string };
      out.push({ ...s, ref: body.id, title: body.title ?? null });
    } else {
      const res = await api.asApp().requestJira(route`/rest/api/3/issue/${s.ref}?fields=summary`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return { sources: [], error: `Source ${s.ref} doesn't exist or you can't view it.` };
      const body = (await res.json()) as { id: string; key: string; fields?: { summary?: string } };
      const allowed = await forgePermissionClient.browsableIssueIds(accountId, [Number(body.id)]).catch(() => new Set<number>());
      if (!allowed.has(Number(body.id))) return { sources: [], error: `Source ${s.ref} doesn't exist or you can't view it.` };
      out.push({ ...s, ref: body.key, refNumericId: Number(body.id), title: body.fields?.summary ?? null });
    }
  }
  return { sources: out };
}

/** Sends a Jira notification to the decision owner via the decision's Jira source, if it has one. */
export async function notifyOwner(issueIdOrKey: string, ownerAccountId: string, subject: string, text: string): Promise<boolean> {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueIdOrKey}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ subject, textBody: text, to: { users: [{ accountId: ownerAccountId }] } }),
  });
  if (!res.ok) console.warn(`Precedent: owner notification failed: ${res.status}`);
  return res.ok;
}
