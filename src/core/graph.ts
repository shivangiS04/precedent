import api from '@forge/api';
import type { Decision } from '../domain/types';
import queryKeys from '../twg/queryKeys.json';

/**
 * Teamwork Graph context via persisted Cypher queries (registered in TWG Labs; keys in
 * src/twg/queryKeys.json). Teamwork Graph only runs AS THE USER, and results are
 * permission-filtered for them. Everything here is best-effort: any failure returns
 * `available: false` and the rest of Precedent keeps working.
 */

type KeyName = 'issueGoals' | 'issueLinkedIssues' | 'pageContributors' | 'userTeams';

const QUERY = `
query precedent_customQuery($queryKey: String!, $queryParams: CypherRequestParams) {
  customQuery(queryKey: $queryKey, queryParams: $queryParams, first: 10) {
    edges { node { columns { key value { __typename
      ... on CypherQueryResultNode { id data { __typename
        ... on AtlassianGoal { name url }
        ... on AtlassianTeam { displayName profileUrl }
        ... on AtlassianUser { accountId name }
        ... on JiraWorkItem { key summary }
      } }
    } } } }
  }
}`;

export interface GraphItem {
  type: 'goal' | 'team' | 'person' | 'workItem';
  name: string;
  url?: string | null;
  accountId?: string | null;
}

export interface GraphContext {
  available: boolean;
  reason?: string;
  goals?: GraphItem[];
  teams?: GraphItem[];
  people?: GraphItem[];
  linkedWork?: GraphItem[];
}

const keyFor = (name: KeyName): string | null => {
  const entry = (queryKeys as Record<string, { queryKey?: string | null } | string>)[name];
  return typeof entry === 'object' && entry?.queryKey ? entry.queryKey : null;
};

export const userAri = (accountId: string) => `ari:cloud:identity::user/${accountId}`;
export const issueAri = (cloudId: string, issueId: string | number) => `ari:cloud:jira:${cloudId}:issue/${issueId}`;
export const pageAri = (cloudId: string, pageId: string) => `ari:cloud:confluence:${cloudId}:page/${pageId}`;

/** Extracts the cloud id from a Forge context or action payload. */
export function cloudIdFrom(...sources: unknown[]): string | null {
  for (const s of sources) {
    const o = (s ?? {}) as { cloudId?: unknown; installContext?: unknown; context?: { cloudId?: unknown } };
    if (typeof o.cloudId === 'string' && o.cloudId) return o.cloudId;
    if (typeof o.context?.cloudId === 'string' && o.context.cloudId) return o.context.cloudId;
    const m = typeof o.installContext === 'string' ? o.installContext.match(/site\/([0-9a-f-]{36})/) : null;
    if (m) return m[1];
  }
  return null;
}

class GraphUnavailable extends Error {}

async function run(name: KeyName, params: Record<string, string>): Promise<GraphItem[]> {
  const queryKey = keyFor(name);
  if (!queryKey) return [];
  const res = await api.asUser().requestTeamworkGraph(QUERY, { queryKey, queryParams: params });
  const json = (await res.json()) as {
    data?: { customQuery?: { edges?: { node?: { columns?: { value?: { data?: Record<string, unknown> } }[] } }[] } | null };
    errors?: { message?: string; extensions?: { code?: string } }[];
  };
  if (json.errors?.length) {
    const code = json.errors[0]?.extensions?.code ?? json.errors[0]?.message;
    if (code === 'QUERY_NOT_FOUND') return []; // still propagating
    throw new GraphUnavailable(String(code));
  }
  const out: GraphItem[] = [];
  for (const edge of json.data?.customQuery?.edges ?? []) {
    for (const col of edge.node?.columns ?? []) {
      const d = col.value?.data;
      if (!d) continue;
      switch (d.__typename) {
        case 'AtlassianGoal':
          if (d.name) out.push({ type: 'goal', name: String(d.name), url: (d.url as string) ?? null });
          break;
        case 'AtlassianTeam':
          if (d.displayName) out.push({ type: 'team', name: String(d.displayName), url: (d.profileUrl as string) ?? null });
          break;
        case 'AtlassianUser':
          if (d.name) out.push({ type: 'person', name: String(d.name), accountId: (d.accountId as string) ?? null });
          break;
        case 'JiraWorkItem':
          if (d.key) out.push({ type: 'workItem', name: `${d.key}${d.summary ? `: ${d.summary}` : ''}` });
          break;
      }
    }
  }
  return out;
}

const uniq = (items: GraphItem[]) => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = `${i.type}:${i.accountId ?? i.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Who and what surrounds a decision: goals and linked work of its Jira sources,
 * contributors to its Confluence sources, and its owner's teams.
 * `currentIssueId` adds the goals of the work item being viewed.
 */
export async function graphContextFor(d: Decision, cloudId: string | null, currentIssueId?: string | null): Promise<GraphContext> {
  if (!cloudId) return { available: false, reason: 'Site context unavailable for this request.' };
  const jiraSources = d.sources.filter((s) => s.kind !== 'confluence-page' && s.refNumericId).slice(0, 2);
  const pageSources = d.sources.filter((s) => s.kind === 'confluence-page').slice(0, 2);
  try {
    const tasks: Promise<GraphItem[]>[] = [
      ...jiraSources.map((s) => run('issueGoals', { issueAri: issueAri(cloudId, s.refNumericId!) })),
      ...jiraSources.map((s) => run('issueLinkedIssues', { issueAri: issueAri(cloudId, s.refNumericId!) })),
      ...pageSources.map((s) => run('pageContributors', { pageAri: pageAri(cloudId, s.ref) })),
      ...(d.ownerAccountId ? [run('userTeams', { userAri: userAri(d.ownerAccountId) })] : []),
      ...(currentIssueId ? [run('issueGoals', { issueAri: issueAri(cloudId, currentIssueId) })] : []),
    ];
    const items = uniq((await Promise.all(tasks)).flat());
    return {
      available: true,
      goals: items.filter((i) => i.type === 'goal').slice(0, 5),
      teams: items.filter((i) => i.type === 'team').slice(0, 5),
      people: items.filter((i) => i.type === 'person' && i.accountId !== d.ownerAccountId).slice(0, 5),
      linkedWork: items.filter((i) => i.type === 'workItem').slice(0, 5),
    };
  } catch (err) {
    console.warn('Precedent: Teamwork Graph unavailable', String((err as Error)?.message ?? err));
    return { available: false, reason: 'Teamwork Graph context is unavailable right now.' };
  }
}
