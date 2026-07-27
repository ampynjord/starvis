#!/usr/bin/env node
/**
 * Dérive les paramètres de requête d'openapi.json depuis les schémas zod.
 *
 * Le contrat était intégralement écrit à la main, et avait dérivé du code :
 * /api/v1/commodities documentait un paramètre `is_illegal` sans effet, et
 * omettait `types` et `category` réellement supportés.
 *
 * Le partage est explicite : zod possède la structure des paramètres (nom,
 * type, bornes, valeur par défaut), la prose écrite à la main est conservée
 * telle quelle. Les routes absentes du registre ne sont pas touchées.
 *
 * Usage :
 *   node scripts/sync-openapi.mjs            réécrit openapi.json
 *   node scripts/sync-openapi.mjs --check    échoue si un écart subsiste (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { QUERY_SCHEMA_REGISTRY } from '../src/openapi/query-registry.ts';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specPath = path.join(apiDir, 'openapi.json');
const checkOnly = process.argv.includes('--check');

/** Descriptions déjà rédigées, indexées par nom de paramètre, pour ne rien perdre. */
function collectDescriptions(spec) {
  const byName = new Map();
  for (const shared of Object.values(spec.components?.parameters ?? {})) {
    if (shared?.name && shared.description) byName.set(shared.name, shared.description);
  }
  for (const operations of Object.values(spec.paths ?? {})) {
    for (const operation of Object.values(operations)) {
      for (const parameter of operation?.parameters ?? []) {
        if (parameter?.name && parameter.description && !byName.has(parameter.name)) {
          byName.set(parameter.name, parameter.description);
        }
      }
    }
  }
  return byName;
}

/** Un schéma zod d'objet devient une liste de paramètres `in: query`. */
function parametersFromSchema(schema, descriptions) {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  const required = new Set(json.required ?? []);
  const shape = schema.shape ?? {};

  return Object.entries(json.properties ?? {})
    .map(([name, propertySchema]) => {
      // $schema n'a pas de sens sur un paramètre isolé.
      const { $schema, ...rest } = propertySchema ?? {};

      // zod laisse passer `maximum` et `description` depuis les métadonnées mais
      // écarte `default` : on le réinjecte pour ne pas perdre l'information.
      const meta = shape[name]?.meta?.() ?? {};
      if (meta.default !== undefined && rest.default === undefined) rest.default = meta.default;

      // Un entier sans plafond déclaré ressort borné à 2^53 : c'est la limite de
      // représentation de JavaScript, pas une contrainte de l'API. L'annoncer
      // induirait en erreur les clients qui lisent le contrat.
      if (rest.maximum === Number.MAX_SAFE_INTEGER) delete rest.maximum;

      const parameter = { name, in: 'query', schema: rest };
      if (required.has(name)) parameter.required = true;
      const description = descriptions.get(name);
      if (description) parameter.description = description;
      return parameter;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const descriptions = collectDescriptions(spec);
const missingRoutes = [];
let changed = 0;

for (const { method, path: routePath, schema } of QUERY_SCHEMA_REGISTRY) {
  const operation = spec.paths?.[routePath]?.[method];
  if (!operation) {
    missingRoutes.push(`${method.toUpperCase()} ${routePath}`);
    continue;
  }

  // Les paramètres de chemin (`in: path`) ne viennent pas du schéma de requête.
  const pathParameters = (operation.parameters ?? []).filter((p) => p.in === 'path');
  const next = [...pathParameters, ...parametersFromSchema(schema, descriptions)];

  if (JSON.stringify(operation.parameters ?? []) !== JSON.stringify(next)) {
    operation.parameters = next;
    changed++;
  }
}

if (missingRoutes.length) {
  console.error(`Routes du registre absentes d'openapi.json :\n  ${missingRoutes.join('\n  ')}`);
  process.exit(1);
}

if (checkOnly) {
  if (changed) {
    console.error(
      `${changed} route(s) dont les paramètres documentés diffèrent des schémas zod.\n` +
        'Lancez `npm run openapi:sync --workspace=@starvis/api` et validez le résultat.',
    );
    process.exit(1);
  }
  console.log(`Contrat aligné sur les schémas zod (${QUERY_SCHEMA_REGISTRY.length} routes vérifiées).`);
} else {
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`${changed} route(s) mise(s) à jour sur ${QUERY_SCHEMA_REGISTRY.length} vérifiées.`);
}
