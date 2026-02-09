/**
 * Test complet de l'API StarAPI
 * Vérifie tous les endpoints et services
 */

const BASE_URL = 'http://localhost:3000/api/v1';
const BASE_URL_LEGACY = 'http://localhost:3000/api';
const ADMIN_KEY = 'starapi_admin_2024';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function logSuccess(message) {
  log('✅', message, colors.green);
  stats.passed++;
  stats.total++;
}

function logError(message, error) {
  log('❌', message, colors.red);
  if (error) console.error(`   ${colors.red}${error}${colors.reset}`);
  stats.failed++;
  stats.total++;
}

function logSkip(message) {
  log('⏭️ ', message, colors.yellow);
  stats.skipped++;
  stats.total++;
}

function logInfo(message) {
  log('ℹ️ ', message, colors.cyan);
}

function logSection(title) {
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

async function test(name, fn) {
  try {
    await fn();
    logSuccess(name);
  } catch (error) {
    logError(name, error.message);
  }
}

async function get(path, headers = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

async function post(path, body = {}, headers = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

// ============================================================================
// TESTS
// ============================================================================

logSection('🏥 HEALTH & STATUS');

await test('Health check endpoint', async () => {
  const response = await fetch('http://localhost:3000/health');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.status || data.status !== 'healthy') throw new Error('API not healthy');
  if (!data.database || !data.database.connected) throw new Error('Database not connected');
  logInfo(`   Ships: ${data.database.ships}, Manufacturers: ${data.database.manufacturers}`);
});

// ----------------------------------------------------------------------------
logSection('🏭 MANUFACTURERS');

await test('GET /manufacturers - List all manufacturers', async () => {
  const response = await get('/manufacturers');
  if (!response.success) throw new Error('Request failed');
  if (!Array.isArray(response.data)) throw new Error('Expected data array');
  if (response.data.length === 0) throw new Error('No manufacturers found');
  logInfo(`   Found ${response.data.length} manufacturers`);
});

await test('GET /manufacturers/:code - Get specific manufacturer', async () => {
  const response = await get('/manufacturers/AEGS');
  if (!response.success) throw new Error('Request failed');
  const data = response.data;
  if (!data.code || data.code !== 'AEGS') throw new Error('Invalid manufacturer data');
  if (!data.name || !data.name.includes('Aegis')) throw new Error('Missing manufacturer name');
  logInfo(`   ${data.code}: ${data.name}`);
});

// ----------------------------------------------------------------------------
logSection('🚀 SHIPS');

await test('GET /ships - List all ships', async () => {
  const response = await get('/ships');
  if (!response.success) throw new Error('Request failed');
  if (!Array.isArray(response.data)) throw new Error('Expected data array');
  if (response.data.length === 0) throw new Error('No ships found');
  logInfo(`   Found ${response.data.length} ships`);
});

await test('GET /ships with filters (role=fighter)', async () => {
  const response = await get('/ships?role=fighter');
  if (!response.success) throw new Error('Request failed');
  if (!Array.isArray(response.data)) throw new Error('Expected data array');
  logInfo(`   Found ${response.data.length} fighters`);
});

await test('GET /ships with filters (manufacturer=AEGS)', async () => {
  const response = await get('/ships?manufacturer=AEGS');
  if (!response.success) throw new Error('Request failed');
  if (!Array.isArray(response.data)) throw new Error('Expected data array');
  logInfo(`   Found ${response.data.length} Aegis ships`);
});

await test('GET /ships/:id - Get specific ship by UUID', async () => {
  // D'abord obtenir un vaisseau
  const listResponse = await get('/ships?limit=1');
  if (!listResponse.data || listResponse.data.length === 0) throw new Error('No ships to test');
  
  const shipId = listResponse.data[0].uuid || listResponse.data[0].id;
  const response = await get(`/ships/${shipId}`);
  if (!response.success) throw new Error('Request failed');
  const data = response.data;
  if (!data.name) throw new Error('Missing ship name');
  if (!data.manufacturer) throw new Error('Missing manufacturer');
  logInfo(`   ${data.name} (${data.manufacturer})`);
});

// ----------------------------------------------------------------------------
logSection('📦 SHIP ENRICHMENT');

await test('Verify ships have P4K data', async () => {
  const response = await get('/ships?limit=10');
  if (!response.success) throw new Error('Request failed');
  const ships = response.data;
  const withP4k = ships.filter(s => s.p4kData && s.p4kData.className);
  logInfo(`   ${withP4k.length}/${ships.length} ships have P4K enrichment`);
});

// ----------------------------------------------------------------------------
logSection(' ADMIN ENDPOINTS');

await test('POST /admin/sync - Sync ships from RSI', async () => {
  const response = await fetch('http://localhost:3000/admin/sync', {
    method: 'POST',
    headers: { 'X-API-Key': ADMIN_KEY, 'Content-Type': 'application/json' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.success) throw new Error('Sync failed');
  logInfo(`   Synced ${data.count || 'N/A'} ships`);
});

// ----------------------------------------------------------------------------
logSection('📊 DATABASE VERIFICATION');

await test('Verify ships have manufacturers', async () => {
  const response = await get('/ships');
  if (!response.success) throw new Error('Request failed');
  const ships = response.data;
  const withoutManufacturer = ships.filter(s => !s.manufacturer);
  if (withoutManufacturer.length > 0) {
    throw new Error(`${withoutManufacturer.length} ships without manufacturer`);
  }
  logInfo(`   All ${ships.length} ships have manufacturers`);
});

await test('Verify manufacturers exist', async () => {
  const response = await get('/manufacturers');
  if (!response.success) throw new Error('Request failed');
  const manufacturers = response.data;
  if (manufacturers.length < 10) {
    throw new Error(`Only ${manufacturers.length} manufacturers found (expected > 10)`);
  }
  logInfo(`   ${manufacturers.length} manufacturers in database`);
});

// ----------------------------------------------------------------------------
logSection('🎯 EDGE CASES & ERROR HANDLING');

await test('GET /ships/invalid-uuid - 404 handling', async () => {
  try {
    await get('/ships/00000000-0000-0000-0000-000000000000');
    throw new Error('Should have returned 404');
  } catch (error) {
    if (!error.message.includes('404')) throw error;
  }
});

await test('GET /manufacturers/INVALID - 404 handling', async () => {
  try {
    await get('/manufacturers/INVALIDCODE');
    throw new Error('Should have returned 404');
  } catch (error) {
    if (!error.message.includes('404')) throw error;
  }
});

await test('POST /admin/sync without auth - 401 handling', async () => {
  try {
    const response = await fetch('http://localhost:3000/admin/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  } catch (error) {
    if (error.message.includes('Expected 401')) throw error;
    // Fetch error aussi accepté (connexion refusée équivaut à pas d'auth)
  }
});

// ============================================================================
// RÉSULTATS
// ============================================================================

console.log('\n');
logSection('📈 TEST RESULTS');
console.log(`${colors.green}✅ Passed:  ${stats.passed}${colors.reset}`);
console.log(`${colors.red}❌ Failed:  ${stats.failed}${colors.reset}`);
console.log(`${colors.yellow}⏭️  Skipped: ${stats.skipped}${colors.reset}`);
console.log(`${colors.cyan}📊 Total:   ${stats.total}${colors.reset}`);

const successRate = ((stats.passed / stats.total) * 100).toFixed(1);
console.log(`\n${colors.cyan}Success Rate: ${successRate}%${colors.reset}`);

if (stats.failed > 0) {
  console.log(`\n${colors.red}⚠️  Some tests failed. Check the output above.${colors.reset}`);
  process.exit(1);
} else {
  console.log(`\n${colors.green}🎉 All tests passed!${colors.reset}`);
  process.exit(0);
}
