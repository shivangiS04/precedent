import * as repo from '../db/repo';
import { daysBetween } from '../domain/dates';
import { notifyOwner } from './people';

/** Days before a reminder for the same decision is sent again. */
export const REMINDER_INTERVAL_DAYS = 30;

/**
 * Daily job: tells each owner when one of their decisions is past its revisit date.
 * Owners are notified through the decision's Jira source (Jira can only notify on
 * issues), so decisions with no Jira source are counted as skipped.
 */
export async function sendRevisitReminders(today = new Date().toISOString().slice(0, 10)): Promise<{ due: number; sent: number; skipped: number }> {
  const due = (await repo.listDecisions({ limit: 1000 })).filter((d) => d.revisitBy && d.revisitBy <= today && d.status !== 'superseded');
  let sent = 0;
  let skipped = 0;
  for (const d of due) {
    const key = `revisit-reminder:${d.id}`;
    const last = await repo.getSetting<string | null>(key, null);
    const jira = d.sources.find((s) => s.kind !== 'confluence-page');
    if (!d.ownerAccountId || !jira || (last && daysBetween(last, today) < REMINDER_INTERVAL_DAYS)) {
      skipped++;
      continue;
    }
    const ok = await notifyOwner(
      jira.ref,
      d.ownerAccountId,
      `Revisit due: ${d.title}`,
      `The decision "${d.title}" reached its revisit date (${d.revisitBy}). Open the Decision Ledger in Precedent to confirm it still holds or propose a change.`,
    );
    if (ok) {
      await repo.setSetting(key, today);
      sent++;
    } else skipped++;
  }
  console.log(`Precedent revisit reminders: ${due.length} due, ${sent} sent, ${skipped} skipped`);
  return { due: due.length, sent, skipped };
}
