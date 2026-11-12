import api, { route } from '@forge/api';
import { createHash } from 'node:crypto';
import { adfToText } from '../domain/text';
import type { WorkFacts } from '../domain/matcher';

export interface IssueFacts extends WorkFacts {
  id: string;
  key: string;
  labels: string[];
}

type Requester = ReturnType<typeof api.asApp> | ReturnType<typeof api.asUser>;

/** Reads the fields the matcher needs. Returns null if the caller can't see the issue. */
export async function fetchIssueFacts(as: 'user' | 'app', issueIdOrKey: string): Promise<IssueFacts | null> {
  const requester: Requester = as === 'user' ? api.asUser() : api.asApp();
  const res = await requester.requestJira(route`/rest/api/3/issue/${issueIdOrKey}?fields=summary,description,project,components,labels`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Jira issue fetch failed: ${res.status}`);
  const body = (await res.json()) as {
    id: string;
    key: string;
    fields: {
      summary?: string;
      description?: unknown;
      project?: { key?: string };
      components?: { name: string }[];
      labels?: string[];
    };
  };
  return {
    id: String(body.id),
    key: body.key,
    summary: body.fields.summary ?? '',
    description: adfToText(body.fields.description).trim(),
    projectKey: body.fields.project?.key ?? null,
    components: (body.fields.components ?? []).map((c) => c.name),
    labels: body.fields.labels ?? [],
  };
}

/** Hash of everything that affects the result; the ledger version invalidates old results. */
export function contentHash(f: WorkFacts, ledgerVersion: string): string {
  return createHash('sha256')
    .update(JSON.stringify([f.summary, f.description, f.projectKey, f.components, f.labels, ledgerVersion]))
    .digest('hex');
}

export const CONFLICT_LABEL = 'precedent-conflict';

export async function addConflictLabel(issueId: string): Promise<void> {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}?notifyUsers=false`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ update: { labels: [{ add: CONFLICT_LABEL }] } }),
  });
  if (!res.ok) console.warn(`Precedent: could not label issue ${issueId}: ${res.status}`);
}

export async function addConflictComment(issueId: string, text: string): Promise<boolean> {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    }),
  });
  if (!res.ok) console.warn(`Precedent: could not comment on issue ${issueId}: ${res.status}`);
  return res.ok;
}
