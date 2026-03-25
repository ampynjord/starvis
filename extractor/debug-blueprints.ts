#!/usr/bin/env node
/**
 * Debug script — inspect CraftingBlueprint record structure in PTU DataForge
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(import.meta.dirname, '..', '.env.extractor') });

import { DataForgeService } from './src/dataforge-service.js';

const P4K = 'C:/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k';

async function main() {
  const df = new DataForgeService(P4K);
  await df.init();
  await df.loadDataForge();

  // 1. Look at CraftingBlueprint struct properties
  console.log('=== CraftingBlueprint struct properties ===');
  df.debugStructProperties('CraftingBlueprint');

  console.log('\n=== CraftingBlueprintRecord struct properties ===');
  df.debugStructProperties('CraftingBlueprintRecord');

  // 2. Read a few blueprint records in detail
  const blueprints = df.searchByStructType('CraftingBlueprintRecord', 500);
  console.log(`\nTotal CraftingBlueprintRecord: ${blueprints.length}`);

  // Show all unique names
  console.log('\n=== All Blueprint names ===');
  for (const bp of blueprints) {
    console.log(`  ${bp.name || bp.fileName} [${bp.structType}]`);
  }

  // Read a few records with full data
  const samples = blueprints.filter((b) => /BP_CRAFT/.test(b.name)).slice(0, 5);
  console.log('\n=== Sample BP_CRAFT records (full data) ===');
  for (const bp of samples) {
    console.log(`\n--- ${bp.name} ---`);
    const data = df.readRecordByGuid(bp.uuid, 6);
    console.log(JSON.stringify(data, null, 2));
  }

  // 3. Also check BlueprintCategoryRecord
  console.log('\n\n=== BlueprintCategoryRecord records ===');
  const cats = df.searchByStructType('BlueprintCategoryRecord', 100);
  for (const c of cats) {
    const data = df.readRecordByGuid(c.uuid, 4);
    console.log(`\n--- ${c.name} ---`);
    console.log(JSON.stringify(data, null, 2));
  }

  // 4. CraftingGlobalParams
  console.log('\n\n=== CraftingGlobalParams ===');
  const globalParams = df.searchByStructType('CraftingGlobalParams', 5);
  for (const gp of globalParams) {
    const data = df.readRecordByGuid(gp.uuid, 4);
    console.log(JSON.stringify(data, null, 2));
  }

  await df.close();
}

main().catch(console.error);
