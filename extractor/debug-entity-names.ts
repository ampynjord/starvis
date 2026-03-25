#!/usr/bin/env node
/**
 * Debug — resolve entity names from CraftingBlueprint entityClass refs
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(import.meta.dirname, '..', '.env.extractor') });

import { DataForgeService } from './src/dataforge-service.js';
import { LocalizationService } from './src/localization-service.js';

const P4K = 'C:/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k';

async function main() {
  const df = new DataForgeService(P4K);
  await df.init();
  await df.loadDataForge();

  // Load localization
  const locService = new LocalizationService(df);
  await locService.load();
  console.log(`Localization loaded: ${locService.isLoaded}`);

  // Get a few weapons and armor blueprints
  const blueprints = df.searchByStructType('CraftingBlueprintRecord', 600);
  const samples = [
    blueprints.find((b) => b.name?.includes('volt_sniper_energy_01')),
    blueprints.find((b) => b.name?.includes('behr_pistol_ballistic_01')),
    blueprints.find((b) => b.name?.includes('slaver_armor_heavy_core')),
    blueprints.find((b) => b.name?.includes('cds_undersuit_helmet')),
    blueprints.find((b) => b.name?.includes('grin_utility_medium_backpack_02')),
  ].filter(Boolean);

  for (const bp of samples) {
    const data = df.readRecordByGuid(bp!.uuid, 5) as Record<string, unknown>;
    const blueprint = data?.blueprint as Record<string, unknown>;
    const processData = blueprint?.processSpecificData as Record<string, unknown>;
    const entityRef = (processData?.entityClass as Record<string, unknown>)?.__ref as string;
    
    console.log(`\n=== ${bp!.name} ===`);
    
    if (entityRef) {
      // Try readRecordByGuid with deeper depth to get SAttachableComponentParams
      const entity = df.readRecordByGuid(entityRef, 4) as Record<string, unknown>;
      if (entity) {
        // Check StaticEntityClassData for class_name
        const staticData = entity.StaticEntityClassData as Record<string, unknown>;
        if (staticData) {
          console.log(`  StaticEntityClassData keys: ${Object.keys(staticData).join(', ')}`);
        }
        
        // Check Components for SAttachableComponentParams
        const components = entity.Components as Record<string, unknown>;
        if (components) {
          console.log(`  Components keys: ${Object.keys(components).join(', ')}`);
          // Look for localization/display name in components
          for (const [key, val] of Object.entries(components)) {
            if (typeof val === 'object' && val !== null) {
              const comp = val as Record<string, unknown>;
              if (comp.AttachDef || comp.Localization || comp.displayName || comp.Name) {
                console.log(`  Component ${key}: ${JSON.stringify(val, null, 2).slice(0, 500)}`);
              }
            }
          }
        }
      }
      
      // Try findEntityRecord to get the record name
      // The entity UUID corresponds to a record in dfData.records
      const allRecords = df.searchRecords('', 200000);
      const entityRecord = allRecords.find((r: any) => r.uuid === entityRef);
      if (entityRecord) {
        console.log(`  Entity record name: ${entityRecord.name}`);
        console.log(`  Entity record fileName: ${entityRecord.fileName}`);
      } else {
        // Try the GUID index directly
        console.log(`  Entity ref: ${entityRef} (could not find in searchRecords)`);
      }
    }
  }

  await df.close();
}

main().catch(console.error);
