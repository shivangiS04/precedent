#!/usr/bin/env node
/**
 * Registers Precedent's Teamwork Graph persisted Cypher queries.
 *
 * Usage:  node scripts/register-twg-queries.mjs
 * Env (.env): FORGE_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE
 *
 * Idempotent: re-submitting identical Cypher returns 200 with the original key.
 * Validation errors (unknown relationship or property) are reported per query.
 * Newly registered queries take about a minute to propagate (QUERY_NOT_FOUND until then).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadEnv() {
  const text = await readFile(path.join(root, '.env'), 'utf8').catch(() => '');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  await loadEnv();
  const { FORGE_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE } = process.env;
  if (!FORGE_EMAIL || !ATLASSIAN_API_TOKEN || !ATLASSIAN_SITE) {
    throw new Error('Set FORGE_EMAIL, ATLASSIAN_API_TOKEN and ATLASSIAN_SITE in .env');
  }

  const manifest = await readFile(path.join(root, 'manifest.yml'), 'utf8');
  const appId = manifest.match(/id:\s*(ari:cloud:ecosystem::app\/[0-9a-f-]+)/)?.[1];
  if (!appId) throw new Error('Could not read app.id from manifest.yml');

  const { queries } = JSON.parse(await readFile(path.join(root, 'src/twg/queries.json'), 'utf8'));
  const auth = 'Basic ' + Buffer.from(`${FORGE_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString('base64');
  const keys = {};
  let failures = 0;

  for (const q of queries) {
    const res = await fetch(`https://${ATLASSIAN_SITE}/gateway/api/twg/cypher-queries`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ appId, name: q.name, cypher: q.cypher, paramsSchema: q.paramsSchema }),
    });
    const body = await res.text();
    if (res.status === 200 || res.status === 201) {
      const json = JSON.parse(body);
      keys[q.id] = { queryKey: json.queryKey, contentHash: json.contentHash, status: json.status };
      console.log(`✔ ${q.id.padEnd(18)} ${res.status === 201 ? 'registered' : 'already registered'}  ${json.queryKey}`);
    } else {
      failures++;
      console.error(`✖ ${q.id.padEnd(18)} HTTP ${res.status}: ${body.slice(0, 500)}`);
    }
  }

  // Keep existing keys for queries that failed this run.
  const outPath = path.join(root, 'src/twg/queryKeys.json');
  const previous = JSON.parse(await readFile(outPath, 'utf8').catch(() => '{}'));
  await writeFile(outPath, JSON.stringify({ ...previous, ...keys }, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(keys).length} key(s) to src/twg/queryKeys.json`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
