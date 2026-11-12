import { makeResolver } from '@forge/resolver';
import type { Defs, HealthInfo } from '../shared/types';
import { canTransition, isStatus, validateDecisionInput } from '../domain/parse';
import type { Decision } from '../domain/types';
import * as repo from '../db/repo';
import { filterVisible, requireAccountId } from '../permissions/access';
import { forgePermissionClient } from '../permissions/forgeClient';
import { isJiraAdmin, resolveSourcesAsUser } from './sources';
import { seedNorthwind } from '../seed/load';
import { checkIssueForUser } from '../core/check';
import { proposeRevisit } from '../core/revisit';

/** Issue key from the Jira module context (issuePanel / issueContext). */
const issueKeyFrom = (context: unknown): string | null => {
  const ext = (context as { extension?: { issue?: { key?: string } } })?.extension;
  return ext?.issue?.key ?? null;
};

const matchesQuery = (d: Decision, q: string) => {
  const hay = [d.title, d.statement, d.rationale, ...d.scope.keywords, ...d.alternatives.map((a) => a.alternative)]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
};

/** UI resolvers. Every read is filtered to what the calling user can see. */
export const handler = makeResolver<Defs>({
  async getHealth(): Promise<HealthInfo> {
    try {
      return { database: 'ready', decisionCount: await repo.countDecisions(), milestone: 'M1' };
    } catch (err) {
      const message = String((err as Error)?.message ?? err);
      const migrating = /doesn't exist|not exist|unknown table/i.test(message);
      if (!migrating) console.error('Precedent health check failed', err);
      return { database: migrating ? 'migrating' : 'error', decisionCount: null, milestone: 'M1' };
    }
  },

  async listDecisions({ payload, context }) {
    const accountId = requireAccountId(context);
    const status = isStatus(payload?.status) ? payload.status : undefined;
    const all = await repo.listDecisions({ status, project: payload?.project || undefined });
    const visible = await filterVisible(all, accountId, forgePermissionClient);
    const q = (payload?.q ?? '').trim();
    return { decisions: q ? visible.filter((d) => matchesQuery(d, q)) : visible, hidden: all.length - visible.length };
  },

  async getDecision({ payload, context }) {
    const accountId = requireAccountId(context);
    const d = payload?.id ? await repo.getDecision(String(payload.id)) : null;
    if (!d) return { decision: null };
    const [visible] = await filterVisible([d], accountId, forgePermissionClient);
    return { decision: visible ?? null };
  },

  async saveDecision({ payload, context }) {
    const accountId = requireAccountId(context);
    const parsed = validateDecisionInput(payload?.input);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    const resolved = await resolveSourcesAsUser(parsed.value.sources ?? []);
    if (resolved.error) return { ok: false, errors: { sources: resolved.error } };
    const input = { ...parsed.value, sources: resolved.sources };

    if (payload?.id) {
      const existing = await repo.getDecision(String(payload.id));
      if (!existing) return { ok: false, errors: { form: 'This decision no longer exists.' } };
      const [visible] = await filterVisible([existing], accountId, forgePermissionClient);
      if (!visible) return { ok: false, errors: { form: "You don't have access to this decision's sources." } };
      if (!canTransition(existing.status, input.status ?? existing.status)) {
        return { ok: false, errors: { status: `Can't change status from ${existing.status} to ${input.status}.` } };
      }
      await repo.updateDecision(existing.id, input);
      return { ok: true, id: existing.id };
    }
    const id = await repo.createDecision(input, accountId);
    return { ok: true, id };
  },

  async changeStatus({ payload, context }) {
    const accountId = requireAccountId(context);
    if (!payload?.id || !isStatus(payload.status)) return { ok: false, error: 'Invalid request.' };
    const existing = await repo.getDecision(String(payload.id));
    if (!existing) return { ok: false, error: 'This decision no longer exists.' };
    const [visible] = await filterVisible([existing], accountId, forgePermissionClient);
    if (!visible) return { ok: false, error: "You don't have access to this decision's sources." };
    if (!canTransition(existing.status, payload.status)) {
      return { ok: false, error: `Can't change status from ${existing.status} to ${payload.status}.` };
    }
    let supersededBy: string | null = null;
    if (payload.status === 'superseded') {
      supersededBy = payload.supersededBy ? String(payload.supersededBy) : null;
      if (!supersededBy || supersededBy === existing.id || !(await repo.getDecision(supersededBy))) {
        return { ok: false, error: 'Choose the decision that replaces this one.' };
      }
    }
    await repo.setStatus(existing.id, payload.status, supersededBy);
    return { ok: true };
  },

  async seedDemoData({ context }) {
    const accountId = requireAccountId(context);
    if (!(await isJiraAdmin(accountId))) return { ok: false, error: 'Only Jira admins can load demo data.' };
    return seedNorthwind(accountId);
  },

  async checkIssue({ context }) {
    const accountId = requireAccountId(context);
    const key = issueKeyFrom(context);
    if (!key) return { check: null, error: 'Open this from a Jira work item.' };
    try {
      const check = await checkIssueForUser(key, accountId);
      return check ? { check } : { check: null, error: "You can't see this work item." };
    } catch (err) {
      const message = String((err as Error)?.message ?? err);
      if (/doesn't exist|not exist|unknown table/i.test(message)) return { check: null, error: 'Precedent is still setting up its database. Try again in a minute.' };
      console.error('Precedent: issue check failed', err);
      return { check: null, error: 'Precedent could not check this work item. Try again.' };
    }
  },

  async dismissConflict({ payload, context }) {
    const accountId = requireAccountId(context);
    const key = issueKeyFrom(context);
    if (!key || !payload?.decisionId) return { ok: false, error: 'Invalid request.' };
    const d = await repo.getDecision(String(payload.decisionId));
    if (!d || !(await filterVisible([d], accountId, forgePermissionClient)).length) return { ok: false, error: 'No such decision.' };
    await repo.addFeedback(d.id, key, accountId, 'not-related');
    return { ok: true };
  },

  async restoreConflict({ payload, context }) {
    const accountId = requireAccountId(context);
    const key = issueKeyFrom(context);
    if (!key || !payload?.decisionId) return { ok: false, error: 'Invalid request.' };
    const d = await repo.getDecision(String(payload.decisionId));
    if (!d || !(await filterVisible([d], accountId, forgePermissionClient)).length) return { ok: false, error: 'No such decision.' };
    await repo.removeDismissal(d.id, key);
    return { ok: true };
  },

  async proposeRevisit({ payload, context }) {
    const accountId = requireAccountId(context);
    const res = await proposeRevisit(String(payload?.decisionId ?? ''), String(payload?.reason ?? ''), accountId, issueKeyFrom(context));
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  },
});
