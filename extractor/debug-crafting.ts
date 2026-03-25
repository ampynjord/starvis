#!/usr/bin/env node
/**
 * Debug script — discover crafting-related struct types in PTU DataForge
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

  // 1. All struct types containing craft/recipe/production/forge/workshop
  const allStructs = df.getStructTypes();
  const craftRelated = allStructs.filter((s) =>
    /craft|recipe|production|cooking|refin|pharm|workshop|bench|forge|blueprint/i.test(s),
  );
  console.log('=== Craft-related struct types ===');
  for (const s of craftRelated) {
    const recs = df.searchByStructType(s, 500);
    console.log(`  ${s}: ${recs.length} records`);
    // Show first 3 record names
    for (const r of recs.slice(0, 3)) {
      console.log(`    - ${r.name || r.fileName}`);
    }
  }

  // 2. Records with "craft" in name/filename
  console.log('\n=== Records with "craft" in name ===');
  const craftRecords = df.searchRecords('craft', 500);
  const structMap = new Map<string, { count: number; samples: string[] }>();
  for (const r of craftRecords) {
    if (!structMap.has(r.structType)) structMap.set(r.structType, { count: 0, samples: [] });
    const entry = structMap.get(r.structType)!;
    entry.count++;
    if (entry.samples.length < 3) entry.samples.push(r.name || r.fileName);
  }
  for (const [st, info] of structMap) {
    console.log(`  ${st}: ${info.count} records`);
    for (const s of info.samples) console.log(`    - ${s}`);
  }

  // 3. Records with "recipe" in name/filename
  console.log('\n=== Records with "recipe" in name ===');
  const recipeRecords = df.searchRecords('recipe', 500);
  const recipeMap = new Map<string, { count: number; samples: string[] }>();
  for (const r of recipeRecords) {
    if (!recipeMap.has(r.structType)) recipeMap.set(r.structType, { count: 0, samples: [] });
    const entry = recipeMap.get(r.structType)!;
    entry.count++;
    if (entry.samples.length < 5) entry.samples.push(r.name || r.fileName);
  }
  for (const [st, info] of recipeMap) {
    console.log(`  ${st}: ${info.count} records`);
    for (const s of info.samples) console.log(`    - ${s}`);
  }

  // 4. Search for armor/weapon specifically
  console.log('\n=== Records with "armor" in name ===');
  const armorRecords = df.searchRecords('armor.*craft|craft.*armor', 100);
  console.log(`  Found ${armorRecords.length} records`);
  for (const r of armorRecords.slice(0, 10)) {
    console.log(`    [${r.structType}] ${r.name || r.fileName}`);
  }

  console.log('\n=== Records with "weapon" + "craft" in name ===');
  const weaponRecords = df.searchRecords('weapon.*craft|craft.*weapon', 100);
  console.log(`  Found ${weaponRecords.length} records`);
  for (const r of weaponRecords.slice(0, 10)) {
    console.log(`    [${r.structType}] ${r.name || r.fileName}`);
  }

  // 5. Try broader search for personal crafting
  console.log('\n=== Struct types with "Personal" ===');
  const personalStructs = allStructs.filter((s) => /personal/i.test(s));
  for (const s of personalStructs) {
    const recs = df.searchByStructType(s, 100);
    console.log(`  ${s}: ${recs.length} records`);
    for (const r of recs.slice(0, 5)) {
      console.log(`    - ${r.name || r.fileName}`);
    }
  }

  await df.close();
}

main().catch(console.error);
