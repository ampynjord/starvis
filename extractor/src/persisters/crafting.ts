/**
 * CRAFTING RECIPES → crafting_recipes + crafting_ingredients + crafting_slot_modifiers tables
 */
import { extractCraftingRecipes } from '../extractors/crafting-extractor.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

export async function saveCraftingRecipes(ctx: PersistContext): Promise<number> {
  const { conn, env, df, loc, onProgress } = ctx;
  const locAdapter = loc.isLoaded
    ? {
        resolveKey: (k: string) => loc.resolveKey(k) ?? null,
        resolveComponentName: (className: string) => loc.resolveComponentName(className),
      }
    : undefined;

  const recipes = extractCraftingRecipes(df, locAdapter);
  if (!recipes.length) {
    onProgress?.('Crafting: no recipe records found in this build');
    return 0;
  }

  onProgress?.(`Crafting: ${recipes.length} recipes found`);

  // Save recipes
  const recipeRows = recipes.map((r) => [
    env,
    r.uuid,
    r.className,
    r.name,
    r.category,
    r.outputItemName,
    r.outputItemUuid,
    r.outputQuantity,
    r.craftingTime,
    r.stationType,
    r.skillLevel,
    r.p4kPath,
    r.rawJson ? JSON.stringify(r.rawJson) : null,
  ]);

  const savedRecipes = await batchUpsert(
    conn,
    `INSERT INTO game.crafting_recipes
       (env, uuid, class_name, name, category, output_item_name, output_item_uuid,
        output_quantity, crafting_time_s, station_type, skill_level, p4k_path, raw_json)`,
    `(uuid, env) DO UPDATE SET
       class_name=EXCLUDED.class_name, name=EXCLUDED.name, category=EXCLUDED.category,
       output_item_name=EXCLUDED.output_item_name, output_item_uuid=EXCLUDED.output_item_uuid,
       output_quantity=EXCLUDED.output_quantity, crafting_time_s=EXCLUDED.crafting_time_s,
       station_type=EXCLUDED.station_type, skill_level=EXCLUDED.skill_level,
       p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json`,
    13,
    recipeRows,
  );

  // Save ingredients
  let savedIngredients = 0;
  const ingredientRows: (string | number | null)[][] = [];
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      ingredientRows.push([
        r.uuid,
        ing.itemName,
        ing.itemUuid,
        ing.quantity,
        ing.isOptional ? 1 : 0,
        ing.scu,
        ing.minQuality,
        ing.slotName,
      ]);
    }
  }

  if (ingredientRows.length > 0) {
    // Add env to each ingredient row
    const ingredientRowsWithEnv = ingredientRows.map(([rUuid, ...rest]) => [env, rUuid, ...rest]);
    savedIngredients = await batchUpsert(
      conn,
      `INSERT INTO game.crafting_ingredients
         (recipe_env, recipe_uuid, item_name, item_uuid, quantity, is_optional, scu, min_quality, slot_name)`,
      '',
      9,
      ingredientRowsWithEnv,
    );
  }

  // Save slot modifiers
  let savedModifiers = 0;
  const modifierRows: (string | number | null)[][] = [];
  for (const r of recipes) {
    for (const mod of r.modifiers) {
      modifierRows.push([
        r.uuid,
        mod.slotName,
        mod.propertyName,
        mod.propertyUuid,
        mod.unitFormat,
        mod.startQuality,
        mod.endQuality,
        mod.modifierAtStart,
        mod.modifierAtEnd,
        mod.modifierType ?? null,
      ]);
    }
  }

  if (modifierRows.length > 0) {
    // Add env to each modifier row
    const modifierRowsWithEnv = modifierRows.map(([rUuid, ...rest]) => [env, rUuid, ...rest]);
    savedModifiers = await batchUpsert(
      conn,
      `INSERT INTO game.crafting_slot_modifiers
         (recipe_env, recipe_uuid, slot_name, property_name, property_uuid, unit_format, start_quality, end_quality, modifier_at_start, modifier_at_end, modifier_type)`,
      '',
      11,
      modifierRowsWithEnv,
    );
  }

  onProgress?.(`Crafting: ${savedRecipes} recipes, ${savedIngredients} ingredients, ${savedModifiers} modifiers saved [${env}]`);
  return savedRecipes;
}
