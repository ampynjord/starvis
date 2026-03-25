/**
 * CraftingExtractor — Crafting recipe records from DataForge
 *
 * Extracts two kinds of crafting data:
 *   1. Legacy recipes (LegacyCraftingRecipeDefRecord) — old salvage/tool system
 *   2. Blueprint recipes (CraftingBlueprintRecord) — new 4.0+ system with
 *      FPS weapons, armours, vehicle weapons, medical, etc.
 *
 * Both are merged into a single CraftingRecipeRecord[] output.
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

// ── Legacy system: struct type patterns ────────────────────
const LEGACY_STRUCT_PATTERNS = [
  'LegacyCraftingRecipeDefRecord',
  'LegacyCraftingRecipeListRecord',
];

// Category classification from class name (legacy recipes)
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

// ── Blueprint system helpers ───────────────────────────────

/** Build UUID → category name map from BlueprintCategoryRecord */
function buildCategoryMap(ctx: DataForgeService): Map<string, string> {
  const map = new Map<string, string>();
  const records = ctx.searchByStructType('BlueprintCategoryRecord', 200);
  for (const r of records) {
    const name = (r.name as string).replace('BlueprintCategoryRecord.', '');
    map.set(r.uuid, name);
  }
  return map;
}

/** Parse craft time from nested { days, hours, minutes, seconds } */
function parseCraftTime(ct: Record<string, unknown> | null | undefined): number | null {
  if (!ct || typeof ct !== 'object') return null;
  const total =
    ((ct.days as number) || 0) * 86400 +
    ((ct.hours as number) || 0) * 3600 +
    ((ct.minutes as number) || 0) * 60 +
    ((ct.seconds as number) || 0);
  return total > 0 ? total : null;
}

/** Derive a human-readable name from a BP_CRAFT class name */
function blueprintDisplayName(
  className: string,
  entityName: string | undefined,
  locService?: { resolveKey(key: string): string | null },
  locKey?: string | null,
): string {
  // Try localization first
  if (locKey && locKey !== '@LOC_PLACEHOLDER' && locService) {
    const resolved = locService.resolveKey(locKey);
    if (resolved) return resolved;
  }
  // Use entity class name if available (e.g. "Volt_Sniper_Energy_01")
  if (entityName) {
    return entityName
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
  }
  // Fallback: parse from BP_CRAFT_xxx
  return className
    .replace(/^CraftingBlueprintRecord\./, '')
    .replace(/^BP_CRAFT_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

// ── Blueprint extraction ───────────────────────────────────

function extractBlueprints(
  ctx: DataForgeService,
  locService?: { resolveKey(key: string): string | null },
): CraftingRecipeRecord[] {
  const records = ctx.searchByStructType('CraftingBlueprintRecord', 10000);
  if (records.length === 0) return [];

  const categoryMap = buildCategoryMap(ctx);
  logger.info(`Found ${records.length} CraftingBlueprintRecord records, ${categoryMap.size} categories`);

  const results: CraftingRecipeRecord[] = [];

  for (const r of records) {
    try {
      const data = ctx.readRecordByGuid(r.uuid, 8) as Record<string, unknown>;
      if (!data) continue;

      const className = r.name || r.fileName || '';
      const blueprint = data.blueprint as Record<string, unknown> | undefined;
      if (!blueprint) continue;

      // Skip generic dismantle/refining blueprints
      const processData = blueprint.processSpecificData as Record<string, unknown> | undefined;
      const processType = safeString(processData?.__type);
      if (!processType || processType !== 'CraftingProcess_Creation') continue;

      // Category from ref
      const catRef = (blueprint.category as Record<string, unknown>)?.__ref as string | undefined;
      const category = (catRef && categoryMap.get(catRef)) || 'Misc';

      // Output entity
      const entityRef = (processData?.entityClass as Record<string, unknown>)?.__ref as string | undefined;
      const outputItemUuid = entityRef ?? null;
      const entityName = entityRef ? ctx.resolveGuid(entityRef) : undefined;

      // Localized name
      const locKey = safeString(blueprint.blueprintName);
      const name = blueprintDisplayName(className, entityName, locService, locKey);

      // Craft time from first tier
      const tiers = blueprint.tiers as Array<Record<string, unknown>> | undefined;
      let craftingTime: number | null = null;
      if (tiers?.length) {
        const recipe = tiers[0].recipe as Record<string, unknown> | undefined;
        const costs = recipe?.costs as Record<string, unknown> | undefined;
        craftingTime = parseCraftTime(costs?.craftTime as Record<string, unknown>);
      }

      results.push({
        uuid: r.uuid,
        className,
        name,
        category,
        outputItemName: entityName ?? null,
        outputItemUuid,
        outputQuantity: 1,
        craftingTime,
        stationType: 'FPSCraftingBench',
        skillLevel: null,
        ingredients: [],
      });
    } catch (e) {
      logger.debug(`Blueprint extract error [${r.name}]: ${(e as Error).message}`);
    }
  }

  logger.info(`Extracted ${results.length} blueprint recipes`);
  return results;
}

// ── Legacy extraction ──────────────────────────────────────

function extractLegacyRecipes(
  ctx: DataForgeService,
  locService?: { resolveKey(key: string): string | null },
): CraftingRecipeRecord[] {
  const results: CraftingRecipeRecord[] = [];

  for (const structPattern of LEGACY_STRUCT_PATTERNS) {
    const records = ctx.searchByStructType(structPattern, 10000);
    if (records.length === 0) continue;

    logger.info(`Found ${records.length} records matching legacy pattern "${structPattern}"`);

    for (const r of records) {
      try {
        const data = ctx.readRecordByGuid(r.uuid, 5) as Record<string, unknown>;
        if (!data) continue;

        const className = r.name || r.fileName || '';
        const ingredients: CraftingIngredientRecord[] = [];

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
          if (ingredients.length > 0) break;
        }

        const output = (data.output ?? data.outputItem ?? data.result) as Record<string, unknown> | undefined;
        const outputItemName = safeString(output?.itemName) ?? safeString(output?.name) ?? safeString(data.outputItemName as unknown) ?? null;
        const outputItemUuid = safeString(output?.itemUuid) ?? safeString(output?.uuid) ?? safeString(output?.entityId) ?? null;
        const outputQuantity = typeof output?.quantity === 'number' ? output.quantity : 1;
        const craftingTime = safeNumber(data.craftingTime) ?? safeNumber(data.productionTime) ?? safeNumber(data.craftTime) ?? null;
        const stationType = safeString(data.stationType) ?? safeString(data.stationClass) ?? safeString(data.craftingStation) ?? null;
        const skillLevel = safeNumber(data.skillLevel) ?? safeNumber(data.requiredLevel) ?? safeNumber(data.tier) ?? null;

        const rawName = safeString(data.displayName) ?? safeString(data.name) ?? safeString(data.title);
        let name: string | null = null;
        if (rawName && locService && rawName.startsWith('@')) {
          name = locService.resolveKey(rawName);
        }
        if (!name) {
          name = rawName ?? outputItemName ?? className.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
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
        logger.debug(`Legacy crafting extract error [${r.name}]: ${(e as Error).message}`);
      }
    }
  }

  return results;
}

// ── Public API ──────────────────────────────────────────────

export function extractCraftingRecipes(
  ctx: DataForgeService,
  locService?: { resolveKey(key: string): string | null },
): CraftingRecipeRecord[] {
  // Extract both systems and merge
  const blueprints = extractBlueprints(ctx, locService);
  const legacy = extractLegacyRecipes(ctx, locService);
  const results = [...blueprints, ...legacy];

  if (results.length === 0) {
    logger.warn('No crafting recipes found in DataForge (crafting data may not be in this build)');
  } else {
    logger.info(`Extracted ${results.length} crafting recipes (${blueprints.length} blueprints + ${legacy.length} legacy)`);
  }

  return results;
}
