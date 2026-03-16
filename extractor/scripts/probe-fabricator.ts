import 'dotenv/config';
import { DataForgeService } from '../src/dataforge-service.js';

const p4k = process.argv[process.argv.indexOf('--p4k') + 1] || process.env.P4K_PATH;
if (!p4k) { console.error('--p4k required'); process.exit(1); }

const ctx = new DataForgeService(p4k);
await ctx.init();
await ctx.loadDataForge();

const structs = [
  'LegacyCraftingRecipeDefRecord',
  'HarvestablePreset',
  'HarvestableEntityRecord',
  'CraftingBlueprintRecord',
];

for (const s of structs) {
  const records = ctx.searchByStructType(`^${s}$`, 3);
  if (!records.length) { console.log(`\n${s}: NOT FOUND`); continue; }
  const total = ctx.searchByStructType(`^${s}$`, 99999).length;
  console.log(`\n=== ${s}: ${total} records total ===`);
  for (const r of records) {
    try {
      const data = ctx.readRecordByGuid(r.uuid, 4);
      console.log(`  [${r.name}]`);
      console.log('  ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n  ').slice(0, 800));
    } catch (e: any) {
      console.log(`  [${r.name}] ERROR: ${e.message}`);
    }
  }
}
