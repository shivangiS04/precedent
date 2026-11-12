/**
 * Deterministic conflict matcher. Pure: no I/O, so it is shared by the issue panel,
 * the Jira trigger, Rovo actions and MCP tools, and is fully unit-tested.
 *
 * Signals, strongest first:
 *  1. The work mentions an alternative the decision REJECTED  -> conflict.
 *  2. The work mentions the decision's keywords/aliases       -> related.
 *  3. Project / component / label scope adjusts confidence.
 * Superseded decisions never match (their replacement does), and a decision is
 * never matched against the work item it was recorded from.
 */
import type { Alternative, Decision } from './types';
import { containsPhrase, tokenize } from './text';

export interface WorkFacts {
  key?: string | null;
  summary: string;
  description?: string | null;
  projectKey?: string | null;
  components?: string[];
  labels?: string[];
}

export type MatchKind = 'conflict' | 'related';
export type Level = 'high' | 'medium' | 'low';

export interface Match {
  decisionId: string;
  kind: MatchKind;
  confidence: number;
  level: Level;
  collidesWith: Alternative | null;
  matchedTerms: string[];
  /** true/false when the decision is scoped to projects, null when unscoped or unknown. */
  inScope: boolean | null;
  explanation: string;
}

export interface MatchOptions {
  /** Extra aliases per keyword, from admin settings (M8). */
  aliases?: Record<string, string[]>;
  limit?: number;
}

const STOPWORDS = new Set(
  ['a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'without', 'only', 'and', 'or', 'keep', 'use', 'by', 'from', 'into', 'via', 'per', 'as', 'at', 'be', 'is', 'our', 'we', 'out', 'up'].map(
    (w) => w,
  ),
);

export const THRESHOLDS = { conflict: 0.45, related: 0.3 } as const;

const levelOf = (c: number): Level => (c >= 0.75 ? 'high' : c >= 0.5 ? 'medium' : 'low');
const round = (n: number) => Math.round(n * 100) / 100;

/** "Float/double", "Unleash (self-hosted)", "A or B" -> token variants. */
function alternativeVariants(alternative: string): string[][] {
  return alternative
    .replace(/\([^)]*\)/g, ' ')
    .split(/\/|\||\bor\b|\+/i)
    .map((v) => tokenize(v).filter((t) => !STOPWORDS.has(t)))
    .filter((v) => v.length > 0 && !(v.length === 1 && v[0].length < 3));
}

interface Hit {
  alt: Alternative;
  inSummary: boolean;
}

function findAlternativeHit(alts: Alternative[], summary: Set<string>, all: Set<string>): Hit | null {
  let best: Hit | null = null;
  for (const alt of alts) {
    for (const variant of alternativeVariants(alt.alternative)) {
      if (!variant.every((t) => all.has(t))) continue;
      const inSummary = variant.every((t) => summary.has(t));
      if (!best || (inSummary && !best.inSummary)) best = { alt, inSummary };
    }
  }
  return best;
}

export function matchDecision(work: WorkFacts, d: Decision, opts: MatchOptions = {}): Match | null {
  if (d.status === 'superseded') return null;
  if (work.key && d.sources.some((s) => s.kind !== 'confluence-page' && s.ref === work.key)) return null;

  const summaryTokens = tokenize(work.summary);
  const descTokens = tokenize(work.description);
  const summarySet = new Set(summaryTokens);
  const allSet = new Set([...summaryTokens, ...descTokens]);

  let score = 0;
  const hit = findAlternativeHit(d.alternatives, summarySet, allSet);
  if (hit) score += hit.inSummary ? 0.6 : 0.5;

  // Keywords and aliases: contiguous phrase match, deduplicated by stemmed form.
  const phrases = new Map<string, { label: string; tokens: string[] }>();
  for (const kw of d.scope.keywords) {
    for (const term of [kw, ...(opts.aliases?.[kw.toLowerCase()] ?? [])]) {
      const tokens = tokenize(term);
      if (tokens.length) phrases.set(tokens.join(' '), { label: term, tokens });
    }
  }
  let kwScore = 0;
  const matchedTerms: string[] = [];
  for (const { label, tokens } of phrases.values()) {
    const weight = tokens.length > 1 ? 1.4 : 1;
    if (containsPhrase(summaryTokens, tokens)) kwScore += 0.15 * weight;
    else if (containsPhrase(descTokens, tokens)) kwScore += 0.08 * weight;
    else continue;
    matchedTerms.push(label);
  }
  score += Math.min(kwScore, 0.35);

  // Components and labels overlap.
  const workTags = new Set([...(work.components ?? []), ...(work.labels ?? [])].map((s) => s.toLowerCase()));
  const tagHits = [...d.scope.components, ...d.scope.labels].filter((t) => workTags.has(t.toLowerCase()));
  score += Math.min(tagHits.length * 0.1, 0.2);

  if (score === 0) return null;

  let inScope: boolean | null = null;
  if (d.scope.projects.length && work.projectKey) {
    inScope = d.scope.projects.includes(work.projectKey.toUpperCase());
    score = inScope ? score + 0.1 : score * 0.7;
  }
  if (d.status === 'proposed') score *= 0.75;
  if (d.status === 'revisit') score *= 0.85;

  const confidence = round(Math.min(score, 0.98));
  const kind: MatchKind | null = hit && confidence >= THRESHOLDS.conflict ? 'conflict' : confidence >= THRESHOLDS.related ? 'related' : null;
  if (!kind) return null;

  const parts: string[] = [];
  if (kind === 'conflict' && hit) {
    parts.push(`Matches "${hit.alt.alternative}", which this decision rejected${hit.alt.reason ? `: ${hit.alt.reason}` : ''}.`);
  } else {
    const terms = [...new Set([...matchedTerms, ...tagHits])].slice(0, 3);
    parts.push(`Touches ${terms.join(', ') || 'the same area'}, which this decision covers.`);
  }
  if (inScope === false) parts.push(`The decision is scoped to ${d.scope.projects.join(', ')}.`);
  if (d.status === 'proposed') parts.push('The decision is only proposed, not yet agreed.');
  if (d.status === 'revisit') parts.push('The decision is open for revisit.');

  return {
    decisionId: d.id,
    kind,
    confidence,
    level: levelOf(confidence),
    collidesWith: kind === 'conflict' && hit ? hit.alt : null,
    matchedTerms: [...new Set([...matchedTerms, ...tagHits])],
    inScope,
    explanation: parts.join(' '),
  };
}

/** Conflicts first, then by confidence. */
export function matchDecisions(work: WorkFacts, decisions: Decision[], opts: MatchOptions = {}): Match[] {
  const out = decisions.map((d) => matchDecision(work, d, opts)).filter((m): m is Match => m !== null);
  out.sort((a, b) => (a.kind === b.kind ? b.confidence - a.confidence : a.kind === 'conflict' ? -1 : 1));
  return out.slice(0, opts.limit ?? 10);
}
