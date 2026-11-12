/**
 * Pure parsing and validation shared by the UI form, Rovo actions / MCP tools, and the seed.
 * Action inputs can't be arrays, so lists arrive as newline-delimited strings.
 */
import {
  STATUSES,
  type Alternative,
  type DecisionInput,
  type DecisionStatus,
  type FieldErrors,
  type Source,
} from './types';

export const LIMITS = { title: 255, statement: 2000, rationale: 8000, listItem: 255, listItems: 50 } as const;

/** Splits newline- or comma-separated text into trimmed, de-duplicated, non-empty items. */
export function parseList(text: string | null | undefined, { lowercase = false } = {}): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text).split(/[\n,]/)) {
    let item = raw.replace(/^[\s*•-]+/, '').trim();
    if (!item) continue;
    if (lowercase) item = item.toLowerCase();
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item.slice(0, LIMITS.listItem));
    if (out.length >= LIMITS.listItems) break;
  }
  return out;
}

/** Jira project keys: uppercase letters/digits, starting with a letter. */
export function parseProjectKeys(text: string | null | undefined): string[] {
  return parseList(text)
    .map((k) => k.toUpperCase())
    .filter((k) => /^[A-Z][A-Z0-9_]{1,9}$/.test(k));
}

/**
 * One alternative per line: "alternative :: reason". Lines without "::" keep an empty reason.
 * Commas are allowed inside reasons, so this does NOT split on commas.
 */
export function parseAlternatives(text: string | null | undefined): Alternative[] {
  if (!text) return [];
  const out: Alternative[] = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/^[\s*•-]+/, '').trim();
    if (!line) continue;
    const idx = line.indexOf('::');
    const alternative = (idx >= 0 ? line.slice(0, idx) : line).trim().slice(0, LIMITS.listItem);
    const reason = (idx >= 0 ? line.slice(idx + 2) : '').trim();
    if (alternative) out.push({ alternative, reason });
    if (out.length >= LIMITS.listItems) break;
  }
  return out;
}

/** Recognises Jira issue and Confluence page URLs. Returns null for anything else. */
export function parseSourceUrl(url: string | null | undefined): Source | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(String(url).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.atlassian.net')) return null;

  const issue = u.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/) ?? null;
  const selected = u.searchParams.get('selectedIssue');
  const key = issue?.[1] ?? (selected && /^[A-Z][A-Z0-9_]+-\d+$/.test(selected) ? selected : null);
  if (key) {
    const focused = u.searchParams.get('focusedCommentId');
    return {
      kind: focused ? 'jira-comment' : 'jira-issue',
      ref: key,
      commentId: focused,
      url: u.toString(),
    };
  }

  const page = u.pathname.match(/\/wiki\/.*\/pages\/(\d+)/) ?? null;
  const pageId = page?.[1] ?? u.searchParams.get('pageId');
  if (pageId && /^\d+$/.test(pageId)) {
    return { kind: 'confluence-page', ref: pageId, url: u.toString() };
  }
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Allowed status changes. Superseded is terminal. */
const TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  proposed: ['accepted', 'revisit', 'superseded'],
  accepted: ['revisit', 'superseded'],
  revisit: ['accepted', 'superseded'],
  superseded: [],
};

export function canTransition(from: DecisionStatus, to: DecisionStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isStatus(s: unknown): s is DecisionStatus {
  return typeof s === 'string' && (STATUSES as readonly string[]).includes(s);
}

export type ValidationResult = { ok: true; value: DecisionInput } | { ok: false; errors: FieldErrors };

/** Normalises and validates a decision. Never trusts the caller's shape. */
export function validateDecisionInput(raw: unknown): ValidationResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const errors: FieldErrors = {};

  const title = str(r.title);
  const statement = str(r.statement);
  const rationale = str(r.rationale);
  if (!title) errors.title = 'Add a short title.';
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;
  if (!statement) errors.statement = 'State the decision in one sentence, e.g. "We will X, not Y, for Z".';
  else if (statement.length > LIMITS.statement) errors.statement = `Keep the statement under ${LIMITS.statement} characters.`;
  if (!rationale) errors.rationale = 'Explain why the team decided this.';
  else if (rationale.length > LIMITS.rationale) errors.rationale = `Keep the rationale under ${LIMITS.rationale} characters.`;

  const status = r.status === undefined || r.status === null || r.status === '' ? 'proposed' : r.status;
  if (!isStatus(status)) errors.status = 'Unknown status.';

  const dateField = (name: 'decidedAt' | 'revisitBy') => {
    const v = str(r[name]);
    if (!v) return null;
    if (!isValidDate(v)) {
      errors[name] = 'Use a date in YYYY-MM-DD format.';
      return null;
    }
    return v;
  };
  const decidedAt = dateField('decidedAt');
  const revisitBy = dateField('revisitBy');
  if (decidedAt && revisitBy && revisitBy < decidedAt) errors.revisitBy = 'Revisit date must be after the decision date.';

  const scope = (r.scope ?? {}) as Record<string, unknown>;
  const listOf = (v: unknown, fn: (t: string) => string[]) =>
    Array.isArray(v) ? fn(v.filter((x) => typeof x === 'string').join('\n')) : fn(str(v));

  const alternatives = Array.isArray(r.alternatives)
    ? (r.alternatives as unknown[])
        .map((a) => {
          const o = (a ?? {}) as Record<string, unknown>;
          return { alternative: str(o.alternative).slice(0, LIMITS.listItem), reason: str(o.reason) };
        })
        .filter((a) => a.alternative)
    : parseAlternatives(str(r.alternatives));

  const sources: Source[] = [];
  for (const s of Array.isArray(r.sources) ? (r.sources as unknown[]) : []) {
    const o = (s ?? {}) as Record<string, unknown>;
    const parsed = typeof o.url === 'string' ? parseSourceUrl(o.url) : null;
    const kind = o.kind ?? parsed?.kind;
    const ref = str(o.ref) || parsed?.ref;
    if ((kind === 'jira-issue' || kind === 'jira-comment' || kind === 'confluence-page') && ref) {
      sources.push({
        kind,
        ref,
        refNumericId: typeof o.refNumericId === 'number' ? o.refNumericId : null,
        commentId: str(o.commentId) || parsed?.commentId || null,
        url: str(o.url) || null,
        title: str(o.title) || null,
      });
    }
  }

  const ownerAccountId = str(r.ownerAccountId) || null;
  const deciders = listOf(r.deciders, (t) => parseList(t));

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      statement,
      rationale,
      status: status as DecisionStatus,
      ownerAccountId,
      deciders,
      decidedAt,
      revisitBy,
      alternatives,
      scope: {
        projects: listOf(scope.projects, parseProjectKeys),
        components: listOf(scope.components, (t) => parseList(t)),
        labels: listOf(scope.labels, (t) => parseList(t, { lowercase: true })),
        keywords: listOf(scope.keywords, (t) => parseList(t, { lowercase: true })),
      },
      sources,
    },
  };
}

/** "redis = valkey, keydb" per line -> { redis: ["valkey", "keydb"] }. Keys and aliases are lowercased. */
export function parseAliases(text: string | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const raw of String(text ?? '').split('\n').slice(0, 200)) {
    const idx = raw.indexOf('=');
    if (idx < 0) continue;
    const key = raw.slice(0, idx).trim().toLowerCase().slice(0, 64);
    const aliases = parseList(raw.slice(idx + 1), { lowercase: true }).filter((a) => a !== key).slice(0, 20);
    if (key && aliases.length) out[key] = [...new Set([...(out[key] ?? []), ...aliases])];
  }
  return out;
}

export const formatAliases = (a: Record<string, string[]>) =>
  Object.entries(a)
    .map(([k, v]) => `${k} = ${v.join(', ')}`)
    .join('\n');
