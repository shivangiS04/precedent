/**
 * Visibility rules for decisions, used by every path that returns decisions to a caller
 * (Rovo actions, the MCP tools, UI resolvers).
 *
 * Why this exists: tools invoked from third-party MCP clients can't reliably call
 * `asUser()` (known Forge issue), so they read data as the app. The app therefore
 * enforces the caller's permissions itself:
 *   - A caller must be identified by `context.accountId` (never by an action input).
 *   - A decision is returned only if the caller can view EVERY source it cites.
 *   - Any error while checking fails closed: the decision is withheld.
 */

export type SourceKind = 'jira-issue' | 'jira-comment' | 'confluence-page';

export interface DecisionSource {
  kind: SourceKind;
  /** Issue key (Jira) or page id (Confluence). */
  ref: string;
  /** Numeric Jira issue id. Required for Jira sources; the bulk permission API only accepts ids. */
  refNumericId?: number | null;
}

export interface HasSources {
  id: string;
  sources: DecisionSource[];
}

/** Backend operations the visibility check needs. Implemented with asApp() in forgeClient.ts. */
export interface PermissionClient {
  /** Returns the subset of `issueIds` the user can browse. */
  browsableIssueIds(accountId: string, issueIds: number[]): Promise<Set<number>>;
  /** True if the user can read the Confluence page. */
  canReadPage(accountId: string, pageId: string): Promise<boolean>;
}

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

/**
 * Extracts the caller's account id from a Forge function context.
 * Forge passes it as `context.principal.accountId`; some invocation paths
 * expose `context.accountId`. Inputs are deliberately ignored.
 */
export function requireAccountId(context: unknown): string {
  const ctx = (context ?? {}) as { principal?: { accountId?: unknown }; accountId?: unknown };
  const candidate = ctx.principal?.accountId ?? ctx.accountId;
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new AccessDeniedError('No user account in invocation context; request rejected.');
  }
  return candidate;
}

/** Jira issue ids are at most 1000 per bulk permission call. */
const JIRA_BATCH = 1000;

/**
 * Returns only the decisions whose sources are all visible to `accountId`.
 * Decisions without sources are visible (they live only in the ledger).
 */
export async function filterVisible<T extends HasSources>(
  decisions: T[],
  accountId: string,
  client: PermissionClient,
): Promise<T[]> {
  if (!accountId) throw new AccessDeniedError('accountId is required');
  if (decisions.length === 0) return [];

  // 1. Jira: one bulk call per 1000 issue ids.
  const issueIds = new Set<number>();
  let jiraSourceWithoutId = false;
  for (const d of decisions) {
    for (const s of d.sources) {
      if (s.kind === 'jira-issue' || s.kind === 'jira-comment') {
        if (typeof s.refNumericId === 'number' && Number.isFinite(s.refNumericId)) issueIds.add(s.refNumericId);
        else jiraSourceWithoutId = true;
      }
    }
  }
  if (jiraSourceWithoutId) {
    console.warn('Precedent: Jira source without numeric id; affected decisions will be withheld.');
  }

  const browsable = new Set<number>();
  const ids = [...issueIds];
  for (let i = 0; i < ids.length; i += JIRA_BATCH) {
    try {
      const allowed = await client.browsableIssueIds(accountId, ids.slice(i, i + JIRA_BATCH));
      allowed.forEach((id) => browsable.add(id));
    } catch (err) {
      console.warn('Precedent: Jira permission check failed; failing closed.', err);
    }
  }

  // 2. Confluence: one call per distinct page (cached per request).
  const pageVerdicts = new Map<string, boolean>();
  for (const d of decisions) {
    for (const s of d.sources) {
      if (s.kind === 'confluence-page' && !pageVerdicts.has(s.ref)) {
        let ok = false;
        try {
          ok = await client.canReadPage(accountId, s.ref);
        } catch (err) {
          console.warn('Precedent: Confluence permission check failed; failing closed.', err);
        }
        pageVerdicts.set(s.ref, ok);
      }
    }
  }

  // 3. Keep a decision only if every source is visible.
  return decisions.filter((d) =>
    d.sources.every((s) => {
      if (s.kind === 'confluence-page') return pageVerdicts.get(s.ref) === true;
      return typeof s.refNumericId === 'number' && browsable.has(s.refNumericId);
    }),
  );
}
