import type { Decision } from '../src/domain/types';
import { NORTHWIND } from '../src/seed/northwind';

/** Northwind seed decisions as hydrated Decision objects (ids = slugs). */
export const northwindDecisions = (): Decision[] => {
  const decisions: Decision[] = NORTHWIND.map((s) => ({
    id: s.slug,
    title: s.title,
    statement: s.statement,
    status: s.status,
    rationale: s.rationale,
    ownerAccountId: 'owner-1',
    deciders: [],
    decidedAt: s.decidedAt,
    revisitBy: s.revisitBy ?? null,
    supersededBy: null,
    alternatives: s.alternatives.map(([alternative, reason]) => ({ alternative, reason })),
    scope: { projects: s.projects, components: s.components ?? [], labels: [], keywords: s.keywords },
    sources: s.issue ? [{ kind: 'jira-issue', ref: 'PLAT-1', refNumericId: 1 }] : [],
    createdAt: '',
    updatedAt: '',
  }));
  for (const s of NORTHWIND) {
    if (!s.supersedes) continue;
    const older = decisions.find((d) => d.id === s.supersedes)!;
    older.status = 'superseded';
    older.supersededBy = s.slug;
  }
  return decisions;
};

/** Mirrors the work items scripts/seed-site.mjs creates. */
export const WORK = {
  spike: { key: 'PLAT-1', projectKey: 'PLAT', summary: 'Spike: session storage options (2026)', description: 'Background research for the session cache decision. Outcome recorded in ADR-007.' },
  redis: { key: 'PLAT-2', projectKey: 'PLAT', summary: 'Add Redis cache for user sessions', description: 'Session lookups are slow on the dashboard. Proposal: add a Redis (ElastiCache) cluster in front of the session table.' },
  flags: { key: 'PLAT-3', projectKey: 'PLAT', summary: 'Build a lightweight homegrown feature flag service', description: 'LaunchDarkly seats are expensive; build a small internal flag service backed by a config table.' },
  graphql: { key: 'PLAT-4', projectKey: 'PLAT', summary: 'Add a GraphQL endpoint for partner integrations', description: 'Partners want to fetch payments and refunds in one call. Expose a GraphQL API alongside REST.' },
  service: { key: 'PLAT-5', projectKey: 'PLAT', summary: 'Spin up a new notifications microservice', description: 'Extract email and SMS notifications into their own deployable service.' },
  pan: { key: 'PAY-1', projectKey: 'PAY', summary: 'Store encrypted card numbers for one-click checkout', description: 'Persist encrypted PANs in the payments DB so returning customers can pay without re-entering cards.' },
  float: { key: 'PAY-2', projectKey: 'PAY', summary: 'Use float amounts in the new FX conversion service', description: 'Represent converted amounts as doubles to simplify the rate maths.' },
  neutral: { key: 'PAY-3', projectKey: 'PAY', summary: 'Improve merchant onboarding copy', description: 'Rewrite the KYC step instructions for clarity.' },
};
