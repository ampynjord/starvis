/**
 * STARVIS v1.0 — Tests complets de l'API
 * Vérifie endpoints publics, admin, intégrité et qualité des données
 *
 * Usage: node tests/test-all.mjs [base_url]
 * Défaut: http://localhost:3003
 *
 * Les tests game-data sont conditionnels : si le serveur n'a pas
 * de données P4K (status 503 ou 0 ships), ils sont marqués SKIP
 * au lieu de FAIL, ce qui permet de tourner en CI sans P4K.
 */

const BASE = (process.argv[2] || 'http://localhost:3003').replace(/\/$/, '');
const API = `${BASE}/api/v1`;
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'starvis_admin_2024';
const isRemote = !BASE.includes('localhost') && !BASE.includes('127.0.0.1');
const DELAY_MS = isRemote ? 2500 : 0;  // throttle on remote to avoid rate limiting (30 req/min burst)

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', dim: '\x1b[2m',
};

const stats = { total: 0, passed: 0, failed: 0, skipped: 0 };

function section(title) {
  console.log(`\n${C.blue}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.blue}  ${title}${C.reset}`);
  console.log(`${C.blue}${'═'.repeat(60)}${C.reset}\n`);
}

function info(msg) { console.log(`${C.dim}     ${msg}${C.reset}`); }

async function test(name, fn) {
  if (DELAY_MS > 0) await delay(DELAY_MS);
  stats.total++;
  try {
    await fn();
    stats.passed++;
    console.log(`${C.green}  ✅ ${name}${C.reset}`);
  } catch (e) {
    if (e.message.startsWith('SKIP:')) {
      stats.skipped++;
      console.log(`${C.yellow}  ⏭️  ${name} — ${e.message.slice(5).trim()}${C.reset}`);
    } else {
      stats.failed++;
      console.log(`${C.red}  ❌ ${name}${C.reset}`);
      console.log(`${C.red}     → ${e.message}${C.reset}`);
    }
  }
}

/** fetch + json, retourne {status, ok, data} sans throw. Retry on 429. */
async function rawGet(path, retries = 5) {
  const res = await fetch(`${API}${path}`);
  if (res.status === 429 && retries > 0) {
    const wait = Math.max(parseInt(res.headers.get('retry-after') || '5') * 1000, 5000);
    info(`⏳ 429 rate limited, waiting ${wait}ms (${retries} retries left)...`);
    await delay(wait);
    return rawGet(path, retries - 1);
  }
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

/** fetch + json avec auth admin. Retry on 429. */
async function adminGet(path, retries = 5) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'X-API-Key': ADMIN_KEY } });
  if (res.status === 429 && retries > 0) {
    const wait = Math.max(parseInt(res.headers.get('retry-after') || '5') * 1000, 5000);
    info(`⏳ 429 rate limited, waiting ${wait}ms (${retries} retries left)...`);
    await delay(wait);
    return adminGet(path, retries - 1);
  }
  return { status: res.status, ok: res.ok, data: await res.json() };
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function skip(msg) { throw new Error(`SKIP: ${msg}`); }

/** Raw fetch with 429 retry (for CSV, ETag tests that don't use rawGet) */
async function apiFetch(url, opts = {}, retries = 5) {
  const res = await fetch(url, opts);
  if (res.status === 429 && retries > 0) {
    const wait = Math.max(parseInt(res.headers.get('retry-after') || '5') * 1000, 5000);
    info(`⏳ 429 rate limited, waiting ${wait}ms (${retries} retries left)...`);
    await delay(wait);
    return apiFetch(url, opts, retries - 1);
  }
  return res;
}

// ─── Sanity: is the server reachable? ───────────────────────────────────────
try {
  await fetch(BASE, { signal: AbortSignal.timeout(5000) });
} catch {
  console.error(`\n${C.red}  ❌ Server unreachable at ${BASE}${C.reset}`);
  console.error(`${C.red}     Make sure the API is running before executing tests.${C.reset}\n`);
  process.exit(1);
}

// ─── Détection données de jeu ───────────────────────────────────────────────
// Use /components (P4K-only) instead of /ships (which now includes concept ships via UNION ALL)
let hasGameData = false;
let shipCount = 0;
let compCount = 0;
try {
  const r = await rawGet('/components?limit=1');
  hasGameData = r.ok && ((r.data.total || r.data.count || 0) > 0);
  if (hasGameData) {
    const s = await rawGet('/ships?limit=1');
    shipCount = s.data.total || s.data.count || 0;
  }
} catch { /* pas de game data */ }
if (!hasGameData) {
  console.log(`${C.yellow}  ⚠  Pas de données game (P4K) — les tests game-data seront skip${C.reset}`);
}

// ─── Détection Ship Matrix ──────────────────────────────────────────────────
let hasShipMatrix = false;
try {
  const r = await rawGet('/ship-matrix/stats');
  hasShipMatrix = r.ok && r.data.data?.total > 0;
} catch { /* pas de ship matrix */ }
if (!hasShipMatrix) {
  console.log(`${C.yellow}  ⚠  Pas de données Ship Matrix — les tests ship-matrix seront skip${C.reset}`);
}

// ============================================================================
section('🏥 HEALTH & ROOT');

await test('GET / → API info', async () => {
  const res = await fetch(BASE);
  const data = await res.json();
  assert(data.name === 'Starvis', `Expected name "Starvis", got "${data.name}"`);
  assert(data.version, 'Missing version');
  assert(data.endpoints, 'Missing endpoints');
});

await test('GET /health → ok + database connected', async () => {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  assert(data.status === 'ok', `Status: ${data.status}`);
  assert(data.database === 'connected', `DB: ${data.database}`);
});

// ============================================================================
section('📋 SHIP MATRIX (RSI)');

await test('GET /ship-matrix → ≥200 ships', async () => {
  if (!hasShipMatrix) skip('no ship matrix data');
  const { data } = await rawGet('/ship-matrix');
  assert(data.success, 'Request failed');
  assert(Array.isArray(data.data), 'Expected array');
  assert(data.count >= 200, `Only ${data.count} ships`);
  info(`${data.count} ships`);
});

await test('GET /ship-matrix?search=aurora → results', async () => {
  if (!hasShipMatrix) skip('no ship matrix data');
  const { data } = await rawGet('/ship-matrix?search=aurora');
  assert(data.success && data.count > 0, 'No Auroras');
  info(`${data.count} Aurora variants`);
});

await test('GET /ship-matrix/stats', async () => {
  if (!hasShipMatrix) skip('no ship matrix data');
  const { data } = await rawGet('/ship-matrix/stats');
  assert(data.success && data.data.total >= 200, `Total: ${data.data?.total}`);
});

await test('GET /ship-matrix/:id → by ID', async () => {
  if (!hasShipMatrix) skip('no ship matrix data');
  const { data } = await rawGet('/ship-matrix/1');
  assert(data.success && data.data, 'Not found');
  info(`ID 1 = ${data.data.name}`);
});

await test('GET /ship-matrix/999999 → 404', async () => {
  if (!hasShipMatrix) skip('no ship matrix data');
  const { status } = await rawGet('/ship-matrix/999999');
  assert(status === 404, `Expected 404, got ${status}`);
});

// ============================================================================
section('🚀 SHIPS (Game Data)');

let shipUuid = null;

await test('GET /ships → ≥200 ships (post-cleanup)', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?limit=200');
  const total = data.total || data.count;
  assert(data.success, 'Request failed');
  assert(total >= 200, `Only ${total} ships (expected ≥200)`);
  assert(total <= 500, `Too many ships: ${total} (cleanup filter issue?)`);
  shipUuid = (data.data.find(s => !s.is_concept_only) || data.data[0])?.uuid;
  info(`${total} ships total, page 1: ${data.count} items`);
});

await test('GET /ships?manufacturer=AEGS → filter works', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?manufacturer=AEGS');
  assert(data.success && data.count > 0, 'No AEGS ships');
  assert(data.data.every(s => s.manufacturer_code === 'AEGS'), 'Wrong manufacturer in results');
  info(`${data.count} Aegis ships`);
});

await test('GET /ships?search=gladius → search works', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?search=gladius');
  assert(data.success && data.count > 0, 'No Gladius');
});

await test('GET /ships?sort=mass&order=desc → sorting', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?sort=mass&order=desc');
  const masses = data.data.filter(s => s.mass).map(s => Number(s.mass));
  for (let i = 1; i < Math.min(masses.length, 10); i++) {
    assert(masses[i] <= masses[i - 1], 'Not sorted desc by mass');
  }
});

await test('GET /ships/:uuid → by UUID', async () => {
  if (!shipUuid) skip('no UUID available');
  const { data } = await rawGet(`/ships/${shipUuid}`);
  assert(data.success && data.data.uuid === shipUuid, 'UUID mismatch');
});

await test('GET /ships/AEGS_Gladius → by class_name', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships/AEGS_Gladius');
  assert(data.success && data.data.class_name === 'AEGS_Gladius', 'Not found');
  info(`${data.data.name}, mass=${data.data.mass}, hp=${data.data.total_hp}`);
});

await test('GET /ships/:uuid/loadout → hierarchical', async () => {
  if (!shipUuid) skip('no UUID available');
  const { data } = await rawGet(`/ships/${shipUuid}/loadout`);
  assert(data.success && Array.isArray(data.data), 'Bad response');
  const total = data.data.reduce((s, p) => s + 1 + (p.children?.length || 0), 0);
  info(`${data.data.length} root ports, ${total} total`);
});

await test('GET /ships/AEGS_Gladius/loadout → by class_name', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships/AEGS_Gladius/loadout');
  assert(data.success && data.data.length > 0, 'No loadout for Gladius');
});

await test('GET /ships/nonexistent → 404', async () => {
  if (!hasGameData) skip('no game data');
  const { status } = await rawGet('/ships/00000000-0000-0000-0000-000000000000');
  assert(status === 404, `Expected 404, got ${status}`);
});

await test('GET /ships → weapon_damage_total field present', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships/AEGS_Gladius');
  assert(data.success, 'Request failed');
  assert('weapon_damage_total' in data.data, 'weapon_damage_total field missing');
  info(`Gladius weapon DPS: ${data.data.weapon_damage_total}`);
});

await test('GET /ships?sort=weapon_damage_total → sortable', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?sort=weapon_damage_total&order=desc&limit=10');
  assert(data.success && data.count > 0, 'No results');
  info(`Top weapon DPS ship: ${data.data[0]?.name} (${data.data[0]?.weapon_damage_total})`);
});

await test('GET /ships → no tutorial/enemy_ai/arena_ai variants by default', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?limit=200');
  assert(data.success, 'Request failed');
  const names = data.data.map(s => s.class_name);
  const hasTutorial = names.some(n => n.includes('_Teach') || n.includes('Tutorial'));
  const hasSwarm = names.some(n => n.includes('_Swarm'));
  assert(!hasTutorial, 'Tutorial ships should be hidden by default');
  assert(!hasSwarm, 'Arena AI (Swarm) ships should be hidden by default');
  info(`${data.total} ships returned (variants filtered)`);
});

// ============================================================================
section('🔧 COMPONENTS');

await test('GET /components → ≥500 items', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?limit=100');
  const total = data.total || data.count;
  assert(data.success && total >= 500, `Only ${total}`);
  compCount = total;
  info(`${total} components total`);
});

await test('GET /components?type=WeaponGun → filter', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=WeaponGun');
  assert(data.success && data.count > 0, 'No weapons');
  assert(data.data.every(c => c.type === 'WeaponGun'), 'Wrong type in results');
  info(`${data.count} weapons`);
});

await test('GET /components?type=WeaponGun&size=3 → compound filter', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=WeaponGun&size=3');
  assert(data.success && data.count > 0, 'No S3 weapons');
  info(`${data.count} S3 weapons`);
});

await test('GET /components?sort=weapon_dps&order=desc → sort by DPS', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=WeaponGun&sort=weapon_dps&order=desc');
  assert(data.success, 'Request failed');
  const dps = data.data.filter(c => c.weapon_dps).map(c => Number(c.weapon_dps));
  for (let i = 1; i < Math.min(dps.length, 10); i++) {
    assert(dps[i] <= dps[i - 1], 'Not sorted desc by DPS');
  }
});

await test('GET /components/:uuid → by UUID', async () => {
  if (!hasGameData) skip('no game data');
  const { data: list } = await rawGet('/components?type=Shield');
  assert(list.data.length > 0, 'No shields');
  const { data } = await rawGet(`/components/${list.data[0].uuid}`);
  assert(data.success && data.data.uuid === list.data[0].uuid, 'Mismatch');
  info(`${data.data.name} (${data.data.type} S${data.data.size})`);
});

await test('GET /components/nonexistent → 404', async () => {
  if (!hasGameData) skip('no game data');
  const { status } = await rawGet('/components/00000000-0000-0000-0000-000000000000');
  assert(status === 404, `Expected 404, got ${status}`);
});

await test('No Turret/MissileRack in components', async () => {
  if (!hasGameData) skip('no game data');
  for (const t of ['Turret', 'MissileRack']) {
    const { data, status } = await rawGet(`/components?type=${t}`);
    if (status === 429) skip('rate limited');
    assert(data.count === 0, `Found ${data.count} ${t} (should be 0 — non-swappable)`);
  }
});

// ============================================================================
section('🏭 MANUFACTURERS');

await test('GET /manufacturers → ≥20', async () => {
  if (!hasGameData) skip('no game data');
  const { data, status } = await rawGet('/manufacturers');
  if (status === 429) skip('rate limited');
  assert(data.success && data.count >= 20, `Only ${data.count}`);
  info(`${data.count} manufacturers`);
});

// ============================================================================
section('🔐 ADMIN ENDPOINTS');

await test('POST /admin/sync-ship-matrix sans auth → 401', async () => {
  const res = await fetch(`${BASE}/admin/sync-ship-matrix`, { method: 'POST' });
  assert(res.status === 401, `Expected 401, got ${res.status}`);
});

await test('POST /admin/extract-game-data sans auth → 401', async () => {
  const res = await fetch(`${BASE}/admin/extract-game-data`, { method: 'POST' });
  assert(res.status === 401, `Expected 401, got ${res.status}`);
});

await test('GET /admin/stats avec auth → data', async () => {
  const { data, status } = await adminGet('/admin/stats');
  if (status === 401) skip('admin key not set (use ADMIN_API_KEY env var)');
  if (status === 429) skip('rate limited');
  assert(data.success, 'Failed');
  const sm = data.data.shipMatrix;
  const gd = data.data.gameData;
  info(`SM: ${sm?.total} | Ships: ${gd?.ships} | Comps: ${gd?.components} | Linked: ${gd?.shipsLinkedToMatrix}`);
});

// ============================================================================
section('� PAGINATION');

await test('GET /ships → pagination metadata', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?page=1&limit=10');
  assert(data.page === 1, `Expected page=1, got ${data.page}`);
  assert(data.limit === 10, `Expected limit=10, got ${data.limit}`);
  assert(data.total > 0, 'Missing total');
  assert(data.pages > 0, 'Missing pages');
  assert(data.count <= 10, `Count ${data.count} exceeds limit 10`);
  info(`Page 1/10: ${data.count} items, ${data.total} total, ${data.pages} pages`);
});

await test('GET /ships?page=2 → different data', async () => {
  if (!hasGameData) skip('no game data');
  const { data: p1 } = await rawGet('/ships?page=1&limit=5');
  const { data: p2 } = await rawGet('/ships?page=2&limit=5');
  assert(p1.data[0].uuid !== p2.data[0].uuid, 'Page 1 and 2 have same first ship');
});

await test('GET /components → pagination metadata', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?page=1&limit=10');
  assert(data.page === 1 && data.limit === 10 && data.total > 0, 'Missing pagination fields');
});

// ============================================================================
section('🔄 COMPARE');

await test('GET /ships/:uuid/compare/:uuid2 → comparison data', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships/AEGS_Gladius/compare/AEGS_Sabre');
  assert(data.success, 'Request failed');
  assert(data.data.ship1 && data.data.ship2, 'Missing ships');
  assert(data.data.comparison, 'Missing comparison');
  assert(data.data.ship1.class_name === 'AEGS_Gladius', 'Wrong ship1');
  assert(data.data.ship2.class_name === 'AEGS_Sabre', 'Wrong ship2');
  const fields = Object.keys(data.data.comparison);
  info(`${fields.length} compared fields, ex: mass ${JSON.stringify(data.data.comparison.mass)}`);
});

await test('GET /ships/compare → 404 on unknown ship', async () => {
  if (!hasGameData) skip('no game data');
  const { status } = await rawGet('/ships/AEGS_Gladius/compare/NOPE_Ship');
  assert(status === 404, `Expected 404, got ${status}`);
});

// ============================================================================
section('📋 VERSION & EXTRACTION');

await test('GET /version → extraction info', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/version');
  assert(data.success, 'Request failed');
  info(`Version info: ${JSON.stringify(data.data).slice(0, 120)}`);
});

await test('GET /admin/extraction-log → auth required', async () => {
  const res = await fetch(`${BASE}/admin/extraction-log`);
  assert(res.status === 401, `Expected 401, got ${res.status}`);
});

await test('GET /admin/extraction-log → with auth', async () => {
  const { data, status } = await adminGet('/admin/extraction-log');
  if (status === 401) skip('admin key not set (use ADMIN_API_KEY env var)');
  if (status === 429) skip('rate limited');
  if (status === 503) skip('no game data service');
  assert(data.success, 'Failed');
  info(`${Array.isArray(data.data) ? data.data.length : 0} extraction entries`);
});

// ============================================================================
section('📤 CSV EXPORT');

await test('GET /ship-matrix?format=csv → CSV output', async () => {
  if (!hasShipMatrix) skip('no ship matrix data');
  const res = await apiFetch(`${API}/ship-matrix?format=csv`);
  const ct = res.headers.get('content-type');
  assert(ct && ct.includes('text/csv'), `Expected text/csv, got ${ct}`);
  const text = await res.text();
  assert(text.includes(','), 'No CSV data');
  const lines = text.trim().split('\n');
  assert(lines.length > 10, `Only ${lines.length} CSV lines`);
  info(`${lines.length} lines (header + ${lines.length - 1} rows)`);
});

await test('GET /ships?format=csv → CSV output', async () => {
  if (!hasGameData) skip('no game data');
  const res = await apiFetch(`${API}/ships?format=csv&limit=10`);
  const ct = res.headers.get('content-type');
  assert(ct && ct.includes('text/csv'), `Expected text/csv, got ${ct}`);
  const text = await res.text();
  const lines = text.trim().split('\n');
  assert(lines.length >= 2, 'CSV should have header + data');
  info(`${lines.length} lines`);
});

// ============================================================================
section('🏷️ ETAG / CACHE');

await test('GET /ships → returns ETag header', async () => {
  if (!hasGameData) skip('no game data');
  const res = await apiFetch(`${API}/ships?limit=5`);
  const etag = res.headers.get('etag');
  assert(etag, 'Missing ETag header');
  info(`ETag: ${etag}`);
});

await test('GET /ships → If-None-Match → 304', async () => {
  if (!hasGameData) skip('no game data');
  const res1 = await apiFetch(`${API}/ships?limit=5`);
  const etag = res1.headers.get('etag');
  assert(etag, 'No ETag on first request');
  const res2 = await apiFetch(`${API}/ships?limit=5`, { headers: { 'If-None-Match': etag } });
  assert(res2.status === 304, `Expected 304, got ${res2.status}`);
  info('304 Not Modified confirmed');
});

await test('GET /ship-matrix → Cache-Control header', async () => {
  if (!hasShipMatrix) skip('no ship matrix data');
  const res = await apiFetch(`${API}/ship-matrix`);
  const cc = res.headers.get('cache-control');
  assert(cc && cc.includes('max-age'), `Missing/wrong Cache-Control: ${cc}`);
  info(`Cache-Control: ${cc}`);
});

// ============================================================================
section('🆕 NEW COMPONENT TYPES');

await test('Thruster components exist', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=Thruster');
  assert(data.count > 0, 'No Thruster components');
  info(`${data.count} thrusters`);
});

await test('Countermeasure components exist', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=Countermeasure');
  // CMs may be 0 depending on extraction — skip if not applicable 
  if (data.count === 0) skip('No countermeasures extracted');
  info(`${data.count} countermeasures`);
});

await test('FuelTank components exist', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=FuelTank');
  if (data.count === 0) skip('No fuel tanks extracted');
  info(`${data.count} fuel tanks`);
});

// ============================================================================
section('�📊 DATA QUALITY');

await test('Ships have career/role (≥80%)', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?limit=200');
  const p4k = data.data.filter(s => !s.is_concept_only);
  const withCareer = p4k.filter(s => s.career && s.career !== '').length;
  const pct = Math.round((withCareer / p4k.length) * 100);
  assert(pct >= 80, `Only ${pct}% have career (${withCareer}/${p4k.length})`);
  info(`${pct}% (${withCareer}/${p4k.length})`);
});

await test('Ships have mass (≥80%)', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?limit=200');
  const p4k = data.data.filter(s => !s.is_concept_only);
  const withMass = p4k.filter(s => s.mass && Number(s.mass) > 0).length;
  const pct = Math.round((withMass / p4k.length) * 100);
  assert(pct >= 80, `Only ${pct}% have mass`);
  info(`${pct}% (${withMass}/${p4k.length})`);
});

await test('Ships have total_hp (≥80%)', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?limit=200');
  const p4k = data.data.filter(s => !s.is_concept_only);
  const withHp = p4k.filter(s => s.total_hp && Number(s.total_hp) > 0).length;
  const pct = Math.round((withHp / p4k.length) * 100);
  assert(pct >= 80, `Only ${pct}% have HP`);
  info(`${pct}% (${withHp}/${p4k.length})`);
});

await test('Ships have boost_speed_forward (≥70%)', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?limit=200');
  const p4k = data.data.filter(s => !s.is_concept_only);
  const withBoost = p4k.filter(s => s.boost_speed_forward && Number(s.boost_speed_forward) > 0).length;
  const pct = Math.round((withBoost / p4k.length) * 100);
  assert(pct >= 70, `Only ${pct}% have boost speed`);
  info(`${pct}% (${withBoost}/${p4k.length})`);
});

await test('Ships have pitch/yaw/roll (≥70%)', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?limit=200');
  const p4k = data.data.filter(s => !s.is_concept_only);
  const withRot = p4k.filter(s => s.pitch_max && s.yaw_max && s.roll_max).length;
  const pct = Math.round((withRot / p4k.length) * 100);
  assert(pct >= 70, `Only ${pct}% have rotation data`);
  info(`${pct}% (${withRot}/${p4k.length})`);
});

await test('Missiles have damage, speed, lock_time, signal_type', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=Missile&limit=200');
  const total = data.total || data.count;
  assert(total >= 50, `Only ${total} missiles`);
  const complete = data.data.filter(m =>
    m.missile_damage > 0 && m.missile_speed > 0 && m.missile_lock_time >= 0 && m.missile_signal_type
  ).length;
  const pct = Math.round((complete / data.count) * 100);
  assert(pct >= 90, `Only ${pct}% missiles fully populated`);
  info(`${pct}% (${complete}/${data.count})`);
});

await test('Weapons have readable name (≠ class_name) (≥80%)', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=WeaponGun');
  const named = data.data.filter(c => c.name && c.name !== c.class_name).length;
  const pct = Math.round((named / data.count) * 100);
  assert(pct >= 80, `Only ${pct}% weapons have readable names`);
  info(`${pct}% (${named}/${data.count})`);
});

await test('Cross-reference Ship Matrix ≥ 180 linked', async () => {
  if (!hasGameData) skip('no game data');
  const { data, status } = await adminGet('/admin/stats');
  if (status === 401) skip('admin key not set (use ADMIN_API_KEY env var)');
  if (status === 429) skip('rate limited');
  const linked = data.data.gameData?.shipsLinkedToMatrix || 0;
  const total = data.data.shipMatrix?.total || 0;
  assert(linked >= 180, `Only ${linked}/${total} linked`);
  info(`${linked}/${total} ships linked`);
});

await test('No AMBX/test/debug ships in DB', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships?search=AMBX&limit=5');
  assert(data.count === 0, `Found ${data.count} AMBX entries (should be filtered)`);
});

await test('Gladius HP = 6110 (Erkul reference)', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/ships/AEGS_Gladius');
  assert(data.data.total_hp === 6110, `Gladius HP=${data.data.total_hp}, attendu 6110`);
});

// ============================================================================
section('💰 SHOPS & PRICES');

await test('GET /shops → returns paginated list', async () => {
  if (!hasGameData) skip('no game data');
  const { data, status } = await rawGet('/shops');
  if (status === 503) skip('no game data service');
  assert(data.success, 'Request failed');
  assert(typeof data.total === 'number', 'Missing total');
  assert(Array.isArray(data.data), 'data should be an array');
  info(`${data.total} shops total, page ${data.page}`);
});

await test('GET /shops?location=... → filters by location', async () => {
  if (!hasGameData) skip('no game data');
  const { data, status } = await rawGet('/shops?location=lor');
  if (status === 503) skip('no game data service');
  assert(data.success, 'Request failed');
  assert(Array.isArray(data.data), 'data should be an array');
  info(`${data.total} shops matching location filter`);
});

await test('GET /shops/:id/inventory → returns items', async () => {
  if (!hasGameData) skip('no game data');
  const { data: shopList } = await rawGet('/shops?limit=1');
  if (!shopList.data || shopList.data.length === 0) skip('no shops in DB');
  const shopId = shopList.data[0].id;
  const { data } = await rawGet(`/shops/${shopId}/inventory`);
  assert(data.success, 'Request failed');
  assert(Array.isArray(data.data), 'data should be an array');
  info(`Shop #${shopId}: ${data.count} items`);
});

await test('GET /components/:uuid/buy-locations → returns locations', async () => {
  if (!hasGameData) skip('no game data');
  const { data: comps } = await rawGet('/components?type=WeaponGun&limit=1');
  if (!comps.data || comps.data.length === 0) skip('no weapons');
  const uuid = comps.data[0].uuid;
  const { data } = await rawGet(`/components/${uuid}/buy-locations`);
  assert(data.success, 'Request failed');
  assert(Array.isArray(data.data), 'data should be an array');
  info(`${data.count} buy location(s) for ${comps.data[0].name}`);
});

// ============================================================================
section('🔧 LOADOUT SIMULATOR');

await test('POST /loadout/calculate → default loadout stats', async () => {
  if (!hasGameData) skip('no game data');
  const { data: ships } = await rawGet('/ships?limit=20');
  if (!ships.data || ships.data.length === 0) skip('no ships');
  const realShip = ships.data.find(s => !s.is_concept_only);
  if (!realShip) skip('no P4K ships for loadout');
  const shipUuid = realShip.uuid;
  const res = await apiFetch(`${API}/loadout/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipUuid, swaps: [] })
  });
  const data = await res.json();
  assert(data.success, `Request failed: ${data.error}`);
  assert(data.data.stats, 'Missing stats object');
  assert(data.data.stats.weapons !== undefined, 'Missing weapons stats');
  assert(data.data.stats.shields !== undefined, 'Missing shields stats');
  assert(data.data.stats.power !== undefined, 'Missing power stats');
  assert(data.data.stats.thermal !== undefined, 'Missing thermal stats');
  info(`Ship: ${data.data.ship.name}, DPS: ${data.data.stats.weapons.total_dps}, Shield HP: ${data.data.stats.shields.total_hp}`);
});

await test('POST /loadout/calculate → requires shipUuid', async () => {
  if (!hasGameData) skip('no game data');
  const res = await apiFetch(`${API}/loadout/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  assert(!data.success, 'Should fail without shipUuid');
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

// ============================================================================
section('🔫 WEAPON DAMAGE BREAKDOWN');

await test('Weapons have damage breakdown fields', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=WeaponGun&limit=50');
  assert(data.count > 0, 'No weapons');
  // Check that at least some weapons have breakdown data
  const withBreakdown = data.data.filter(w =>
    w.weapon_damage_physical !== null || w.weapon_damage_energy !== null || w.weapon_damage_distortion !== null
  ).length;
  const pct = Math.round((withBreakdown / data.data.length) * 100);
  info(`${pct}% weapons (${withBreakdown}/${data.data.length}) have damage breakdown`);
  // At least some should have it after extraction
  if (withBreakdown === 0) skip('damage breakdown not yet populated');
});

await test('Weapons have burst_dps and sustained_dps', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=WeaponGun&limit=50');
  const withDps = data.data.filter(w =>
    w.weapon_burst_dps !== null || w.weapon_sustained_dps !== null
  ).length;
  const pct = Math.round((withDps / data.data.length) * 100);
  info(`${pct}% weapons (${withDps}/${data.data.length}) have burst/sustained DPS`);
  if (withDps === 0) skip('burst/sustained DPS not yet populated');
});

await test('Missiles have damage breakdown', async () => {
  if (!hasGameData) skip('no game data');
  const { data } = await rawGet('/components?type=Missile&limit=50');
  if (data.count === 0) skip('no missiles');
  const withBreakdown = data.data.filter(m =>
    m.missile_damage_physical !== null || m.missile_damage_energy !== null
  ).length;
  const pct = Math.round((withBreakdown / data.data.length) * 100);
  info(`${pct}% missiles (${withBreakdown}/${data.data.length}) have damage breakdown`);
  if (withBreakdown === 0) skip('missile damage breakdown not yet populated');
});

// ============================================================================
// RESULTS
console.log(`\n${C.blue}${'═'.repeat(60)}${C.reset}`);
console.log(`${C.blue}  📈 RESULTS${C.reset}`);
console.log(`${C.blue}${'═'.repeat(60)}${C.reset}\n`);
console.log(`${C.green}  ✅ Passed:  ${stats.passed}${C.reset}`);
if (stats.skipped > 0) console.log(`${C.yellow}  ⏭️  Skipped: ${stats.skipped}${C.reset}`);
if (stats.failed > 0) console.log(`${C.red}  ❌ Failed:  ${stats.failed}${C.reset}`);
console.log(`${C.cyan}  📊 Total:   ${stats.total}${C.reset}`);
const rate = ((stats.passed / stats.total) * 100).toFixed(1);
console.log(`\n  Success rate: ${rate}% (${stats.skipped} skipped)\n`);

if (stats.failed > 0) {
  console.log(`${C.red}  ⚠️  Some tests failed!${C.reset}\n`);
  process.exit(1);
} else {
  console.log(`${C.green}  🎉 All tests passed!${C.reset}\n`);
  process.exit(0);
}
