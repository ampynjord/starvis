/**
 * Probe script: liste tous les noms de structs DataForge et cherche
 * les structs liés aux missions, blueprints et ressources minables.
 * Usage: npx tsx scripts/probe-structs.ts --p4k "C:\...\Data.p4k"
 */
import { config } from 'dotenv';
config({ path: '.env.extractor' });
import { DataForgeService } from '../../src/dataforge-service.js';

const p4kPath = process.argv[process.argv.indexOf('--p4k') + 1] || process.env.P4K_PATH;
if (!p4kPath) {
  console.error('--p4k required');
  process.exit(1);
}

const SEARCH_PATTERNS = [
  /mission/i,
  /blueprint/i,
  /craft/i,
  /recipe/i,
  /harvestable/i,
  /mineable/i,
  /refinery/i,
  /buyable/i,
  /quest/i,
  /contract/i,
  /fabricat/i,
  /schematic/i,
];

const ctx = new DataForgeService(p4kPath);
console.log('Initializing DataForge…');
await ctx.init();
console.log('Loading DataForge…');
await ctx.loadDataForge();
console.log('Ready.');

const allNames = ctx.getStructTypes();
console.log(`\nTotal structs: ${allNames.length}`);

// Find all matching structs
const matches = allNames.filter((n) => SEARCH_PATTERNS.some((p) => p.test(n)));
console.log(`\n=== Structs matching patterns (${matches.length}) ===`);
for (const m of matches.sort()) {
  const count = ctx.searchByStructType(`^${m}$`, 9999).length;
  console.log(`  ${count.toString().padStart(5)}  ${m}`);
}

// Also list all unique struct names by prefix
console.log('\n=== All structs by prefix ===');
const prefixes = ['Mission', 'Blueprint', 'SBlue', 'SCraft', 'SHarv', 'SMineable', 'SRefinery', 'SFab'];
for (const prefix of prefixes) {
  const hits = allNames.filter((n) => n.startsWith(prefix));
  if (hits.length) console.log(`  ${prefix}*: ${hits.slice(0, 20).join(', ')}`);
}

// Top 40 struct types by record count
console.log('\n=== Top 40 struct types by record count ===');
const top40 = allNames
  .map((n) => ({ name: n, count: ctx.searchByStructType(`^${n}$`, 99999).length }))
  .filter((x) => x.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 40);
for (const { name, count } of top40) {
  console.log(`  ${count.toString().padStart(6)}  ${name}`);
}

console.log('\nDone.');
process.exit(0);
