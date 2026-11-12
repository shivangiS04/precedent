import * as repo from '../db/repo';
import { canTransition } from '../domain/parse';
import { filterVisible } from '../permissions/access';
import { forgePermissionClient } from '../permissions/forgeClient';

export type RevisitResult = { ok: true; title: string; ownerAccountId: string | null } | { ok: false; error: string };

/** Moves a decision to "revisit" and records why. Shared by the issue panel and the Rovo action. */
export async function proposeRevisit(decisionId: string, reason: string, accountId: string, issueKey: string | null = null): Promise<RevisitResult> {
  const why = (reason ?? '').trim();
  if (!why) return { ok: false, error: 'Say what changed since the decision was made.' };
  if (why.length > 2000) return { ok: false, error: 'Keep the reason under 2000 characters.' };
  const d = await repo.getDecision(decisionId);
  if (!d) return { ok: false, error: 'No such decision.' };
  const [visible] = await filterVisible([d], accountId, forgePermissionClient);
  if (!visible) return { ok: false, error: 'No such decision.' }; // don't reveal hidden decisions exist
  if (d.status === 'revisit') {
    await repo.addFeedback(d.id, issueKey, accountId, 'revisit', why);
    return { ok: true, title: d.title, ownerAccountId: d.ownerAccountId };
  }
  if (!canTransition(d.status, 'revisit')) return { ok: false, error: `A ${d.status} decision can't be reopened.` };
  await repo.setStatus(d.id, 'revisit');
  await repo.addFeedback(d.id, issueKey, accountId, 'revisit', why);
  return { ok: true, title: d.title, ownerAccountId: d.ownerAccountId };
}
