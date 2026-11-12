import { guarded } from './guard';
import * as repo from '../db/repo';
import type { Decision } from '../domain/types';
import { searchDecisions } from '../domain/search';
import { parseSourceUrl, validateDecisionInput } from '../domain/parse';
import { filterVisible } from '../permissions/access';
import { forgePermissionClient } from '../permissions/forgeClient';
import { checkWorkForUser, type ConflictCard } from '../core/check';
import { fetchIssueFacts } from '../core/jira';
import { loadSettings } from '../core/settings';
import { displayNames, notifyOwner, resolveSourcesForCaller } from '../core/people';
import { proposeRevisit as proposeRevisitCore } from '../core/revisit';
import { cloudIdFrom, graphContextFor } from '../core/graph';

/**
 * Rovo actions and MCP tools. Every handler:
 *  - runs behind `guarded` (caller must have context.accountId),
 *  - reads as the app and filters to what the caller can see (asUser is unreliable from MCP),
 *  - returns compact JSON the agent turns into prose, with links to cite.
 */

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function visibleLive(accountId: string, includeSuperseded = false): Promise<Decision[]> {
  const all = await repo.listDecisions({ limit: 1000 });
  const visible = await filterVisible(all, accountId, forgePermissionClient);
  return includeSuperseded ? visible : visible.filter((d) => d.status !== 'superseded');
}

function summarize(d: Decision, names: Map<string, string>, byId?: Map<string, Decision>) {
  const replacement = d.supersededBy ? byId?.get(d.supersededBy) : undefined;
  return {
    decisionId: d.id,
    title: d.title,
    status: d.status,
    statement: d.statement,
    rationale: d.rationale,
    rejectedAlternatives: d.alternatives.map((a) => (a.reason ? `${a.alternative}: ${a.reason}` : a.alternative)),
    owner: d.ownerAccountId ? { accountId: d.ownerAccountId, name: names.get(d.ownerAccountId) ?? null } : null,
    decidedAt: d.decidedAt,
    revisitBy: d.revisitBy,
    projects: d.scope.projects,
    sources: d.sources.map((s) => ({ kind: s.kind, ref: s.ref, url: s.url ?? null })),
    ...(d.status === 'superseded'
      ? { supersededBy: replacement ? { decisionId: replacement.id, title: replacement.title } : d.supersededBy }
      : {}),
  };
}

function conflictCard(c: ConflictCard, names: Map<string, string>) {
  return {
    kind: c.kind,
    confidence: c.confidence,
    level: c.level,
    explanation: c.explanation,
    collidesWithRejectedAlternative: c.collidesWith ? { alternative: c.collidesWith.alternative, reason: c.collidesWith.reason } : null,
    decision: summarize(c.decision, names),
  };
}

// ---------- find-precedent ----------
export const findPrecedent = guarded<{ query?: string; project?: string; component?: string }>(async (payload, accountId) => {
  const query = str(payload.query).slice(0, 500);
  if (!query && !str(payload.project)) return { status: 'invalid', reason: 'Provide a query describing the topic.' };
  const [decisions, settings] = await Promise.all([visibleLive(accountId, true), loadSettings()]);
  const hits = searchDecisions(query, decisions, {
    project: str(payload.project) || null,
    component: str(payload.component) || null,
    aliases: settings.aliases,
  });
  if (!hits.length) return { status: 'no_match', message: "There's no recorded decision about this.", query };
  const names = await displayNames(hits.map((h) => h.decision.ownerAccountId));
  const byId = new Map(decisions.map((d) => [d.id, d]));
  return {
    status: 'ok',
    query,
    decisions: hits.map((h) => ({ ...summarize(h.decision, names, byId), matchedOn: h.matchedOn })),
  };
});

// ---------- check-conflict ----------
type CheckPayload = { issueKey?: string; text?: string; context?: { jira?: { issueKey?: string } } };
export const checkConflict = guarded<CheckPayload>(async (payload, accountId) => {
  const inputKey = str(payload.issueKey).toUpperCase();
  const contextKey = str(payload.context?.jira?.issueKey);
  const issueKey = ISSUE_KEY.test(inputKey) ? inputKey : ISSUE_KEY.test(contextKey) ? contextKey : '';
  const text = str(payload.text).slice(0, 5000);

  let work: { key?: string | null; summary: string; description?: string | null; projectKey?: string | null; components?: string[]; labels?: string[] };
  let subject: string;
  if (issueKey) {
    const facts = await fetchIssueFacts('app', issueKey);
    const allowed = facts ? await forgePermissionClient.browsableIssueIds(accountId, [Number(facts.id)]).catch(() => new Set<number>()) : new Set<number>();
    if (!facts || !allowed.has(Number(facts.id))) return { status: 'not_found', reason: `Work item ${issueKey} doesn't exist or you can't view it.` };
    work = facts;
    subject = `${facts.key}: ${facts.summary}`;
  } else if (text) {
    work = { summary: text };
    subject = 'the described change';
  } else {
    return { status: 'invalid', reason: 'Provide an issueKey or a text description of the change.' };
  }

  const { matches } = await checkWorkForUser(work, accountId);
  const dismissed = issueKey ? await repo.dismissedFor(issueKey) : new Set<string>();
  const active = matches.filter((m) => !dismissed.has(m.decisionId));
  const names = await displayNames(active.map((m) => m.decision.ownerAccountId));
  const conflicts = active.filter((m) => m.kind === 'conflict');
  return {
    status: 'ok',
    checked: subject,
    summary: conflicts.length
      ? `${conflicts.length} conflict(s) with recorded decisions.`
      : active.length
        ? 'No direct conflicts; some related decisions apply.'
        : 'No conflicts with recorded decisions.',
    conflicts: conflicts.map((c) => conflictCard(c, names)),
    related: active.filter((m) => m.kind === 'related').map((c) => conflictCard(c, names)),
  };
});

// ---------- get-decision-context ----------
export const getDecisionContext = guarded<{ decisionId?: string; context?: { cloudId?: string } }>(async (payload, accountId, context) => {
  const id = str(payload.decisionId);
  const d = id ? await repo.getDecision(id) : null;
  const visible = d ? (await filterVisible([d], accountId, forgePermissionClient))[0] : undefined;
  if (!visible) return { status: 'not_found', reason: 'No decision with that id that you can view.' };

  const related = await filterVisible(
    (await repo.listDecisions({ limit: 1000 })).filter((x) => x.supersededBy === visible.id || x.id === visible.supersededBy),
    accountId,
    forgePermissionClient,
  );
  const names = await displayNames([visible.ownerAccountId, ...visible.deciders]);
  const byId = new Map(related.map((x) => [x.id, x]));
  const settings = await loadSettings();
  const graph = settings.graphContext
    ? await graphContextFor(visible, cloudIdFrom(payload, context))
    : { available: false, reason: 'Turned off by an admin.' };
  return {
    status: 'ok',
    decision: summarize(visible, names, byId),
    deciders: visible.deciders.map((a) => ({ accountId: a, name: names.get(a) ?? null })),
    replaces: related.filter((x) => x.supersededBy === visible.id).map((x) => ({ decisionId: x.id, title: x.title, decidedAt: x.decidedAt })),
    graphContext: graph,
  };
});

// ---------- record-decision ----------
type RecordPayload = {
  title?: string;
  statement?: string;
  rationale?: string;
  alternatives?: string;
  keywords?: string;
  projects?: string;
  sourceUrl?: string;
  context?: { jira?: { url?: string }; confluence?: { url?: string } };
};
export const recordDecision = guarded<RecordPayload>(async (payload, accountId) => {
  const sourceUrl = str(payload.sourceUrl) || str(payload.context?.confluence?.url) || str(payload.context?.jira?.url);
  const parsedSource = sourceUrl ? parseSourceUrl(sourceUrl) : null;
  if (str(payload.sourceUrl) && !parsedSource) return { status: 'invalid', errors: { sourceUrl: 'Use a Jira work item or Confluence page link from this site.' } };

  const parsed = validateDecisionInput({
    title: payload.title,
    statement: payload.statement,
    rationale: payload.rationale,
    status: 'proposed', // agents can never record binding decisions
    ownerAccountId: accountId,
    deciders: [accountId],
    decidedAt: new Date().toISOString().slice(0, 10),
    alternatives: payload.alternatives ?? '',
    scope: { keywords: payload.keywords ?? '', projects: payload.projects ?? '' },
    sources: parsedSource ? [parsedSource] : [],
  });
  if (!parsed.ok) return { status: 'invalid', errors: parsed.errors };

  const resolved = await resolveSourcesForCaller(parsed.value.sources ?? [], accountId);
  if (resolved.error) return { status: 'invalid', errors: { sourceUrl: resolved.error } };

  const existing = (await repo.listDecisions({ limit: 1000 })).find((d) => d.title.toLowerCase() === parsed.value.title.toLowerCase());
  if (existing) return { status: 'duplicate', reason: `A decision titled "${existing.title}" already exists.`, decisionId: existing.id };

  const id = await repo.createDecision({ ...parsed.value, sources: resolved.sources }, accountId);
  console.log(`Precedent: decision recorded via action (${id})`);
  return { status: 'created', decisionId: id, title: parsed.value.title, decisionStatus: 'proposed', note: 'Recorded as proposed. A teammate can accept it in the Decision Ledger.' };
});

// ---------- propose-revisit ----------
export const proposeRevisit = guarded<{ decisionId?: string; reason?: string; context?: { jira?: { issueKey?: string } } }>(async (payload, accountId) => {
  const issueKey = str(payload.context?.jira?.issueKey) || null;
  const res = await proposeRevisitCore(str(payload.decisionId), str(payload.reason), accountId, issueKey);
  if (!res.ok) return { status: 'failed', reason: res.error };

  let ownerNotified = false;
  if (res.ownerAccountId && res.ownerAccountId !== accountId) {
    const d = await repo.getDecision(str(payload.decisionId));
    const jiraSource = d?.sources.find((s) => s.kind !== 'confluence-page');
    if (jiraSource) {
      ownerNotified = await notifyOwner(
        jiraSource.ref,
        res.ownerAccountId,
        `Revisit proposed: ${res.title}`,
        `Someone proposed revisiting the decision "${res.title}". Reason: ${str(payload.reason)}`,
      ).catch(() => false);
    }
  }
  return { status: 'ok', decisionId: str(payload.decisionId), title: res.title, decisionStatus: 'revisit', ownerNotified };
});
