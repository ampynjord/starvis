/**
 * Probe script 2: inspecte la structure des records missions, mining, crafting
 * Usage: npx tsx scripts/probe-records.ts --p4k "C:\...\Data.p4k"
 */
import 'dotenv/config';
import { DataForgeService } from '../src/dataforge-service.js';

const p4kPath = process.argv[process.argv.indexOf('--p4k') + 1] || process.env.P4K_PATH;
if (!p4kPath) { console.error('--p4k required'); process.exit(1); }

const ctx = new DataForgeService(p4kPath);
await ctx.init();
await ctx.loadDataForge();

function probeFirst(structType: string, samples = 3) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${structType} (first ${samples}) ===`);
  const records = ctx.searchByStructType(`^${structType}$`, samples);
  for (const r of records) {
    try {
      const data = ctx.readRecordByGuid(r.uuid, 4);
      console.log(`  [${r.name}]  ${r.fileName}`);
      console.log('  ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n  ').slice(0, 3000));
    } catch (e: any) {
      console.log(`  [${r.name}] ERROR: ${e.message}`);
    }
  }
}

// Missions
probeFirst('MissionBrokerEntry', 2);
probeFirst('ContractTemplate', 2);
probeFirst('MissionType', 3);
probeFirst('MissionOrganization', 2);

// Mining
probeFirst('MineableElement', 2);
probeFirst('MineableComposition', 2);
probeFirst('HarvestablePreset', 2);

// Crafting
probeFirst('LegacyCraftingRecipeDefRecord', 2);

console.log('\nDone.');
process.exit(0);
