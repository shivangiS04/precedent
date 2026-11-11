import { makeResolver } from '@forge/resolver';
import { sql } from '@forge/sql';
import type { Defs, HealthInfo } from '../shared/types';

/** UI resolvers. M0 only exposes a health check so every surface can prove the backend + DB are wired. */
export const handler = makeResolver<Defs>({
  async getHealth(): Promise<HealthInfo> {
    try {
      const result = await sql.executeRaw<{ n: number }>('SELECT COUNT(*) AS n FROM decisions');
      return { database: 'ready', decisionCount: Number(result.rows[0]?.n ?? 0), milestone: 'M0' };
    } catch (err) {
      // Table missing right after install = migrations still queued.
      const message = String((err as Error)?.message ?? err);
      const migrating = /doesn't exist|not exist|unknown table/i.test(message);
      if (!migrating) console.error('Precedent health check failed', err);
      return { database: migrating ? 'migrating' : 'error', decisionCount: null, milestone: 'M0' };
    }
  },
});
