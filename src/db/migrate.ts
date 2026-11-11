import { migrationRunner } from '@forge/sql';
import { Queue } from '@forge/events';
import { MIGRATIONS } from './schema';

/**
 * Migration orchestration, following the Forge SQL docs' recommended pattern:
 *   install/upgrade trigger + hourly sweeper -> push to queue -> consumer runs migrations (900 s timeout).
 * The runner records applied migrations, so re-running is a no-op.
 */
const queue = new Queue({ key: 'migration-queue' });

let runner = migrationRunner;
for (const m of MIGRATIONS) {
  runner = runner.enqueue(m.name, m.sql);
}

export const enqueueMigrations = async (): Promise<void> => {
  await queue.push([{ body: { reason: 'migrate' } }]);
};

const RETRY_WINDOW_MS = 60_000;

export const runMigrations = async (): Promise<void> => {
  const deadline = Date.now() + RETRY_WINDOW_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const applied = await runner.run();
      console.log('Precedent migrations applied:', applied);
      return;
    } catch (error) {
      lastError = error;
      console.warn('Migration attempt failed, retrying', error);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  // Throwing lets the async events API retry the event.
  throw lastError;
};
