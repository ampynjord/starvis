import { CONSUMABLE_SUBTYPE_ORDER } from '../../data/taxonomy/items-taxonomy.js';
import { cleanItemDisplayName } from '../../normalizers/items.js';
import type { Row } from '../shared.js';

export const ITEM_JSON_SORT_MAP: Record<string, string> = {
  'game_data.weapon_damage': "(i.game_data#>>'{weapon_damage}')::numeric",
  'game_data.weapon_dps': "(i.game_data#>>'{weapon_dps}')::numeric",
  'game_data.weapon_fire_rate': "(i.game_data#>>'{weapon_fire_rate}')::numeric",
  'game_data.weapon_range': "(i.game_data#>>'{weapon_range}')::numeric",
  'game_data.armor_dr': "(i.game_data#>>'{armor_damage_reduction}')::numeric",
};

export const ITEM_SORT = new Set([
  'name',
  'class_name',
  'type',
  'sub_type',
  'size',
  'grade',
  'manufacturer_code',
  'mass',
  'hp',
  'weapon_damage',
  'weapon_fire_rate',
  'weapon_range',
  'weapon_dps',
  'armor_damage_reduction',
  'armor_temp_min',
  'armor_temp_max',
]);

export type AttachmentSlot = 'barrel' | 'underbarrel' | 'optic' | 'other';

export interface WeaponAttachmentModifier {
  uuid: string;
  class_name: string;
  name: string;
  display_name: string;
  slot: AttachmentSlot;
  manufacturer_code: string | null;
  manufacturer_name: string | null;
  fire_rate_bonus: number;
  damage_bonus: number;
  effects: { key: string; label: string; value: number; unit: 'percent' }[];
}

export type ItemBuyLocationSourceStatus = 'available' | 'empty' | 'unavailable' | 'not_checked';

export interface ItemBuyLocationSourceMeta {
  status: ItemBuyLocationSourceStatus;
  count: number | null;
  error?: string;
}

export interface ItemBuyLocationResult {
  data: Row[];
  source: 'uex' | 'p4k' | 'none';
  sourcePriority: ['uex', 'p4k'];
  fallbackUsed: boolean;
  reason?: 'uex_available' | 'uex_empty_p4k_available' | 'uex_unavailable_p4k_available' | 'no_uex_or_p4k_location_found';
  sources: {
    uex: ItemBuyLocationSourceMeta;
    p4k: ItemBuyLocationSourceMeta;
  };
}

export function itemMarketAggregateSelect(): string {
  return `
    item_market.min_purchase_price,
    item_market.min_rental_price_1d,
    item_market.min_rental_price_3d,
    item_market.min_rental_price_7d,
    item_market.min_rental_price_30d,
    COALESCE(item_market.purchase_location_count, 0)::integer as purchase_location_count,
    COALESCE(item_market.rental_location_count, 0)::integer as rental_location_count`;
}

export const ITEM_MARKET_JOIN = `LEFT JOIN (
  SELECT
    shop.env,
    LOWER(si.component_class_name) as component_class_key,
    MIN(si.base_price) FILTER (WHERE si.base_price > 0) as min_purchase_price,
    MIN(si.rental_price_1d) FILTER (WHERE si.rental_price_1d > 0) as min_rental_price_1d,
    MIN(si.rental_price_3d) FILTER (WHERE si.rental_price_3d > 0) as min_rental_price_3d,
    MIN(si.rental_price_7d) FILTER (WHERE si.rental_price_7d > 0) as min_rental_price_7d,
    MIN(si.rental_price_30d) FILTER (WHERE si.rental_price_30d > 0) as min_rental_price_30d,
    COUNT(DISTINCT si.shop_id) FILTER (WHERE si.base_price > 0) as purchase_location_count,
    COUNT(DISTINCT si.shop_id) FILTER (WHERE si.rental_price_1d > 0 OR si.rental_price_3d > 0 OR si.rental_price_7d > 0 OR si.rental_price_30d > 0) as rental_location_count
  FROM game.shop_inventory si
  JOIN game.shops shop ON shop.id = si.shop_id
  WHERE si.inventory_kind IN ('item', 'unknown')
  GROUP BY shop.env, LOWER(si.component_class_name)
) item_market ON item_market.env = i.env
  AND item_market.component_class_key = LOWER(i.class_name)`;

export function formatConsumableLabel(subType: string): string {
  const explicitLabels: Record<string, string> = {
    SystemAccess: 'System Access',
    MedPack: 'MedPack',
    OxygenCap: 'Oxygen Cap',
  };
  return explicitLabels[subType] ?? subType.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

export function orderConsumableEntries(entries: { value: string; count: number }[]) {
  return [...entries].sort((left, right) => {
    const leftIndex = CONSUMABLE_SUBTYPE_ORDER.indexOf(left.value);
    const rightIndex = CONSUMABLE_SUBTYPE_ORDER.indexOf(right.value);
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return formatConsumableLabel(left.value).localeCompare(formatConsumableLabel(right.value));
  });
}

export function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(readObject).filter((entry): entry is Record<string, unknown> => !!entry) : [];
}

export function percentFromMultiplier(multiplier: unknown): number {
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value === 0 || value === 1) return 0;
  return Math.round((value - 1) * 1000) / 10;
}

export function addMultiplierEffect(effects: WeaponAttachmentModifier['effects'], key: string, label: string, multiplier: unknown): number {
  const value = percentFromMultiplier(multiplier);
  if (value !== 0) effects.push({ key, label, value, unit: 'percent' });
  return value;
}

export function inferAttachmentSlot(dataJson: Record<string, unknown>): AttachmentSlot {
  const rawData = readObject(readObject(dataJson.rawJson)?.data);
  const components = readArray(rawData?.Components);
  const attachDef = readObject(components.map((component) => readObject(component.AttachDef)).find(Boolean));
  const probe = [
    attachDef?.SubType,
    readObject(attachDef?.mannequinTags)?.mannequinBaseTag,
    readObject(attachDef?.mannequinTags)?.mannequinTypeTag,
    dataJson.p4kPath,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/bottom|underbarrel|ubarrel/.test(probe)) return 'underbarrel';
  if (/barrel|muzzle|suppressor/.test(probe)) return 'barrel';
  if (/optic|scope|sight/.test(probe)) return 'optic';
  return 'other';
}

export function extractWeaponAttachmentModifier(row: Row): WeaponAttachmentModifier {
  const dataJson = readObject(row.data_json) ?? readObject(row.dataJson) ?? {};
  const rawData = readObject(readObject(dataJson.rawJson)?.data);
  const components = readArray(rawData?.Components);
  const modifierComponent = components.find((component) => component.__type === 'SWeaponModifierComponentParams');
  const weaponStats = readObject(readObject(modifierComponent?.modifier)?.weaponStats) ?? {};
  const effects: WeaponAttachmentModifier['effects'] = [];

  const fireRateBonus = addMultiplierEffect(effects, 'fire_rate', 'Fire rate', weaponStats.fireRateMultiplier);
  const damageBonus = addMultiplierEffect(effects, 'damage', 'Damage', weaponStats.damageMultiplier);
  addMultiplierEffect(effects, 'projectile_speed', 'Projectile speed', weaponStats.projectileSpeedMultiplier);
  addMultiplierEffect(effects, 'ammo_cost', 'Ammo cost', weaponStats.ammoCostMultiplier);
  addMultiplierEffect(effects, 'heat_generation', 'Heat generation', weaponStats.heatGenerationMultiplier);
  addMultiplierEffect(effects, 'charge_time', 'Charge time', weaponStats.chargeTimeMultiplier);
  addMultiplierEffect(effects, 'sound_radius', 'Sound radius', weaponStats.soundRadiusMultiplier);

  const spreadModifier = readObject(weaponStats.spreadModifier);
  const spreadValues = [
    spreadModifier?.minMultiplier,
    spreadModifier?.maxMultiplier,
    spreadModifier?.attackMultiplier,
    spreadModifier?.firstAttackMultiplier,
  ]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0 && value !== 1);
  if (spreadValues.length) {
    const averageSpread = spreadValues.reduce((sum, value) => sum + value, 0) / spreadValues.length;
    effects.push({ key: 'spread', label: 'Spread', value: percentFromMultiplier(averageSpread), unit: 'percent' });
  }

  const recoilModifier = readObject(weaponStats.recoilModifier);
  const recoilValues = [
    recoilModifier?.decayMultiplier,
    recoilModifier?.endDecayMultiplier,
    recoilModifier?.randomnessMultiplier,
    recoilModifier?.fireRecoilTimeMultiplier,
    recoilModifier?.fireRecoilStrengthMultiplier,
    recoilModifier?.angleRecoilStrengthMultiplier,
    recoilModifier?.fireRecoilStrengthFirstMultiplier,
  ]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0 && value !== 1);
  if (recoilValues.length) {
    const averageRecoil = recoilValues.reduce((sum, value) => sum + value, 0) / recoilValues.length;
    effects.push({ key: 'recoil', label: 'Recoil', value: percentFromMultiplier(averageRecoil), unit: 'percent' });
  }

  return {
    uuid: String(row.uuid),
    class_name: String(row.class_name),
    name: String(row.name),
    display_name: String(row.display_name ?? cleanItemDisplayName(String(row.name))),
    slot: inferAttachmentSlot(dataJson),
    manufacturer_code: row.manufacturer_code ?? null,
    manufacturer_name: row.manufacturer_name ?? null,
    fire_rate_bonus: fireRateBonus,
    damage_bonus: damageBonus,
    effects,
  };
}
