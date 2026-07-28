/**
 * Une recette d'artisanat telle que l'API la sert.
 *
 * `min_quality_required` est agrégée par la requête — `MAX(NULLIF(min_quality,
 * 0))` sur les ingrédients — et vaut donc null quand aucun n'impose de qualité.
 */
export interface PublicCraftingRecipe {
  uuid: string;
  class_name: string;
  name: string;
  category: string;
  output_item_name: string;
  output_item_uuid: string;
  output_quantity: number;
  crafting_time_s: number;
  station_type: string;
  skill_level: number | null;
  p4k_path: string;
  ingredient_count: number;
  optional_ingredient_count: number;
  modifier_count: number;
  total_scu: number;
  min_quality_required: number | null;
  missions_count: number;
  display_name: string;
  display_output_item_name: string;
}
