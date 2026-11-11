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
    `UPDATE decisions SET title = ?, statement = ?, status = ?, rationale = ?, owner_account_id = ?, decided_at = ?, revisit_by = ?
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
  await run('UPDATE decisions SET status = ?, superseded_by = ? WHERE id = ?', status, status === 'superseded' ? supersededBy : null, id);
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
