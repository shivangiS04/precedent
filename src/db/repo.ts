import { sql } from '@forge/sql';
import type { Decision, DecisionInput, DecisionStatus, Source } from '../domain/types';

/**
 * Forge SQL data access for decisions. No foreign keys exist, so this layer
 * owns child-row consistency (alternatives, scope, deciders, sources).
 */

type Row = Record<string, unknown>;

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');
const toDate = (v: unknown): string | null => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const toIso = (v: unknown): string => (v ? (v instanceof Date ? v.toISOString() : String(v)) : '');

async function run(query: string, ...params: unknown[]): Promise<Row[]> {
  const stmt = sql.prepare<Row>(query);
  const res = params.length ? await stmt.bindParams(...(params as never[])).execute() : await stmt.execute();
  return (res.rows ?? []) as Row[];
}

async function insertChildren(id: string, input: DecisionInput): Promise<void> {
  for (const a of input.alternatives ?? []) {
    await run('INSERT INTO decision_alternatives (id, decision_id, alternative, reason) VALUES (?, ?, ?, ?)', crypto.randomUUID(), id, a.alternative, a.reason);
  }
  const scope = input.scope ?? {};
  const scopeRows: [string, string][] = [
    ...(scope.projects ?? []).map((v): [string, string] => ['project', v]),
    ...(scope.components ?? []).map((v): [string, string] => ['component', v]),
    ...(scope.labels ?? []).map((v): [string, string] => ['label', v]),
    ...(scope.keywords ?? []).map((v): [string, string] => ['keyword', v]),
  ];
  for (const [kind, value] of scopeRows) {
    await run('INSERT INTO decision_scope (decision_id, kind, value) VALUES (?, ?, ?)', id, kind, value);
  }
  for (const accountId of input.deciders ?? []) {
    await run('INSERT INTO decision_deciders (decision_id, account_id) VALUES (?, ?)', id, accountId);
  }
  for (const s of input.sources ?? []) {
    await run(
      'INSERT INTO decision_sources (id, decision_id, kind, ref, ref_numeric_id, comment_id, url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(),
      id,
      s.kind,
      s.ref,
      s.refNumericId ?? null,
      s.commentId ?? null,
      s.url ?? null,
    );
  }
}

async function deleteChildren(id: string): Promise<void> {
  for (const table of ['decision_alternatives', 'decision_scope', 'decision_deciders', 'decision_sources']) {
    await run(`DELETE FROM ${table} WHERE decision_id = ?`, id);
  }
}

export async function createDecision(input: DecisionInput, createdBy: string | null, id: string = crypto.randomUUID()): Promise<string> {
  await run(
    `INSERT INTO decisions (id, title, statement, status, rationale, owner_account_id, decided_at, revisit_by, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.title,
    input.statement,
    input.status ?? 'proposed',
    input.rationale,
    input.ownerAccountId ?? null,
    input.decidedAt ?? null,
    input.revisitBy ?? null,
    createdBy,
  );
  try {
    await insertChildren(id, input);
  } catch (err) {
    // Best-effort rollback so a half-written decision never shows up.
    await deleteChildren(id).catch(() => undefined);
    await run('DELETE FROM decisions WHERE id = ?', id).catch(() => undefined);
    throw err;
  }
  return id;
}

export async function updateDecision(id: string, input: DecisionInput): Promise<void> {
  await run(
    `UPDATE decisions SET title = ?, statement = ?, status = ?, rationale = ?, owner_account_id = ?, decided_at = ?, revisit_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    input.title,
    input.statement,
    input.status ?? 'proposed',
    input.rationale,
    input.ownerAccountId ?? null,
    input.decidedAt ?? null,
    input.revisitBy ?? null,
    id,
  );
  await deleteChildren(id);
  await insertChildren(id, input);
}

export async function setStatus(id: string, status: DecisionStatus, supersededBy: string | null = null): Promise<void> {
  await run('UPDATE decisions SET status = ?, superseded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', status, status === 'superseded' ? supersededBy : null, id);
}

export interface ListFilter {
  status?: DecisionStatus;
  project?: string;
  ids?: string[];
  limit?: number;
}

export async function listDecisions(filter: ListFilter = {}): Promise<Decision[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    where.push('d.status = ?');
    params.push(filter.status);
  }
  if (filter.project) {
    where.push("d.id IN (SELECT decision_id FROM decision_scope WHERE kind = 'project' AND value = ?)");
    params.push(filter.project.toUpperCase());
  }
  if (filter.ids) {
    if (filter.ids.length === 0) return [];
    where.push(`d.id IN (${placeholders(filter.ids.length)})`);
    params.push(...filter.ids);
  }
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 1000);
  const rows = await run(
    `SELECT d.* FROM decisions d ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.decided_at DESC, d.created_at DESC LIMIT ${limit}`,
    ...params,
  );
  return hydrate(rows);
}

export async function getDecision(id: string): Promise<Decision | null> {
  const [d] = await listDecisions({ ids: [id], limit: 1 });
  return d ?? null;
}

/** Changes whenever any decision is added, edited or changes status. */
export async function ledgerVersion(): Promise<string> {
  const [r] = await run('SELECT COUNT(*) AS n, MAX(updated_at) AS m FROM decisions');
  return `${Number(r?.n ?? 0)}:${toIso(r?.m)}`;
}

/** Decisions that can still conflict with new work (everything except superseded). */
export async function liveDecisions(): Promise<Decision[]> {
  const all = await listDecisions({ limit: 1000 });
  return all.filter((d) => d.status !== 'superseded');
}

export async function countDecisions(): Promise<number> {
  const rows = await run('SELECT COUNT(*) AS n FROM decisions');
  return Number(rows[0]?.n ?? 0);
}

/** Loads child rows for a page of decisions with one query per child table. */
async function hydrate(rows: Row[]): Promise<Decision[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => String(r.id));
  const inList = placeholders(ids.length);
  const [alts, scope, deciders, sources] = await Promise.all([
    run(`SELECT decision_id, alternative, reason FROM decision_alternatives WHERE decision_id IN (${inList})`, ...ids),
    run(`SELECT decision_id, kind, value FROM decision_scope WHERE decision_id IN (${inList})`, ...ids),
    run(`SELECT decision_id, account_id FROM decision_deciders WHERE decision_id IN (${inList})`, ...ids),
    run(`SELECT decision_id, kind, ref, ref_numeric_id, comment_id, url FROM decision_sources WHERE decision_id IN (${inList})`, ...ids),
  ]);

  const by = <T>(list: Row[], map: (r: Row) => T) => {
    const m = new Map<string, T[]>();
    for (const r of list) {
      const k = String(r.decision_id);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(map(r));
    }
    return m;
  };
  const altMap = by(alts, (r) => ({ alternative: String(r.alternative), reason: String(r.reason ?? '') }));
  const scopeMap = by(scope, (r) => ({ kind: String(r.kind), value: String(r.value) }));
  const deciderMap = by(deciders, (r) => String(r.account_id));
  const sourceMap = by(sources, (r): Source => ({
    kind: String(r.kind) as Source['kind'],
    ref: String(r.ref),
    refNumericId: r.ref_numeric_id == null ? null : Number(r.ref_numeric_id),
    commentId: r.comment_id == null ? null : String(r.comment_id),
    url: r.url == null ? null : String(r.url),
  }));

  return rows.map((r) => {
    const id = String(r.id);
    const sc = scopeMap.get(id) ?? [];
    const of = (k: string) => sc.filter((s) => s.kind === k).map((s) => s.value);
    return {
      id,
      title: String(r.title),
      statement: String(r.statement),
      status: String(r.status) as DecisionStatus,
      rationale: String(r.rationale ?? ''),
      ownerAccountId: r.owner_account_id == null ? null : String(r.owner_account_id),
      deciders: deciderMap.get(id) ?? [],
      decidedAt: toDate(r.decided_at),
      revisitBy: toDate(r.revisit_by),
      supersededBy: r.superseded_by == null ? null : String(r.superseded_by),
      alternatives: altMap.get(id) ?? [],
      scope: { projects: of('project'), components: of('component'), labels: of('label'), keywords: of('keyword') },
      sources: sourceMap.get(id) ?? [],
      createdAt: toIso(r.created_at),
      updatedAt: toIso(r.updated_at),
    };
  });
}

// ---------- Conflict feedback ----------

export type FeedbackKind = 'not-related' | 'revisit' | 'acknowledge';

export async function addFeedback(decisionId: string, issueKey: string | null, accountId: string, kind: FeedbackKind, reason: string | null = null): Promise<void> {
  await run(
    'INSERT INTO feedback (id, decision_id, issue_key, account_id, kind, reason) VALUES (?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    decisionId,
    issueKey,
    accountId,
    kind,
    reason,
  );
}

export async function removeDismissal(decisionId: string, issueKey: string): Promise<void> {
  await run("DELETE FROM feedback WHERE decision_id = ? AND issue_key = ? AND kind = 'not-related'", decisionId, issueKey);
}

/** Decision ids marked "not related" for an issue (by anyone: it's a team signal). */
export async function dismissedFor(issueKey: string): Promise<Set<string>> {
  const rows = await run("SELECT DISTINCT decision_id FROM feedback WHERE issue_key = ? AND kind = 'not-related'", issueKey);
  return new Set(rows.map((r) => String(r.decision_id)));
}

// ---------- Conflict cache (written by the trigger and the live panel) ----------

export interface CachedCheck {
  issueId: string;
  issueKey: string;
  contentHash: string;
  result: { matches: { decisionId: string; kind: string; confidence: number }[] };
  commented: boolean;
  checkedAt: string;
}

export async function getCachedCheck(issueId: string): Promise<CachedCheck | null> {
  const [r] = await run('SELECT * FROM conflict_results WHERE issue_id = ?', issueId);
  if (!r) return null;
  const result = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
  return {
    issueId: String(r.issue_id),
    issueKey: String(r.issue_key),
    contentHash: String(r.content_hash),
    result: result ?? { matches: [] },
    commented: Number(r.commented) === 1,
    checkedAt: toIso(r.checked_at),
  };
}

export async function saveCachedCheck(issueId: string, issueKey: string, contentHash: string, result: CachedCheck['result'], commented?: boolean): Promise<void> {
  await run(
    `INSERT INTO conflict_results (issue_id, issue_key, content_hash, result, commented) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE issue_key = VALUES(issue_key), content_hash = VALUES(content_hash), result = VALUES(result),
       commented = GREATEST(commented, VALUES(commented)), checked_at = CURRENT_TIMESTAMP`,
    issueId,
    issueKey,
    contentHash,
    JSON.stringify(result),
    commented ? 1 : 0,
  );
}

// ---------- Settings ----------

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [r] = await run('SELECT value FROM settings WHERE setting_key = ?', key);
  if (!r) return fallback;
  try {
    return (typeof r.value === 'string' ? JSON.parse(r.value) : r.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await run(
    'INSERT INTO settings (setting_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    key,
    JSON.stringify(value),
  );
}
