/**
 * Tests complets de l'API StarAPI v1.0
 * Vérifie tous les endpoints publics et admin
 *
 * Usage: node tests/test-all.mjs [base_url]
 * Exemple: node tests/test-all.mjs http://localhost:3003
 */

const BASE = (process.argv[2] || 'http://localhost:3003').replace(/\/$/, '');
const API = `${BASE}/api/v1`;
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'starapi_admin_2024';

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
};

const stats = { total: 0, passed: 0, failed: 0 };

function section(title) {
  console.log(`\n${C.blue}${'='.repeat(60)}${C.reset}`);
  console.log(`${C.blue}  ${title}${C.reset}`);
  console.log(`${C.blue}${'='.repeat(60)}${C.reset}\n`);
}

function info(msg) { console.log(`${C.cyan}   ℹ️  ${msg}${C.reset}`); }

async function test(name, fn) {
  stats.total++;
  try {
    await fn();
    stats.passed++;
    console.log(`${C.green}  ✅ ${name}${C.reset}`);
  } catch (e) {
    stats.failed++;
    console.log(`${C.red}  ❌ ${name}${C.reset}`);
    console.log(`${C.red}     → ${e.message}${C.reset}`);
  }
}

async function get(path, headers = {}) {
  const res = await fetch(`${API}${path}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ============================================================================
section('🏥 HEALTH & ROOT');

await test('GET / - API info', async () => {
  const res = await fetch(BASE);
  const data = await res.json();
  assert(data.name === 'Starapi', 'Missing API name');
  assert(data.endpoints, 'Missing endpoints list');
});

await test('GET /health - Health check', async () => {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  assert(data.status === 'ok', `Expected status ok, got ${data.status}`);
  assert(data.database === 'connected', 'Database not connected');
});

// ============================================================================
section('📋 SHIP MATRIX (RSI)');

await test('GET /ship-matrix - List all', async () => {
  const data = await get('/ship-matrix');
  assert(data.success, 'Request failed');
  assert(Array.isArray(data.data), 'Expected array');
  assert(data.count >= 200, `Too few ships: ${data.count}`);
  info(`${data.count} ships, source: ${data.meta?.source}`);
});

await test('GET /ship-matrix?search=aurora - Search', async () => {
  const data = await get('/ship-matrix?search=aurora');
  assert(data.success && data.count > 0, 'No Auroras found');
  info(`${data.count} Aurora variants`);
});

await test('GET /ship-matrix/stats - Stats', async () => {
  const data = await get('/ship-matrix/stats');
  assert(data.success, 'Request failed');
  assert(data.data.total >= 200, `Low total: ${data.data.total}`);
  info(`Total: ${data.data.total}`);
});

await test('GET /ship-matrix/:id - By ID', async () => {
  const data = await get('/ship-matrix/1');
  assert(data.success && data.data, 'Ship not found');
  info(`ID 1: ${data.data.name}`);
});

await test('GET /ship-matrix/invalid - 404', async () => {
  const res = await fetch(`${API}/ship-matrix/999999`);
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

// ============================================================================
section('🚀 SHIPS (Game Data)');

let shipUuid = null;
await test('GET /ships - List all', async () => {
  const data = await get('/ships');
  assert(data.success, 'Request failed');
  assert(data.count >= 400, `Too few ships: ${data.count}`);
  shipUuid = data.data[0]?.uuid;
  info(`${data.count} ships from ${data.meta?.source}`);
});

await test('GET /ships?manufacturer=AEGS - Filter by manufacturer', async () => {
  const data = await get('/ships?manufacturer=AEGS');
  assert(data.success && data.count > 0, 'No AEGS ships');
  assert(data.data.every(s => s.manufacturer_code === 'AEGS'), 'Wrong manufacturer in results');
  info(`${data.count} Aegis ships`);
});

await test('GET /ships?search=gladius - Search', async () => {
  const data = await get('/ships?search=gladius');
  assert(data.success && data.count > 0, 'No Gladius results');
  info(`${data.count} matches for "gladius"`);
});

await test('GET /ships?sort=mass&order=desc - Sort', async () => {
  const data = await get('/ships?sort=mass&order=desc');
  assert(data.success, 'Request failed');
  const masses = data.data.filter(s => s.mass).map(s => Number(s.mass));
  for (let i = 1; i < Math.min(masses.length, 10); i++) {
    assert(masses[i] <= masses[i - 1], 'Not sorted desc by mass');
  }
});

await test('GET /ships/:uuid - By UUID', async () => {
  assert(shipUuid, 'No UUID from previous test');
  const data = await get(`/ships/${shipUuid}`);
  assert(data.success && data.data.uuid === shipUuid, 'Ship not found');
  info(`${data.data.name} (${data.data.class_name})`);
});

await test('GET /ships/:class_name - By class_name', async () => {
  const data = await get('/ships/AEGS_Gladius');
  assert(data.success && data.data, 'Gladius not found');
  assert(data.data.class_name === 'AEGS_Gladius', 'Wrong class_name');
  info(`${data.data.name}, mass=${data.data.mass}`);
});

await test('GET /ships/:uuid/loadout - Ship loadout', async () => {
  assert(shipUuid, 'No UUID from previous test');
  const data = await get(`/ships/${shipUuid}/loadout`);
  assert(data.success && Array.isArray(data.data), 'Invalid loadout response');
  const totalPorts = data.data.reduce((sum, p) => sum + 1 + (p.children?.length || 0), 0);
  info(`${data.data.length} root ports, ${totalPorts} total`);
});

await test('GET /ships/AEGS_Gladius/loadout - Loadout by class_name', async () => {
  const data = await get('/ships/AEGS_Gladius/loadout');
  assert(data.success && data.data.length > 0, 'No loadout for Gladius');
  info(`${data.data.length} root ports`);
});

await test('GET /ships/invalid-uuid - 404', async () => {
  const res = await fetch(`${API}/ships/00000000-0000-0000-0000-000000000000`);
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

// ============================================================================
section('🔧 COMPONENTS');

await test('GET /components - List all', async () => {
  const data = await get('/components');
  assert(data.success && data.count >= 1000, `Too few: ${data.count}`);
  info(`${data.count} components`);
});

await test('GET /components?type=WeaponGun - Filter by type', async () => {
  const data = await get('/components?type=WeaponGun');
  assert(data.success && data.count > 0, 'No weapons');
  assert(data.data.every(c => c.type === 'WeaponGun'), 'Wrong type in results');
  info(`${data.count} weapons`);
});

await test('GET /components?type=WeaponGun&size=3 - Filter type+size', async () => {
  const data = await get('/components?type=WeaponGun&size=3');
  assert(data.success && data.count > 0, 'No S3 weapons');
  info(`${data.count} S3 weapons`);
});

await test('GET /components?sort=weapon_dps&order=desc - Sort by DPS', async () => {
  const data = await get('/components?type=WeaponGun&sort=weapon_dps&order=desc');
  assert(data.success, 'Request failed');
  const dpsList = data.data.filter(c => c.weapon_dps).map(c => Number(c.weapon_dps));
  for (let i = 1; i < Math.min(dpsList.length, 10); i++) {
    assert(dpsList[i] <= dpsList[i - 1], 'Not sorted desc by DPS');
  }
});

await test('GET /components/:uuid - By UUID', async () => {
  const list = await get('/components?type=Shield');
  assert(list.data.length > 0, 'No shields');
  const uuid = list.data[0].uuid;
  const data = await get(`/components/${uuid}`);
  assert(data.success && data.data.uuid === uuid, 'Component not found');
  info(`${data.data.name} (${data.data.type} S${data.data.size})`);
});

await test('GET /components/invalid - 404', async () => {
  const res = await fetch(`${API}/components/00000000-0000-0000-0000-000000000000`);
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

// ============================================================================
section('🏭 MANUFACTURERS');

await test('GET /manufacturers - List all', async () => {
  const data = await get('/manufacturers');
  assert(data.success && data.count >= 20, `Too few: ${data.count}`);
  info(`${data.count} manufacturers`);
});

// ============================================================================
section('🔐 ADMIN ENDPOINTS');

await test('POST /admin/sync-ship-matrix - Without auth → 401', async () => {
  const res = await fetch(`${BASE}/admin/sync-ship-matrix`, { method: 'POST' });
  assert(res.status === 401, `Expected 401, got ${res.status}`);
});

await test('GET /admin/stats - With auth', async () => {
  const res = await fetch(`${BASE}/admin/stats`, {
    headers: { 'X-API-Key': ADMIN_KEY },
  });
  assert(res.ok, `HTTP ${res.status}`);
  const data = await res.json();
  assert(data.success, 'Request failed');
  const sm = data.data.shipMatrix;
  const gd = data.data.gameData;
  info(`SM: ${sm?.total} | Ships: ${gd?.ships} | Comps: ${gd?.components} | Mfg: ${gd?.manufacturers}`);
  info(`Loadout ports: ${gd?.loadoutPorts} | SM linked: ${gd?.shipsLinkedToMatrix}`);
});

// ============================================================================
section('📊 DATA INTEGRITY');

await test('Most ships have manufacturer codes', async () => {
  const data = await get('/ships');
  const missing = data.data.filter(s => !s.manufacturer_code);
  assert(missing.length < 100, `Too many ships without manufacturer_code: ${missing.length}`);
  info(`${data.count - missing.length}/${data.count} ships have manufacturer codes`);
});

await test('Cross-reference Ship Matrix ≥ 180 linked', async () => {
  const res = await fetch(`${BASE}/admin/stats`, {
    headers: { 'X-API-Key': ADMIN_KEY },
  });
  const data = await res.json();
  const linked = data.data.gameData?.shipsLinkedToMatrix || 0;
  const total = data.data.shipMatrix?.total || 0;
  assert(linked >= 180, `Too few linked: ${linked}/${total}`);
  info(`${linked}/${total} ships linked to Ship Matrix`);
});

// ============================================================================
// RESULTS
console.log(`\n${C.blue}${'='.repeat(60)}${C.reset}`);
console.log(`${C.blue}  📈 RESULTS${C.reset}`);
console.log(`${C.blue}${'='.repeat(60)}${C.reset}\n`);
console.log(`${C.green}  ✅ Passed:  ${stats.passed}${C.reset}`);
console.log(`${C.red}  ❌ Failed:  ${stats.failed}${C.reset}`);
console.log(`${C.cyan}  📊 Total:   ${stats.total}${C.reset}`);
const rate = ((stats.passed / stats.total) * 100).toFixed(1);
console.log(`\n  Success rate: ${rate}%\n`);

if (stats.failed > 0) {
  console.log(`${C.red}  ⚠️  Some tests failed!${C.reset}\n`);
  process.exit(1);
} else {
  console.log(`${C.green}  🎉 All tests passed!${C.reset}\n`);
  process.exit(0);
}
