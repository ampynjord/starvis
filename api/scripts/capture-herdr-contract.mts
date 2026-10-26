/**
 * Produit la référence du contrat v1/v2 en exécutant le code de
 * `wip/herdr-agents`. Refuser d'écrire si la cible n'est pas cette branche,
 * si `api/` y est sale, ou si ce code déclare déjà `/api/universe`.
 *
 *   npx tsx scripts/capture-herdr-contract.mts
 *
 * Variable : HERDR_ROOT (défaut : worktree hub voisin).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectSnapshots, mountContractApp } from '../tests/version-contract-harness.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
register(new URL('./herdr-resolve-hooks.mjs', import.meta.url).href, import.meta.url);

const herdrRoot = process.env.HERDR_ROOT ?? path.resolve(scriptDir, '..', '..', '..', 'starvis-wt-herdr');
const herdrApi = path.join(herdrRoot, 'api');

function git(args: string[]): string {
  return execFileSync('git', ['-C', herdrRoot, ...args], { encoding: 'utf8' }).trim();
}

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'wip/herdr-agents') {
  throw new Error(`Référence refusée : ${herdrRoot} est sur ${branch}, pas wip/herdr-agents.`);
}

const dirty = git(['status', '--porcelain', '--', 'api']);
if (dirty) {
  throw new Error(`Référence refusée : api/ est sale dans ${herdrRoot}.\n${dirty}`);
}

const nexusSource = readFileSync(path.join(herdrApi, 'src', 'routes', 'universe-nexus.ts'), 'utf8');
const unversionedUniverseRoutes = nexusSource.split('/api/universe').length - 1;
if (unversionedUniverseRoutes !== 0) {
  throw new Error('Référence refusée : le code herdr déclare déjà /api/universe.');
}

const commit = git(['rev-parse', 'HEAD']);
const subject = git(['log', '-1', '--format=%s']);

const routesUrl = pathToFileURL(path.join(herdrApi, 'src', 'routes', 'index.ts')).href;
const shapeUrl = pathToFileURL(path.join(herdrApi, 'src', 'middleware', 'response-shape.ts')).href;
const { createRoutes } = await import(routesUrl);
const { responseShapeMiddleware } = await import(shapeUrl);

const app = mountContractApp(createRoutes, responseShapeMiddleware);
const probes = await collectSnapshots(app);

const fixture = {
  baseline: {
    ref: 'wip/herdr-agents',
    commit,
    subject,
    unversionedUniverseRoutes,
  },
  probes,
};

const out = path.join(scriptDir, '..', 'tests', 'fixtures', 'version-contract.herdr.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Référence ${commit.slice(0, 12)} — ${probes.length} sondes → ${out}`);
for (const probe of probes) {
  console.log(`${probe.status}\t${probe.version}\t${probe.id}`);
}
