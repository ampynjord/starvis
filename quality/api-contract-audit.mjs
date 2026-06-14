#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const openApiPath = resolve(root, 'api/openapi.json');
const ihmTypesPath = resolve(root, 'ihm/src/types/api.ts');
const proxyPath = resolve(root, 'ihm/src/app/api/_utils/proxy.ts');

const failures = [];
const warnings = [];

function fail(message, context) {
  failures.push({ message, context });
}

function warn(message, context) {
  warnings.push({ message, context });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Cannot read JSON: ${path}`, error.message);
    return null;
  }
}

const spec = readJson(openApiPath);
const ihmTypes = readFileSync(ihmTypesPath, 'utf8');
const proxy = readFileSync(proxyPath, 'utf8');

if (spec) {
  if (spec.openapi !== '3.1.0' && spec.openapi !== '3.0.0') warn('OpenAPI version is unusual', spec.openapi);
  if (!spec.info?.title?.includes('Starvis')) fail('OpenAPI title should mention Starvis', spec.info);

  const operationIds = new Map();
  const publicPaths = Object.keys(spec.paths ?? {}).filter((path) => path.startsWith('/api/v1/'));
  if (publicPaths.length < 10) fail('OpenAPI exposes too few public /api/v1 paths', publicPaths.length);

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (!operation.operationId) {
        warn(`${method.toUpperCase()} ${path} misses operationId`);
      } else {
        const previous = operationIds.get(operation.operationId);
        if (previous) fail(`Duplicate operationId "${operation.operationId}"`, { previous, current: `${method.toUpperCase()} ${path}` });
        operationIds.set(operation.operationId, `${method.toUpperCase()} ${path}`);
      }
      if (!operation.responses?.['200']) {
        warn(`${method.toUpperCase()} ${path} has no 200 response documented`);
      }
    }
  }

  const coreDomains = ['Ship', 'Component', 'Item', 'Commodity', 'Manufacturer', 'Mission', 'Location'];
  for (const domain of coreDomains) {
    if (!ihmTypes.includes(domain)) warn(`IHM API types do not mention core domain "${domain}"`);
  }
}

if (!proxy.includes('SERVER_API_URL')) fail('Public API proxy should route through SERVER_API_URL');
if (!proxy.includes('SESSION_COOKIE_MAX_AGE_SECONDS')) warn('Public API proxy does not import session cookie config');

console.log('STARVIS API contract audit');
console.log(`Failures: ${failures.length}`);
for (const item of failures) console.error(`FAIL ${item.message}`, item.context ?? '');
console.log(`Warnings: ${warnings.length}`);
for (const item of warnings) console.warn(`WARN ${item.message}`, item.context ?? '');

if (failures.length > 0) process.exit(1);
