import * as repo from '../db/repo';
import { matchDecisions, type Match, type WorkFacts } from '../domain/matcher';
import type { Decision } from '../domain/types';
import { filterVisible } from '../permissions/access';
import { forgePermissionClient } from '../permissions/forgeClient';
import { addConflictComment, addConflictLabel, contentHash, fetchIssueFacts } from './jira';
import { loadSettings } from './settings';

/** A match joined with the decision a caller is allowed to see. */
export interface ConflictCard extends Match {
  decision: Decision;
}

export interface IssueCheck {
  issueKey: string;
  conflicts: ConflictCard[];
  related: ConflictCard[];
  dismissed: ConflictCard[];
  checkedAt: string;
}

const join = (matches: Match[], decisions: Decision[]): ConflictCard[] => {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  return matches.flatMap((m) => {
    const decision = byId.get(m.decisionId);
    return decision ? [{ ...m, decision }] : [];
  });
};

/**
 * Checks free text or work facts for a signed-in user. Only decisions the user can
 * see are matched, so results never reveal hidden decisions.
 */
export async function checkWorkForUser(work: WorkFacts, accountId: string): Promise<{ matches: ConflictCard[]; visible: Decision[] }> {
  const [live, settings] = await Promise.all([repo.liveDecisions(), loadSettings()]);
  const visible = await filterVisible(live, accountId, forgePermissionClient);
  return { matches: join(matchDecisions(work, visible, { aliases: settings.aliases }), visible), visible };
}

/** Live check for the issue panel / sidebar, as the viewing user. Also refreshes the cache. */
export async function checkIssueForUser(issueKey: string, accountId: string): Promise<IssueCheck | null> {
  const facts = await fetchIssueFacts('user', issueKey);
  if (!facts) return null;
  const [{ matches }, dismissedIds] = await Promise.all([checkWorkForUser(facts, accountId), repo.dismissedFor(facts.key)]);

  // Cache what this user saw so the sidebar badge can update without another check.
  const version = await repo.ledgerVersion();
  await repo
    .saveCachedCheck(facts.id, facts.key, `user:${contentHash(facts, version)}`, {
      matches: matches.filter((m) => !dismissedIds.has(m.decisionId)).map(({ decisionId, kind, confidence }) => ({ decisionId, kind, confidence })),
    })
    .catch((err) => console.warn('Precedent: could not cache check', err));

  const active = matches.filter((m) => !dismissedIds.has(m.decisionId));
  return {
    issueKey: facts.key,
    conflicts: active.filter((m) => m.kind === 'conflict'),
    related: active.filter((m) => m.kind === 'related'),
    dismissed: matches.filter((m) => dismissedIds.has(m.decisionId)),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Background check from the Jira trigger. Runs as the app with no viewer, so it only
 * writes the cache, the label and (if enabled) one comment. The comment names only
 * decisions whose sources the issue's actor can see.
 */
export async function checkIssueInBackground(issueId: string, actorAccountId: string | null): Promise<void> {
  const facts = await fetchIssueFacts('app', issueId);
  if (!facts) return;
  const [live, settings, version, cached, dismissedIds] = await Promise.all([
    repo.liveDecisions(),
    loadSettings(),
    repo.ledgerVersion(),
    repo.getCachedCheck(issueId),
    repo.dismissedFor(facts.key),
  ]);
  const hash = contentHash(facts, version);
  if (cached?.contentHash === hash) {
    console.log(`Precedent check ${facts.key}: unchanged, skipped`);
    return;
  }

  const matches = matchDecisions(facts, live, { aliases: settings.aliases }).filter((m) => !dismissedIds.has(m.decisionId));
  const conflicts = matches.filter((m) => m.kind === 'conflict');
  const titles = new Map(live.map((d) => [d.id, d.title]));
  console.log(
    `Precedent check ${facts.key}: ${conflicts.length} conflict(s), ${matches.length - conflicts.length} related, ${live.length} live decisions` +
      (matches.length ? ` [${matches.map((m) => `${titles.get(m.decisionId)} ${m.kind} ${m.confidence}`).join('; ')}]` : ''),
  );

  const strong = conflicts.filter((m) => m.level === 'high');
  if (strong.length && settings.labelConflicts && !facts.labels.includes('precedent-conflict')) await addConflictLabel(facts.id);

  let commented = cached?.commented ?? false;
  if (strong.length && settings.commentOnConflict && !commented && actorAccountId) {
    const shareable = await filterVisible(
      live.filter((d) => strong.some((m) => m.decisionId === d.id)),
      actorAccountId,
      forgePermissionClient,
    );
    if (shareable.length) {
      const first = strong.find((m) => shareable.some((d) => d.id === m.decisionId))!;
      const d = shareable.find((x) => x.id === first.decisionId)!;
      commented = await addConflictComment(
        facts.id,
        `Precedent: this work may conflict with the decision "${d.title}" (${d.status}). ${first.explanation} Open the Precedent panel for details and who to talk to.`,
      );
    }
  }

  await repo.saveCachedCheck(
    facts.id,
    facts.key,
    hash,
    { matches: matches.map(({ decisionId, kind, confidence }) => ({ decisionId, kind, confidence })) },
    commented,
  );
}

/** Badge text for the sidebar, from the cache. Re-filters for the viewer when known. */
export async function badgeFor(issueId: string, accountId: string | null): Promise<{ label: string; type: 'default' | 'removed' | 'moved' | 'success' }> {
  const cached = await repo.getCachedCheck(issueId);
  if (!cached) return { label: 'Not checked', type: 'default' };
  let ids = cached.result.matches;
  if (accountId && ids.length) {
    const decisions = await repo.listDecisions({ ids: ids.map((m) => m.decisionId) });
    const visible = new Set((await filterVisible(decisions, accountId, forgePermissionClient)).map((d) => d.id));
    ids = ids.filter((m) => visible.has(m.decisionId));
  } else if (!accountId && ids.length) {
    return { label: 'Check panel', type: 'moved' };
  }
  const conflicts = ids.filter((m) => m.kind === 'conflict').length;
  if (conflicts) return { label: `${conflicts} conflict${conflicts === 1 ? '' : 's'}`, type: 'removed' };
  if (ids.length) return { label: `${ids.length} related`, type: 'moved' };
  return { label: 'No conflicts', type: 'success' };
}
