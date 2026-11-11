/**
 * Resolver contract shared by the UI (makeInvoke) and backend (makeResolver).
 * Keep this file free of runtime imports so both bundles can use it.
 */
export interface HealthInfo {
  database: 'ready' | 'migrating' | 'error';
  decisionCount: number | null;
  milestone: string;
}

export type Defs = {
  getHealth: () => HealthInfo;
};
