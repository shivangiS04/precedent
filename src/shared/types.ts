/**
 * Resolver contract shared by the UI (makeInvoke) and backend (makeResolver).
 * Keep this file free of runtime imports so both bundles can use it.
 */
import type { Decision, DecisionInput, DecisionStatus, FieldErrors } from '../domain/types';
import type { IssueCheck } from '../core/check';
import type { GraphContext } from '../core/graph';

export interface HealthInfo {
  database: 'ready' | 'migrating' | 'error';
  decisionCount: number | null;
  milestone: string;
}

export type SaveResult = { ok: true; id: string } | { ok: false; errors: FieldErrors };
export type SimpleResult = { ok: true } | { ok: false; error: string };
export type SeedResult = { ok: true; created: number; skipped: number } | { ok: false; error: string };

export interface AdminSettings {
  labelConflicts: boolean;
  commentOnConflict: boolean;
  graphContext: boolean;
  aliases: Record<string, string[]>;
}

export type PageDraftResult =
  | {
      ok: true;
      pageUrl: string;
      draft: { title: string; statement: string; rationale: string; alternatives: string; keywords: string; status: DecisionStatus };
      existing: { id: string; title: string; status: DecisionStatus }[];
    }
  | { ok: false; error: string };

export type Defs = {
  getHealth: () => HealthInfo;
  listDecisions: (args: { status?: DecisionStatus; project?: string; q?: string }) => { decisions: Decision[]; hidden: number };
  getDecision: (args: { id: string }) => { decision: Decision | null };
  saveDecision: (args: { id?: string; input: DecisionInput }) => SaveResult;
  changeStatus: (args: { id: string; status: DecisionStatus; supersededBy?: string | null }) => SimpleResult;
  seedDemoData: () => SeedResult;
  /** Issue surfaces: the issue comes from the module context, never from the payload. */
  checkIssue: () => { check: IssueCheck | null; error?: string };
  dismissConflict: (args: { decisionId: string }) => SimpleResult;
  restoreConflict: (args: { decisionId: string }) => SimpleResult;
  proposeRevisit: (args: { decisionId: string; reason: string }) => SimpleResult;
  decisionGraph: (args: { decisionId: string }) => GraphContext;
  /** Confluence byline: draft from the current page (page id comes from context). */
  pageDraft: () => PageDraftResult;
  /** Admin settings (Jira admins only). */
  getSettings: () => { settings: AdminSettings; isAdmin: boolean };
  saveSettings: (args: { settings: Partial<Omit<AdminSettings, 'aliases'>> & { aliasesText?: string } }) => SimpleResult & { settings?: AdminSettings };
};
