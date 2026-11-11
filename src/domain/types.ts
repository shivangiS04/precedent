/**
 * Core domain types. No runtime imports, so the UI bundle can share this file.
 */
import type { SourceKind } from '../permissions/access';

export const STATUSES = ['proposed', 'accepted', 'revisit', 'superseded'] as const;
export type DecisionStatus = (typeof STATUSES)[number];

export interface Alternative {
  alternative: string;
  reason: string;
}

export interface DecisionScope {
  projects: string[];
  components: string[];
  labels: string[];
  keywords: string[];
}

export interface Source {
  kind: SourceKind;
  /** Issue key (Jira) or page id (Confluence). */
  ref: string;
  refNumericId?: number | null;
  commentId?: string | null;
  url?: string | null;
  title?: string | null;
}

export interface Decision {
  id: string;
  title: string;
  statement: string;
  status: DecisionStatus;
  rationale: string;
  ownerAccountId: string | null;
  deciders: string[];
  decidedAt: string | null; // YYYY-MM-DD
  revisitBy: string | null; // YYYY-MM-DD
  supersededBy: string | null;
  alternatives: Alternative[];
  scope: DecisionScope;
  sources: Source[];
  createdAt: string;
  updatedAt: string;
}

/** What a form, an action or the seed script submits. */
export interface DecisionInput {
  title: string;
  statement: string;
  rationale: string;
  status?: DecisionStatus;
  ownerAccountId?: string | null;
  deciders?: string[];
  decidedAt?: string | null;
  revisitBy?: string | null;
  alternatives?: Alternative[];
  scope?: Partial<DecisionScope>;
  sources?: Source[];
}

export type FieldErrors = Partial<Record<keyof DecisionInput | 'form', string>>;
