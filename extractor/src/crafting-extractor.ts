/**
 * CraftingExtractor — Crafting recipe records from DataForge
 *
 * Searches for crafting/recipe struct types in the game data.
 * SC crafting data uses struct types like:
 *   - PersonalCraftingRecipe / CraftingRecipeTemplate
 *   - EntityClassDefinition with crafting sub-params
 *
 * Since the struct types may change between patches, the extractor
 * probes multiple patterns and extracts whatever it finds.
 */
import type { DataForgeService } from './dataforge-service.js';
import logger from './logger.js';

export interface CraftingIngredientRecord {
  itemName: string;
  itemUuid: string | null;
  quantity: number;
  isOptional: boolean;
}

export interface CraftingRecipeRecord {
  uuid: string;
  className: string;
  name: string | null;
  category: string;
  outputItemName: string | null;
  outputItemUuid: string | null;
  outputQuantity: number;
  craftingTime: number | null;
  stationType: string | null;
  skillLevel: number | null;
  ingredients: CraftingIngredientRecord[];
}

// Struct type patterns to search for crafting data
const RECIPE_STRUCT_PATTERNS = [
  'CraftingRecipe',
  'PersonalCraftingRecipe',
  'CraftingTemplate',
  'ProductionRecipe',
  'CookingRecipe',
  'RefiningRecipe',
  'PharmacyRecipe',
];

// Category classification from class name
const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/food|cook|meal|bake|recipe_food/i, 'Food'],
  [/drink|beverage|brew|juice|tea|coffee/i, 'Drink'],
  [/medic|pharma|drug|stim|heal|aid|medipen/i, 'Medicine'],
  [/armor|helmet|torso|legs|arms|undersuit/i, 'Armor'],
  [/weapon|gun|rifle|pistol|knife|blade/i, 'Weapon'],
  [/ammo|magazine|round|cartridge/i, 'Ammunition'],
  [/component|module|circuit|chip/i, 'Component'],
  [/refin|smelt|process|alloy/i, 'Refining'],
  [/explosive|grenade|mine|bomb/i, 'Explosive'],
  [/tool|multitool|repair/i, 'Tool'],
];

function deriveCategory(className: string): string {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(className)) return category;
  }
  return 'Misc';
}

function safeString(val: unknown): string | null {
  if (typeof val === 'string' && val.length > 0) return val;
  return null;
}

function safeNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
  return null;
}

export function extractCraftingRecipes(
  ctx: DataForgeService,
  locService?: { resolveKey(key: string): string | null },
): CraftingRecipeRecord[] {
  const results: CraftingRecipeRecord[] = [];

  // Try each pattern until we find records
  for (const structPattern of RECIPE_STRUCT_PATTERNS) {
    const records = ctx.searchByStructType(structPattern, 10000);
    if (records.length === 0) continue;

    logger.info(`Found ${records.length} records matching struct pattern "${structPattern}"`);

    for (const r of records) {
      try {
        const data = ctx.readRecordByGuid(r.uuid, 5) as Record<string, unknown>;
        if (!data) continue;

        const className = r.name || r.fileName || '';
        const ingredients: CraftingIngredientRecord[] = [];

        // Try common property names for ingredients
        const ingredientArrays = [data.ingredients, data.inputItems, data.inputs, data.requiredItems, data.components, data.materials];

        for (const arr of ingredientArrays) {
          if (!Array.isArray(arr)) continue;
          for (const ing of arr) {
            if (typeof ing !== 'object' || ing === null) continue;
            const ingObj = ing as Record<string, unknown>;
            const itemName = safeString(ingObj.itemName) ?? safeString(ingObj.name) ?? safeString(ingObj.className) ?? 'Unknown';
            const itemUuid = safeString(ingObj.itemUuid) ?? safeString(ingObj.uuid) ?? safeString(ingObj.entityId) ?? null;
            const quantity = typeof ingObj.quantity === 'number' ? ingObj.quantity : typeof ingObj.count === 'number' ? ingObj.count : 1;
            const isOptional = !!(ingObj.isOptional || ingObj.optional);

            ingredients.push({ itemName, itemUuid, quantity, isOptional });
          }
          if (ingredients.length > 0) break; // Use first matching array
        }

        // Output item
        const output = (data.output ?? data.outputItem ?? data.result) as Record<string, unknown> | undefined;
        const outputItemName =
          safeString(output?.itemName) ?? safeString(output?.name) ?? safeString(data.outputItemName as unknown) ?? null;
        const outputItemUuid = safeString(output?.itemUuid) ?? safeString(output?.uuid) ?? safeString(output?.entityId) ?? null;
        const outputQuantity = typeof output?.quantity === 'number' ? output.quantity : 1;

        // Crafting time
        const craftingTime = safeNumber(data.craftingTime) ?? safeNumber(data.productionTime) ?? safeNumber(data.craftTime) ?? null;

        // Station type
        const stationType = safeString(data.stationType) ?? safeString(data.stationClass) ?? safeString(data.craftingStation) ?? null;

        // Skill level
        const skillLevel = safeNumber(data.skillLevel) ?? safeNumber(data.requiredLevel) ?? safeNumber(data.tier) ?? null;

        // Resolve name via localization
        const rawName = safeString(data.displayName) ?? safeString(data.name) ?? safeString(data.title);
        let name: string | null = null;
        if (rawName && locService && rawName.startsWith('@')) {
          name = locService.resolveKey(rawName);
        }
        if (!name) {
          name =
            rawName ??
            outputItemName ??
            className
              .replace(/_/g, ' ')
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .trim();
        }

        results.push({
          uuid: r.uuid,
          className,
          name,
          category: deriveCategory(className),
          outputItemName,
          outputItemUuid,
          outputQuantity,
          craftingTime,
          stationType,
          skillLevel,
          ingredients,
        });
      } catch (e) {
        logger.debug(`Crafting extract error [${r.name}]: ${(e as Error).message}`);
      }
    }

    if (results.length > 0) break; // Found data, stop searching patterns
  }

  if (results.length === 0) {
    logger.warn('No crafting recipes found in DataForge (crafting data may not be in this build)');
  } else {
    logger.info(`Extracted ${results.length} crafting recipes`);
  }

  return results;
}
