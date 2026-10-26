/**
 * Marque /api/v1 et /api/v2 comme compatibilité et copie les quatre routes
 * Nexus vers /api/universe, sans modifier les schémas de réponse.
 *
 * Idempotent. Usage : node scripts/mark-openapi-compat.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const specPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const COMPAT_NOTE =
  '\n\n### Compatibility\n`/api/v1` and `/api/v2` stay served with unchanged responses and are marked deprecated. The canonical Nexus surface has no version prefix (`/api/universe/...`) and calls the same handlers as `/api/v2/universe/...`.';

if (!String(spec.info?.description ?? '').includes('canonical Nexus surface')) {
  spec.info.description = `${spec.info?.description ?? ''}${COMPAT_NOTE}`;
}

for (const routePath of Object.keys(spec.paths ?? {})) {
  if (!routePath.startsWith('/api/v2/universe/')) continue;
  const canonical = routePath.replace('/api/v2/', '/api/');
  if (spec.paths[canonical]) continue;
  const cloned = structuredClone(spec.paths[routePath]);
  for (const operation of Object.values(cloned)) {
    if (!operation || typeof operation !== 'object' || !operation.operationId) continue;
    operation.operationId = `${operation.operationId}Canonical`;
  }
  spec.paths[canonical] = cloned;
}

for (const [routePath, methods] of Object.entries(spec.paths ?? {})) {
  if (!routePath.startsWith('/api/v1/') && !routePath.startsWith('/api/v2/')) continue;
  for (const operation of Object.values(methods)) {
    if (!operation || typeof operation !== 'object' || !operation.responses) continue;
    operation.deprecated = true;
    operation['x-starvis-layer'] = 'compatibility';
  }
}

writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
console.log('openapi.json mis à jour');
