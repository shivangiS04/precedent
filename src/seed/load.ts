import api, { route } from '@forge/api';
import * as repo from '../db/repo';
import { validateDecisionInput } from '../domain/parse';
import type { Source } from '../domain/types';
import type { SeedResult } from '../shared/types';
import { NORTHWIND } from './northwind';
import siteRefs from './siteRefs.json';

interface SiteRefs {
  site?: string;
  users?: string[];
  pages?: Record<string, { id: string; title: string; url: string }>;
  issues?: Record<string, { id: string; key: string; url: string }>;
}

/**
 * Keeps only source links whose Jira issue or Confluence page exists on THIS site.
 * The demo content lives on one site; on other sites the links would point at nothing,
 * and Precedent hides decisions whose sources the viewer can't open.
 */
async function keepExisting(sources: Source[]): Promise<Source[]> {
  const checks = await Promise.all(
    sources.map(async (s) => {
      try {
        if (s.kind === 'confluence-page') {
          const r = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${s.ref}`, { headers: { Accept: 'application/json' } });
          return r.ok;
        }
        if (!s.refNumericId) return false;
        const r = await api.asApp().requestJira(route`/rest/api/3/issue/${String(s.refNumericId)}?fields=summary`, {
          headers: { Accept: 'application/json' },
        });
        return r.ok;
      } catch {
        return false;
      }
    }),
  );
  return sources.filter((_, i) => checks[i]);
}

/**
 * Loads the Northwind decisions. Idempotent: decisions whose title already exists are skipped.
 * Sources point at the Jira issues / Confluence pages created by scripts/seed-site.mjs.
 */
export async function seedNorthwind(actorAccountId: string): Promise<SeedResult> {
  const refs = siteRefs as unknown as SiteRefs;
  const owners = refs.users?.length ? refs.users : [actorAccountId];
  const existing = new Map((await repo.listDecisions({ limit: 1000 })).map((d) => [d.title, { id: d.id, owner: d.ownerAccountId, sources: d.sources }]));
  const idBySlug = new Map<string, string>();
  let created = 0;
  let skipped = 0;
  let repaired = 0;

  for (const [i, s] of NORTHWIND.entries()) {
    const found = existing.get(s.title);
    if (found) {
      idBySlug.set(s.slug, found.id);
      // Repair demo decisions whose owner is not one of the human owners (e.g. a bot).
      if (found.owner && !owners.includes(found.owner)) {
        await repo.setOwner(found.id, owners[i % owners.length]);
        repaired++;
      }
      // Drop source links that don't resolve on this site.
      const kept = await keepExisting(found.sources);
      if (kept.length !== found.sources.length) {
        await repo.setSources(found.id, kept);
        repaired++;
      }
      skipped++;
      continue;
    }
    const sources: Source[] = [];
    const page = s.page ? refs.pages?.[s.page] : undefined;
    if (page) sources.push({ kind: 'confluence-page', ref: page.id, url: page.url, title: page.title });
    const issue = s.issue ? refs.issues?.[s.issue] : undefined;
    if (issue) sources.push({ kind: 'jira-issue', ref: issue.key, refNumericId: Number(issue.id), url: issue.url });

    const owner = owners[i % owners.length];
    const usableSources = await keepExisting(sources);
    const parsed = validateDecisionInput({
      title: s.title,
      statement: s.statement,
      rationale: s.rationale,
      status: s.status,
      decidedAt: s.decidedAt,
      revisitBy: s.revisitBy ?? null,
      ownerAccountId: owner,
      deciders: [owner, owners[(i + 1) % owners.length]],
      alternatives: s.alternatives.map(([alternative, reason]) => ({ alternative, reason })),
      scope: { projects: s.projects, components: s.components ?? [], keywords: s.keywords },
      sources: usableSources,
    });
    if (!parsed.ok) {
      console.error('Seed decision invalid', s.slug, parsed.errors);
      return { ok: false, error: `Seed data invalid for ${s.slug}` };
    }
    idBySlug.set(s.slug, await repo.createDecision(parsed.value, actorAccountId));
    created++;
  }

  // Superseded chains: mark the older decision superseded by the newer one.
  for (const s of NORTHWIND) {
    if (!s.supersedes) continue;
    const newer = idBySlug.get(s.slug);
    const older = idBySlug.get(s.supersedes);
    if (newer && older) await repo.setStatus(older, 'superseded', newer);
  }
  console.log(`Precedent seed: ${created} created, ${skipped} already present, ${repaired} owners repaired`);
  return { ok: true, created, skipped, repaired };
}
