/**
 * Resolver contract shared by the UI (makeInvoke) and backend (makeResolver).
 * Keep this file free of runtime imports so both bundles can use it.
 */
import type { Decision, DecisionInput, DecisionStatus, FieldErrors } from '../domain/types';

export interface HealthInfo {
  database: 'ready' | 'migrating' | 'error';
  decisionCount: number | null;
  milestone: string;
}

export type SaveResult = { ok: true; id: string } | { ok: false; errors: FieldErrors };
export type SimpleResult = { ok: true } | { ok: false; error: string };
export type SeedResult = { ok: true; created: number; skipped: number } | { ok: false; error: string };

export type Defs = {
  getHealth: () => HealthInfo;
  listDecisions: (args: { status?: DecisionStatus; project?: string; q?: string }) => { decisions: Decision[]; hidden: number };
  getDecision: (args: { id: string }) => { decision: Decision | null };
  saveDecision: (args: { id?: string; input: DecisionInput }) => SaveResult;
  changeStatus: (args: { id: string; status: DecisionStatus; supersededBy?: string | null }) => SimpleResult;
  seedDemoData: () => SeedResult;
};
