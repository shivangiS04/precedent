#!/usr/bin/env node
/**
 * Creates the Northwind Payments demo content on the dev/demo site:
 *   - Jira projects PAY and PLAT, with work items (some deliberately conflict with decisions)
 *   - Confluence space NWENG with ADR pages for key decisions
 * Writes ids to src/seed/siteRefs.json, which the in-app "Load demo data" button uses.
 *
 * Usage: node scripts/seed-site.mjs      (idempotent: reuses anything that already exists)
 * Env (.env): FORGE_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of (await readFile(path.join(root, '.env'), 'utf8').catch(() => '')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { FORGE_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE } = process.env;
if (!FORGE_EMAIL || !ATLASSIAN_API_TOKEN || !ATLASSIAN_SITE) throw new Error('Set FORGE_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE in .env');
const base = `https://${ATLASSIAN_SITE}`;
const auth = 'Basic ' + Buffer.from(`${FORGE_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString('base64');

async function api(method, p, body) {
  const res = await fetch(base + p, {
    method,
    headers: { Authorization: auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  return { ok: res.ok, status: res.status, json };
}
const must = (r, what) => {
  if (!r.ok) throw new Error(`${what} failed: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 400)}`);
  return r.json;
};
const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- Data ----------
const PROJECTS = [
  { key: 'PAY', name: 'Northwind Payments' },
  { key: 'PLAT', name: 'Northwind Platform' },
];

const ISSUES = [
  { slug: 'plat-session-spike', project: 'PLAT', summary: 'Spike: session storage options (2026)', description: 'Background research for the session cache decision. Outcome recorded in ADR-007.' },
  { slug: 'conflict-redis', project: 'PLAT', summary: 'Add Redis cache for user sessions', description: 'Session lookups are slow on the dashboard. Proposal: add a Redis (ElastiCache) cluster in front of the session table.' },
  { slug: 'conflict-flags', project: 'PLAT', summary: 'Build a lightweight homegrown feature flag service', description: 'LaunchDarkly seats are expensive; build a small internal flag service backed by a config table.' },
  { slug: 'conflict-graphql', project: 'PLAT', summary: 'Add a GraphQL endpoint for partner integrations', description: 'Partners want to fetch payments and refunds in one call. Expose a GraphQL API alongside REST.' },
  { slug: 'conflict-service', project: 'PLAT', summary: 'Spin up a new notifications microservice', description: 'Extract email and SMS notifications into their own deployable service.' },
  { slug: 'conflict-pan', project: 'PAY', summary: 'Store encrypted card numbers for one-click checkout', description: 'Persist encrypted PANs in the payments DB so returning customers can pay without re-entering cards.' },
  { slug: 'conflict-float', project: 'PAY', summary: 'Use float amounts in the new FX conversion service', description: 'Represent converted amounts as doubles to simplify the rate maths.' },
  { slug: 'neutral-onboarding', project: 'PAY', summary: 'Improve merchant onboarding copy', description: 'Rewrite the KYC step instructions for clarity.' },
];

const SPACE = { key: 'NWENG', name: 'Northwind Engineering' };
const PAGES = [
  {
    slug: 'adr-session-cache',
    title: 'ADR-007: Session cache on Postgres, not Redis',
    decision: 'We will store user sessions in Postgres unlogged tables, not Redis or ElastiCache.',
    context: 'Session reads peak around 2k rps. Adding Redis means a second stateful system with its own on-call, backups and security review, and no team volunteered to own it.',
    alternatives: [['Redis', 'Second stateful system; on-call burden with no owning team'], ['ElastiCache', 'Same ops load plus vendor cost'], ['Memcached', 'No persistence']],
  },
  {
    slug: 'adr-public-api',
    title: 'ADR-004: Public partner API is REST, not GraphQL',
    decision: 'We will expose the public partner API as versioned REST with OpenAPI, not GraphQL.',
    context: 'Partners rely on generated SDKs, API gateways and webhook tooling that expect REST/OpenAPI.',
    alternatives: [['GraphQL', 'Partner tooling expects REST; harder rate limiting and caching'], ['gRPC', 'Poor browser and partner support']],
  },
  {
    slug: 'adr-feature-flags',
    title: 'ADR-002: Feature flags via LaunchDarkly only',
    decision: 'We will use LaunchDarkly for all feature flags; no homegrown flag systems.',
    context: 'Three homegrown flag systems drifted apart and one caused a production incident.',
    alternatives: [['Homegrown flags', 'Drifted; caused an incident; no audit trail'], ['Environment variables', 'Every change needs a deploy']],
  },
  {
    slug: 'adr-microservices',
    title: 'ADR-005: No new microservices without an ADR',
    decision: 'We will not create a new deployable service without an approved ADR.',
    context: 'We grew from 9 to 41 services in 18 months; many have a single owner and no on-call.',
    alternatives: [['Team discretion', 'Led to service sprawl']],
  },
  {
    slug: 'adr-card-data',
    title: 'ADR-003: Card data never touches our servers',
    decision: 'We will tokenize cards with Stripe Elements; raw card numbers are never stored or logged.',
    context: 'Storing PANs, even encrypted, puts every service in PCI DSS scope.',
    alternatives: [['Store encrypted PANs', 'Expands PCI scope']],
  },
  {
    slug: 'draft-otel',
    title: 'ADR-015 (draft): Adopt OpenTelemetry for tracing',
    decision: 'We will instrument services with OpenTelemetry SDKs and export to Datadog.',
    context: 'Vendor-neutral instrumentation keeps us portable. Not yet recorded in Precedent: used to demo "Record as decision".',
    alternatives: [['Datadog-native tracer', 'Locks instrumentation to one vendor']],
  },
];

const pageBody = (p) => `
<h2>Status</h2><p>Accepted</p>
<h2>Decision</h2><p><strong>${esc(p.decision)}</strong></p>
<h2>Context</h2><p>${esc(p.context)}</p>
<h2>Alternatives considered</h2>
<table><tbody><tr><th>Alternative</th><th>Why rejected</th></tr>
${p.alternatives.map(([a, r]) => `<tr><td>${esc(a)}</td><td>${esc(r)}</td></tr>`).join('')}
</tbody></table>`;

// ---------- Run ----------
const me = must(await api('GET', '/rest/api/3/myself'), 'myself');
console.log(`Seeding ${ATLASSIAN_SITE} as ${me.displayName}`);

// Users for decision owners: me first, then other active humans.
const users = must(await api('GET', '/rest/api/3/users/search?maxResults=100'), 'users');
const owners = [me.accountId, ...users.filter((u) => u.accountType === 'atlassian' && u.active && u.accountId !== me.accountId).map((u) => u.accountId)].slice(0, 6);
console.log(`✔ ${owners.length} owner account(s)`);

// Jira projects
const TEMPLATES = [
  'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic',
  'com.pyxis.greenhopper.jira:gh-simplified-scrum-classic',
  'com.atlassian.jira-core-project-templates:jira-core-simplified-task-tracking',
];
for (const p of PROJECTS) {
  const existing = await api('GET', `/rest/api/3/project/${p.key}`);
  if (existing.ok) {
    console.log(`✔ project ${p.key} exists`);
    continue;
  }
  let created = null;
  for (const tpl of TEMPLATES) {
    const r = await api('POST', '/rest/api/3/project', {
      key: p.key, name: p.name, leadAccountId: me.accountId, projectTypeKey: tpl.includes('core') ? 'business' : 'software', projectTemplateKey: tpl,
    });
    if (r.ok) { created = r; break; }
    console.warn(`  template ${tpl} failed: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  }
  if (!created) throw new Error(`Could not create project ${p.key}`);
  console.log(`✔ project ${p.key} created`);
}

// Jira issues
const issueRefs = {};
for (const i of ISSUES) {
  const jql = `project = ${i.project} AND summary ~ "\\"${i.summary.replace(/"/g, '')}\\""`;
  const found = must(await api('GET', `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=5`), 'search');
  let issue = (found.issues ?? []).find((x) => x.fields?.summary === i.summary);
  if (!issue) {
    const proj = must(await api('GET', `/rest/api/3/project/${i.project}`), 'project');
    const type = (proj.issueTypes ?? []).find((t) => t.name === 'Task') ?? (proj.issueTypes ?? []).find((t) => !t.subtask);
    const r = must(await api('POST', '/rest/api/3/issue', {
      fields: { project: { key: i.project }, summary: i.summary, issuetype: { id: type.id }, description: adf(i.description) },
    }), `create issue ${i.slug}`);
    issue = { id: r.id, key: r.key };
    console.log(`✔ ${r.key} created: ${i.summary}`);
  } else {
    console.log(`✔ ${issue.key} exists: ${i.summary}`);
  }
  issueRefs[i.slug] = { id: String(issue.id), key: issue.key, url: `${base}/browse/${issue.key}` };
}

// Confluence space
let space = must(await api('GET', `/wiki/api/v2/spaces?keys=${SPACE.key}`), 'spaces').results?.[0];
if (!space) {
  must(await api('POST', '/wiki/rest/api/space', { key: SPACE.key, name: SPACE.name }), 'create space');
  space = must(await api('GET', `/wiki/api/v2/spaces?keys=${SPACE.key}`), 'spaces').results?.[0];
  console.log(`✔ space ${SPACE.key} created`);
} else {
  console.log(`✔ space ${SPACE.key} exists`);
}

// Confluence pages
const pageRefs = {};
for (const p of PAGES) {
  const found = must(await api('GET', `/wiki/api/v2/spaces/${space.id}/pages?title=${encodeURIComponent(p.title)}&limit=1`), 'find page');
  let page = found.results?.[0];
  if (!page) {
    page = must(await api('POST', '/wiki/api/v2/pages', {
      spaceId: space.id, status: 'current', title: p.title, body: { representation: 'storage', value: pageBody(p) },
    }), `create page ${p.slug}`);
    console.log(`✔ page created: ${p.title}`);
  } else {
    console.log(`✔ page exists: ${p.title}`);
  }
  pageRefs[p.slug] = { id: String(page.id), title: p.title, url: `${base}/wiki/spaces/${SPACE.key}/pages/${page.id}` };
}

const out = { site: ATLASSIAN_SITE, users: owners, pages: pageRefs, issues: issueRefs };
await writeFile(path.join(root, 'src/seed/siteRefs.json'), JSON.stringify(out, null, 2) + '\n');
console.log('\nWrote src/seed/siteRefs.json');
