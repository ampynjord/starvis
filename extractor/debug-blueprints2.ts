#!/usr/bin/env node
/**
 * Debug — deep inspect of a CraftingBlueprintRecord to understand refs
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

  // 1. Build category map: UUID → category name
  const catRecords = df.searchByStructType('BlueprintCategoryRecord', 100);
  const categoryMap = new Map<string, string>();
  for (const c of catRecords) {
    const catName = (c.name as string).replace('BlueprintCategoryRecord.', '');
    categoryMap.set(c.uuid, catName);
  }
  console.log('=== Category map ===');
  for (const [uuid, name] of categoryMap) console.log(`  ${uuid} → ${name}`);

  // 2. Read one blueprint at higher depth
  const blueprints = df.searchByStructType('CraftingBlueprintRecord', 600);
  console.log(`\nTotal blueprints: ${blueprints.length}`);

  // Pick a weapon and an armor
  const weapon = blueprints.find((b) => b.name?.includes('volt_sniper'));
  const armor = blueprints.find((b) => b.name?.includes('armor_heavy_core'));
  const dismantle = blueprints.find((b) => b.name?.includes('GlobalGenericDismantle'));

  for (const bp of [weapon, armor, dismantle].filter(Boolean)) {
    console.log(`\n\n========== ${bp!.name} ==========`);
    const data = df.readRecordByGuid(bp!.uuid, 10) as Record<string, unknown>;
    const blueprint = data?.blueprint as Record<string, unknown>;

    if (!blueprint) {
      console.log('No blueprint data');
      continue;
    }

    // Category
    const catRef = (blueprint.category as Record<string, unknown>)?.__ref as string;
    console.log(`Category ref: ${catRef} → ${categoryMap.get(catRef) ?? 'UNKNOWN'}`);

    // Blueprint name
    console.log(`Blueprint name: ${blueprint.blueprintName}`);

    // Process type & entity class (output item)
    const processData = blueprint.processSpecificData as Record<string, unknown>;
    if (processData) {
      console.log(`Process type: ${processData.__type}`);
      const entityRef = (processData.entityClass as Record<string, unknown>)?.__ref as string;
      if (entityRef) {
        console.log(`Entity class ref: ${entityRef}`);
        // Try to resolve entity
        const entity = df.readRecordByGuid(entityRef, 2);
        if (entity) {
          const entityObj = entity as Record<string, unknown>;
          console.log(`Entity class_name: ${entityObj.className ?? entityObj.__name ?? 'unknown'}`);
          console.log(`Entity type: ${entityObj.__type}`);
          // Try to find displayName
          const comp = entityObj.Components as Record<string, unknown>;
          console.log(`Entity keys: ${Object.keys(entityObj).join(', ')}`);
        }
      }
    }

    // Tiers
    const tiers = blueprint.tiers as Array<Record<string, unknown>>;
    if (tiers) {
      console.log(`Tiers: ${tiers.length}`);
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const recipe = tier.recipe as Record<string, unknown>;
        if (!recipe) continue;
        const costs = recipe.costs as Record<string, unknown>;
        if (!costs) continue;

        // Craft time
        const craftTime = costs.craftTime as Record<string, unknown>;
        if (craftTime) {
          const totalSeconds =
            ((craftTime.days as number) || 0) * 86400 +
            ((craftTime.hours as number) || 0) * 3600 +
            ((craftTime.minutes as number) || 0) * 60 +
            ((craftTime.seconds as number) || 0);
          console.log(`  Tier ${i}: craftTime = ${totalSeconds}s (${craftTime.minutes}m${craftTime.seconds}s)`);
        }

        // Mandatory cost
        const mandatoryCost = costs.mandatoryCost as Record<string, unknown>;
        if (mandatoryCost) {
          console.log(`  Tier ${i}: mandatoryCost type=${mandatoryCost.__type}, count=${mandatoryCost.count}`);
          const options = mandatoryCost.options as Array<Record<string, unknown>>;
          if (options) {
            console.log(`  Tier ${i}: ${options.length} cost options`);
            for (let j = 0; j < Math.min(options.length, 3); j++) {
              console.log(`    Option ${j}: ${JSON.stringify(options[j], null, 2).slice(0, 500)}`);
            }
          }
        }

        // Optional costs
        const optionalCosts = costs.optionalCosts as Array<unknown>;
        if (optionalCosts?.length) {
          console.log(`  Tier ${i}: ${optionalCosts.length} optional costs`);
        }
      }
    }
  }

  // 3. Count by category - for all BP_CRAFT records
  const bpCraft = blueprints.filter((b) => b.name?.includes('BP_CRAFT'));
  const catCounts = new Map<string, number>();
  for (const bp of bpCraft) {
    const data = df.readRecordByGuid(bp.uuid, 4) as Record<string, unknown>;
    const blueprint = data?.blueprint as Record<string, unknown>;
    const catRef = (blueprint?.category as Record<string, unknown>)?.__ref as string;
    const catName = categoryMap.get(catRef) ?? 'Unknown';
    catCounts.set(catName, (catCounts.get(catName) ?? 0) + 1);
  }
  console.log('\n\n=== Blueprints by category ===');
  for (const [cat, cnt] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${cnt}`);
  }

  // 4. Try to resolve a few entity class refs to get item names
  console.log('\n\n=== Sample entity resolutions ===');
  for (const bp of bpCraft.slice(0, 10)) {
    const data = df.readRecordByGuid(bp.uuid, 4) as Record<string, unknown>;
    const blueprint = data?.blueprint as Record<string, unknown>;
    const processData = blueprint?.processSpecificData as Record<string, unknown>;
    const entityRef = (processData?.entityClass as Record<string, unknown>)?.__ref as string;
    if (entityRef) {
      const entity = df.readRecordByGuid(entityRef, 1);
      const entityObj = entity as Record<string, unknown>;
      const bpName = (bp.name as string).replace('CraftingBlueprintRecord.', '');
      console.log(`  ${bpName} → entity: ${entityObj?.__type ?? 'null'} | keys: ${entityObj ? Object.keys(entityObj).join(',') : 'none'}`);
    }
  }

  await df.close();
}

main().catch(console.error);
