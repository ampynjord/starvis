#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_ENV = 'live';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const [key, inlineValue] = arg.slice(2).split('=', 2);
  const next = process.argv[i + 1];
  let value = inlineValue ?? 'true';
  if (inlineValue === undefined && next && !next.startsWith('--')) {
    value = next;
    i += 1;
  }
  args.set(key, value);
}

const baseUrl = String(args.get('base-url') ?? process.env.STARVIS_AUDIT_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
const env = String(args.get('env') ?? process.env.STARVIS_AUDIT_ENV ?? DEFAULT_ENV);
const strict = args.get('strict') === 'true' || process.env.STARVIS_AUDIT_STRICT === 'true';
const output = args.get('output') ? resolve(String(args.get('output'))) : null;
const apiToken = String(args.get('api-token') ?? process.env.STARVIS_AUDIT_API_TOKEN ?? process.env.API_TOKEN ?? '');
const adminApiKey = String(args.get('api-key') ?? process.env.STARVIS_AUDIT_API_KEY ?? '');

const failures = [];
const warnings = [];
const facts = [];
const samples = {};

function fail(message, context = undefined) {
  failures.push({ message, context });
}

function warn(message, context = undefined) {
  warnings.push({ message, context });
}

function fact(message, context = undefined) {
  facts.push({ message, context });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getTotal(body) {
  const candidates = [body?.total, body?.count, body?.data?.total, body?.data?.count];
  for (const candidate of candidates) {
    const value = numeric(candidate);
    if (value !== null) return value;
  }
  const data = asArray(body);
  return data.length;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPlaceholder(value) {
  if (!hasText(value)) return false;
  return /\b(todo|placeholder|unknown|null|undefined|lorem ipsum|test data)\b/i.test(value);
}

function endpoint(path, params = {}) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

/**
 * Request JSON from the API.
 * opts.allowEmpty: if true, a 503 (game data not loaded) is treated as a
 * warning instead of a failure. Useful in environments without imported game
 * data (CI without extraction step, staging).
 */
async function requestJson(name, path, params = {}, opts = {}) {
  const url = endpoint(path, params);
  const started = performance.now();
  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/json',
        ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
        ...(adminApiKey ? { 'x-api-key': adminApiKey } : {}),
      },
    });
  } catch (error) {
    fail(`${name}: request failed`, { url: String(url), error: error.message });
    return null;
  }

  const durationMs = Math.round(performance.now() - started);
  const contentType = response.headers.get('content-type') ?? '';
  let body = null;
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch (error) {
      fail(`${name}: invalid JSON response`, { url: String(url), status: response.status, error: error.message });
      return null;
    }
  } else {
    const text = await response.text();
    fail(`${name}: expected JSON`, { url: String(url), status: response.status, contentType, text: text.slice(0, 160) });
    return null;
  }

  if (response.status === 503 && opts.allowEmpty) {
    warn(`${name}: 503 game data not loaded — skipped`, { url: String(url) });
    return null;
  }

  if (!response.ok) {
    fail(`${name}: HTTP ${response.status}`, { url: String(url), body });
    return null;
  }

  fact(`${name}: OK`, { status: response.status, durationMs, url: String(url) });
  return body;
}

function validateList(name, body, options = {}) {
  if (!isObject(body)) {
    fail(`${name}: response is not an object`, body);
    return [];
  }
  if (body.success !== undefined && body.success !== true) fail(`${name}: success is not true`, body);

  const data = asArray(body);
  const total = getTotal(body);
  samples[name] = { total, sample: data[0] ?? null };

  if (strict && total === 0) fail(`${name}: strict mode expected non-empty data`);
  if (!strict && total === 0) warn(`${name}: no data returned`);
  if (options.minTotal !== undefined && total < options.minTotal) {
    const issue = `${name}: total ${total} is below expected ${options.minTotal}`;
    strict ? fail(issue) : warn(issue);
  }
  if (!Array.isArray(data)) fail(`${name}: data is not an array`, body);

  if (data.length > 0 && options.requiredFields) {
    for (const field of options.requiredFields) {
      if (!hasText(data[0]?.[field]) && data[0]?.[field] == null) fail(`${name}: first item misses field "${field}"`, data[0]);
    }
  }

  if (data.length > 0) {
    const textFields = Object.entries(data[0]).filter(([, value]) => typeof value === 'string');
    for (const [field, value] of textFields) {
      if (hasPlaceholder(value)) warn(`${name}: suspicious placeholder-like value in "${field}"`, { value });
    }
  }

  return data;
}

function validateNonNegativeNumbers(name, item, fields) {
  for (const field of fields) {
    if (item?.[field] == null) continue;
    const value = numeric(item[field]);
    if (value === null) {
      warn(`${name}: "${field}" is not numeric`, { value: item[field] });
    } else if (value < 0) {
      fail(`${name}: "${field}" is negative`, { value });
    }
  }
}

function validateUnique(name, rows, field) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const value = row?.[field];
    if (!value) continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  if (duplicates.size > 0) fail(`${name}: duplicate "${field}" values`, [...duplicates].slice(0, 10));
}

async function audit() {
  console.log(`STARVIS data audit\nbase-url: ${baseUrl}\nenv: ${env}\nstrict: ${strict}\n`);

  await requestJson('health live', '/health/live');
  await requestJson('health ready', '/health/ready');

  const version = await requestJson('version', '/api/v1/version', { env });
  if (version?.data) {
    if (!/^\d+\.\d+(\.\d+)?/.test(String(version.data.game_version ?? ''))) {
      warn('version: game_version does not look like a Star Citizen public version', version.data);
    }
    if (version.data.extracted_at && Number.isNaN(Date.parse(version.data.extracted_at))) {
      fail('version: extracted_at is not a valid date', version.data);
    }
  }

  const stats = await requestJson('stats overview', '/api/v1/stats/overview', { env });
  if (stats?.data) {
    for (const key of ['ships', 'components', 'items', 'commodities']) {
      const value = numeric(stats.data[key]);
      if (value === null) warn(`stats overview: "${key}" is missing or not numeric`, stats.data);
      else if (value < 0) fail(`stats overview: "${key}" is negative`, stats.data);
      else if (strict && value === 0) fail(`stats overview: "${key}" is empty in strict mode`, stats.data);
    }
  }

  const ships = validateList('ships', await requestJson('ships', '/api/v1/ships', { env, limit: 10 }), {
    minTotal: 50,
    requiredFields: ['uuid', 'name'],
  });
  validateUnique('ships', ships, 'uuid');
  if (ships[0])
    validateNonNegativeNumbers('ships first item', ships[0], ['crew_size', 'cargo_capacity', 'scm_speed', 'max_speed', 'total_hp']);

  const shipId = ships[0]?.uuid;
  if (shipId) {
    const detail = await requestJson('ship detail', `/api/v1/ships/${encodeURIComponent(shipId)}`, { env });
    const ship = detail?.data ?? detail;
    if (!hasText(ship?.name)) fail('ship detail: missing name', ship);
    validateNonNegativeNumbers('ship detail', ship, ['crew_size', 'cargo_capacity', 'scm_speed', 'max_speed', 'total_hp']);
    await requestJson('ship stats', `/api/v1/ships/${encodeURIComponent(shipId)}/stats`, { env });
    await requestJson('ship loadout', `/api/v1/ships/${encodeURIComponent(shipId)}/loadout`, { env });
  }

  const components = validateList('components', await requestJson('components', '/api/v1/components', { env, limit: 10 }), {
    minTotal: 100,
    requiredFields: ['uuid', 'name', 'type'],
  });
  validateUnique('components', components, 'uuid');
  if (components[0]) validateNonNegativeNumbers('components first item', components[0], ['size', 'mass', 'power_draw']);

  const items = validateList('items', await requestJson('items', '/api/v1/items', { env, limit: 10 }), {
    minTotal: 100,
    requiredFields: ['uuid', 'name', 'type'],
  });
  validateUnique('items', items, 'uuid');

  const commodities = validateList('commodities', await requestJson('commodities', '/api/v1/commodities', { env, limit: 10 }), {
    minTotal: 10,
    requiredFields: ['uuid', 'name'],
  });
  validateUnique('commodities', commodities, 'uuid');

  validateList('manufacturers', await requestJson('manufacturers', '/api/v1/manufacturers', { env }), {
    minTotal: 5,
    requiredFields: ['code', 'name'],
  });

  validateList('ship matrix', await requestJson('ship matrix', '/api/v1/ship-matrix', { limit: 10 }), {
    minTotal: 50,
  });

  validateList('galactapedia', await requestJson('galactapedia', '/api/v1/galactapedia', { limit: 10 }), {
    minTotal: 10,
  });

  validateList('starmap systems', await requestJson('starmap systems', '/api/v1/starmap/systems', { limit: 10 }), {
    minTotal: 1,
  });

  const search = await requestJson('search aurora', '/api/v1/search', { env, search: 'aurora' });
  const searchTotal = ['ships', 'components', 'items', 'commodities', 'missions', 'recipes']
    .map((key) => asArray(search?.data?.[key] ?? search?.[key]).length)
    .reduce((a, b) => a + b, 0);
  if (strict && searchTotal === 0) fail('search aurora: no result in strict mode', search);
  if (!strict && searchTotal === 0) warn('search aurora: no result', search);

  // ── Missions ────────────────────────────────────────────────────────────

  validateList(
    'missions',
    await requestJson('missions', '/api/v1/missions', { env, limit: 10 }, { allowEmpty: true }),
    { requiredFields: ['uuid'] },
  );

  const missionFilters = await requestJson('missions/filters', '/api/v1/missions/filters', { env }, { allowEmpty: true });
  if (missionFilters && (!isObject(missionFilters) || missionFilters.success !== true)) {
    fail('missions/filters: unexpected shape', missionFilters);
  }

  // ── Factions ─────────────────────────────────────────────────────────────

  const factions = await requestJson('factions', '/api/v1/factions', { env }, { allowEmpty: true });
  if (factions) {
    const data = asArray(factions);
    if (strict && data.length === 0) fail('factions: no data in strict mode');
    if (!strict && data.length === 0) warn('factions: no faction data returned');
  }

  validateList(
    'factions/registry',
    await requestJson('factions/registry', '/api/v1/factions/registry', { env, limit: 10 }, { allowEmpty: true }),
    {},
  );

  validateList(
    'factions/reputation-standings',
    await requestJson(
      'factions/reputation-standings',
      '/api/v1/factions/reputation-standings',
      { env, limit: 10 },
      { allowEmpty: true },
    ),
    {},
  );

  validateList(
    'factions/reputation-scopes',
    await requestJson(
      'factions/reputation-scopes',
      '/api/v1/factions/reputation-scopes',
      { env, limit: 10 },
      { allowEmpty: true },
    ),
    {},
  );

  // ── Paints ────────────────────────────────────────────────────────────────

  validateList(
    'paints',
    await requestJson('paints', '/api/v1/paints', { env: undefined, limit: 10 }, { allowEmpty: true }),
    {},
  );

  // ── Shops ─────────────────────────────────────────────────────────────────

  const shops = await requestJson('shops', '/api/v1/shops', { env, limit: 10 }, { allowEmpty: true });
  if (shops) {
    const data = asArray(shops);
    if (strict && data.length === 0) fail('shops: no data in strict mode');
    const shop = data[0];
    if (shop) {
      if (!shop.id && !shop.name) warn('shops first item: missing id and name', shop);
    }
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  validateList(
    'locations',
    await requestJson('locations', '/api/v1/locations', { env, limit: 10 }, { allowEmpty: true }),
    { requiredFields: ['uuid'] },
  );

  // ── Mining ────────────────────────────────────────────────────────────────

  const miningElements = await requestJson('mining/elements', '/api/v1/mining/elements', { env }, { allowEmpty: true });
  if (miningElements) {
    const data = asArray(miningElements);
    if (strict && data.length === 0) fail('mining/elements: no data in strict mode');
    const el = data[0];
    if (el) validateNonNegativeNumbers('mining first element', el, ['percentage', 'threshold', 'resistance']);
  }

  await requestJson('mining/compositions', '/api/v1/mining/compositions', { env }, { allowEmpty: true });

  // ── Crafting ──────────────────────────────────────────────────────────────

  validateList(
    'crafting/recipes',
    await requestJson('crafting/recipes', '/api/v1/crafting/recipes', { env, limit: 10 }, { allowEmpty: true }),
    {},
  );

  await requestJson('crafting/resources', '/api/v1/crafting/resources', { env }, { allowEmpty: true });

  // ── Trade ─────────────────────────────────────────────────────────────────

  const tradeLocations = await requestJson('trade/locations', '/api/v1/trade/locations', { env }, { allowEmpty: true });
  if (tradeLocations) {
    const data = asArray(tradeLocations);
    if (strict && data.length === 0) fail('trade/locations: no data in strict mode');
  }

  // ── Changelog & version ───────────────────────────────────────────────────

  const changelog = await requestJson('changelog/summary', '/api/v1/changelog/summary', { env }, { allowEmpty: true });
  if (changelog && !Array.isArray(asArray(changelog))) {
    warn('changelog/summary: unexpected shape', changelog);
  }

  await requestJson('game-versions', '/api/v1/game-versions', { env }, { allowEmpty: true });

  const report = {
    baseUrl,
    env,
    strict,
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    facts,
    warnings,
    failures,
    samples,
  };

  if (output) {
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\nReport written to ${output}`);
  }

  console.log(`\nFacts: ${facts.length}`);
  console.log(`Warnings: ${warnings.length}`);
  for (const item of warnings) console.warn(`WARN ${item.message}`);
  console.log(`Failures: ${failures.length}`);
  for (const item of failures) console.error(`FAIL ${item.message}`);

  if (failures.length > 0) process.exit(1);
}

audit().catch((error) => {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  console.error(`Unexpected audit failure from ${scriptDir}:`, error);
  process.exit(1);
});
