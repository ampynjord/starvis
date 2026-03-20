/**
 * Probe ContractTemplate (missions) + HarvestablePreset (resources)
 */
import 'dotenv/config';
import { DataForgeService } from '../../src/dataforge-service.js';

const p4kPath = process.argv[process.argv.indexOf('--p4k') + 1] || process.env.P4K_PATH;
if (!p4kPath) {
  console.error('--p4k required');
  process.exit(1);
}

const ctx = new DataForgeService(p4kPath);
await ctx.init();
await ctx.loadDataForge();

function probe(structType: string, samples = 4) {
  const all = ctx.searchByStructType(`^${structType}$`, 99999);
  if (!all.length) {
    console.log(`\n${structType}: NOT FOUND`);
    return;
  }
  console.log(`\n${'='.repeat(60)}\n=== ${structType}: ${all.length} total ===`);
  for (const r of all.slice(0, samples)) {
    try {
      const data = ctx.readRecordByGuid(r.uuid, 4);
      console.log(`\n  [${r.name}]`);
      console.log(`  ${JSON.stringify(data, null, 2).replace(/\n/g, '\n  ').slice(0, 1200)}`);
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
}

probe('ContractTemplate', 3);
probe('HarvestablePreset', 3);
