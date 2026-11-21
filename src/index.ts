/** Function entry points referenced by manifest.yml (handler: index.<export>). */
export { handler as resolver } from './resolvers';
export { onIssueEvent } from './triggers/issue';
export { contextStatus } from './triggers/contextStatus';
export { enqueueMigrations, runMigrations } from './db/migrate';
import { sendRevisitReminders as sendRevisitRemindersJob } from './core/reminders';
export {
  findPrecedent,
  checkConflict,
  getDecisionContext,
  recordDecision,
  proposeRevisit,
} from './actions';

/** Scheduled daily: revisit reminders. Exported under the name the manifest uses. */
export const sendRevisitReminders = () => sendRevisitRemindersJob();
