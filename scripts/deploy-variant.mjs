#!/usr/bin/env node
/**
 * Builds and deploys one variant of Precedent from the same source:
 *   marketplace  licensing enabled, current app id (the paid listing)
 *   judges       unlicensed copy with its own app id (install link for the hackathon)
 *
 * Usage:
 *   node scripts/deploy-variant.mjs marketplace [--dry-run]
 *   node scripts/deploy-variant.mjs judges      [--dry-run]
 *
 * The judges app id comes from JUDGES_APP_ID in .env (created in the Developer Console,
 * Developer Space "precedent"). Each variant is staged in .forge-build/<variant>/ so the
 * two manifests never mix. Forge deploys from the staged folder.
 */
import { readFile, writeFile, mkdir, rm, cp, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [variant, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
if (!['marketplace', 'judges'].includes(variant)) {
  console.error('Usage: node scripts/deploy-variant.mjs marketplace|judges [--dry-run]');
  process.exit(1);
}

for (const line of (await readFile(path.join(root, '.env'), 'utf8').catch(() => '')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const base = await readFile(path.join(root, 'manifest.yml'), 'utf8');
const BASE_ID = base.match(/^\s+id:\s*(ari:cloud:ecosystem::app\/[0-9a-f-]+)/m)?.[1];
if (!BASE_ID) throw new Error('Could not read app.id from manifest.yml');

let manifest = base;
if (variant === 'judges') {
  const judgesId = process.env.JUDGES_APP_ID;
  if (!judgesId || !/^ari:cloud:ecosystem::app\/[0-9a-f-]+$/.test(judgesId)) {
    throw new Error('Set JUDGES_APP_ID=ari:cloud:ecosystem::app/<uuid> in .env first (see docs/marketplace/judges-setup.md)');
  }
  manifest = manifest.replace(BASE_ID, judgesId);
} else {
  // Marketplace build: licensing on. Requires the paid listing to exist before deployment.
  if (!/^\s+licensing:/m.test(manifest)) {
    manifest = manifest.replace(/^(\s+)runtime:/m, '$1licensing:\n$1  enabled: true\n$1runtime:');
  }
}
if (variant === 'judges' && /licensing:/m.test(manifest)) throw new Error('The judges build must not contain licensing');

const dir = path.join(root, '.forge-build', variant);
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'manifest.yml'), manifest);
for (const item of ['src', 'skills', 'static', 'package.json', 'package-lock.json', 'tsconfig.json']) {
  await cp(path.join(root, item), path.join(dir, item), { recursive: true });
}
await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));

console.log(`Staged ${variant} in ${path.relative(root, dir)}`);
console.log(`app id: ${manifest.match(/^\s+id:\s*(\S+)/m)?.[1]}`);
console.log(`licensing: ${/licensing:/m.test(manifest) ? 'enabled' : 'off'}`);
if (dryRun) process.exit(0);

const environment = process.env.DEPLOY_ENV ?? 'development';
execFileSync('forge', ['deploy', '-e', environment, '--non-interactive'], { cwd: dir, stdio: 'inherit' });
