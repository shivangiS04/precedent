/**
 * Ranks decisions for a free-text question ("what did we decide about caching?").
 * Pure and deterministic. Different from the conflict matcher: it ranks every decision
 * that is about the topic, including superseded ones (shown with their replacement).
 */
import type { Decision } from './types';
import { containsPhrase, tokenize } from './text';

const QUESTION_WORDS = new Set(
  ['what', 'did', 'we', 'decid', 'decision', 'about', 'why', 'how', 'do', 'doe', 'our', 'the', 'a', 'an', 'is', 'are', 'on', 'for', 'to', 'of', 'and', 'or', 'in', 'should', 'can', 'use', 'team', 'who', 'talk', 'befor', 'chang', 'with', 'it', 'any', 'past', 'was', 'were', 'there'].map(
    (w) => w,
  ),
);

export interface SearchHit {
  decision: Decision;
  score: number;
  matchedOn: string[];
}

export interface SearchOptions {
  project?: string | null;
  component?: string | null;
  limit?: number;
  aliases?: Record<string, string[]>;
}

export function searchDecisions(query: string, decisions: Decision[], opts: SearchOptions = {}): SearchHit[] {
  const q = tokenize(query).filter((t) => !QUESTION_WORDS.has(t));
  if (q.length === 0 && !opts.project && !opts.component) return [];
  const qSet = new Set(q);

  const hits: SearchHit[] = [];
  for (const d of decisions) {
    let score = 0;
    const matchedOn = new Set<string>();
    const field = (name: string, text: string, weight: number) => {
      const tokens = new Set(tokenize(text));
      let n = 0;
      for (const t of qSet) if (tokens.has(t)) n++;
      if (n) {
        score += weight * (n / Math.max(qSet.size, 1));
        matchedOn.add(name);
      }
    };
    field('title', d.title, 3);
    field('statement', d.statement, 2);
    field('rejected alternatives', d.alternatives.map((a) => a.alternative).join(' '), 2);
    field('rationale', d.rationale, 1);

    const qTokens = tokenize(query);
    for (const kw of d.scope.keywords) {
      const terms = [kw, ...(opts.aliases?.[kw.toLowerCase()] ?? [])];
      if (terms.some((t) => containsPhrase(qTokens, tokenize(t)))) {
        score += 2;
        matchedOn.add('keywords');
        break;
      }
    }
    if (opts.project && d.scope.projects.includes(opts.project.toUpperCase())) {
      score += q.length ? 0.5 : 1;
      matchedOn.add('project');
    }
    if (opts.component && d.scope.components.some((c) => c.toLowerCase() === opts.component!.toLowerCase())) {
      score += 1;
      matchedOn.add('component');
    }
    if (score <= 0) continue;
    if (d.status === 'superseded') score *= 0.6;
    if (d.status === 'proposed') score *= 0.85;
    hits.push({ decision: d, score: Math.round(score * 100) / 100, matchedOn: [...matchedOn] });
  }
  hits.sort((a, b) => b.score - a.score);
  // Drop weak tail matches when there are strong ones.
  const best = hits[0]?.score ?? 0;
  return hits.filter((h) => h.score >= Math.max(1, best * 0.25)).slice(0, opts.limit ?? 5);
}
