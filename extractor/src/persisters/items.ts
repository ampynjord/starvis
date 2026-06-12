/**
 * ITEMS + COMMODITIES → items + commodities tables
 */
import { canonicalizeCommodityRecord, canonicalizeItemRecord } from '../canonical-source.js';
import type { PersistContext } from './context.js';

/**
 * Convert a raw lowercase item name from DataForge to a human-readable title.
 * Examples:
 *   "fio shoes 01 01 01"  → "FIO Shoes"
 *   "sc nvy commodore bridgeofficer hat 01 01 01" → "SC NVY Commodore Bridgeofficer Hat"
 *   "cds combat heavy core 03 02 01" → "CDS Combat Heavy Core"
 */
export function titleCaseItemName(rawName: string, className: string): string {
  if (!rawName) return className;
  // Strip trailing variant numbers like "01 01 01", "03 02 01", "a", etc.
  const stripped = rawName
    .replace(/(\s+\d{2})+\s*[a-z]?\s*$/i, '') // " 01 01 01" or " 01 01 01 a"
    .replace(/\s+[a-z]\s*$/i, '') // trailing single letter " a"
    .trim();
  if (!stripped) return rawName;
  // Title-case each word
  return stripped
    .split(' ')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

export async function saveItems(ctx: PersistContext): Promise<{ items: number; commodities: number }> {
  const { conn, env, df, loc, onProgress } = ctx;
  const { items, commodities } = df.extractItems();
  let savedItems = 0;
  let savedCommodities = 0;

  // Apply localization service to resolve human-readable names for items
  if (loc.isLoaded) {
    for (const it of items) {
      // Force LOC lookup first (don't rely on resolveOrFallback's "looks clean" bail-out)
      const locName = loc.resolveComponentName(it.className);
      if (locName) {
        it.name = locName;
      } else {
        // Fallback: title-case the existing lowercase name and expand manufacturer codes
        it.name = titleCaseItemName(it.name, it.className);
      }
    }
    for (const cm of commodities) {
      const locName = loc.resolveComponentName(cm.className);
      if (locName) cm.name = locName;
      else cm.name = titleCaseItemName(cm.name, cm.className);
    }
  } else {
    // No localization — still apply title case
    for (const it of items) it.name = titleCaseItemName(it.name, it.className);
    for (const cm of commodities) cm.name = titleCaseItemName(cm.name, cm.className);
  }

  // ── Batch upsert items ──
  if (items.length > 0) {
    const ITEM_COLS = [
      'env',
      'uuid',
      'class_name',
      'name',
      'normalized_name',
      'canonical_item_key',
      'type',
      'sub_type',
      'size',
      'grade',
      'manufacturer_code',
      'mass',
      'hp',
      'weapon_damage',
      'weapon_damage_type',
      'weapon_fire_rate',
      'weapon_range',
      'weapon_speed',
      'weapon_ammo_count',
      'weapon_dps',
      'armor_damage_reduction',
      'armor_temp_min',
      'armor_temp_max',
      'data_json',
    ];
    const ITEM_UPDATE = ITEM_COLS.filter((c) => c !== 'uuid' && c !== 'env')
      .map((c) => `${c}=EXCLUDED.${c}`)
      .join(', ');
    const colCount = ITEM_COLS.length;

    const batchSize = 200;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const values: any[] = [];
      let paramIdx = 0;
      const valuePlaceholders = batch.map(() => {
        const cols = Array.from({ length: colCount }, () => `$${++paramIdx}`);
        return `(${cols.join(',')})`;
      });

      for (const it of batch) {
        const canonical = canonicalizeItemRecord({
          name: it.name,
          className: it.className,
          type: it.type,
          subType: it.subType,
        });

        values.push(
          env,
          it.uuid,
          it.className,
          it.name,
          canonical.normalizedName,
          canonical.canonicalItemKey,
          it.type,
          it.subType,
          it.size,
          it.grade,
          it.manufacturerCode,
          it.mass,
          it.hp,
          it.weaponDamage,
          it.weaponDamageType,
          it.weaponFireRate,
          it.weaponRange,
          it.weaponSpeed,
          it.weaponAmmoCount,
          it.weaponDps,
          it.armorDamageReduction,
          it.armorTempMin,
          it.armorTempMax,
          it.dataJson ? JSON.stringify(it.dataJson) : null,
        );
      }

      await conn.query(
        `INSERT INTO game.items (${ITEM_COLS.join(', ')}) VALUES ${valuePlaceholders.join(', ')}
         ON CONFLICT (uuid, env) DO UPDATE SET ${ITEM_UPDATE}, updated_at=CURRENT_TIMESTAMP`,
        values,
      );
      savedItems += batch.length;
    }
  }

  // ── Batch upsert commodities ──
  if (commodities.length > 0) {
    const COMM_COLS = [
      'env',
      'uuid',
      'class_name',
      'name',
      'normalized_name',
      'canonical_commodity_key',
      'type',
      'sub_type',
      'symbol',
      'occupancy_scu',
      'data_json',
    ];
    const COMM_UPDATE = COMM_COLS.filter((c) => c !== 'uuid' && c !== 'env')
      .map((c) => `${c}=EXCLUDED.${c}`)
      .join(', ');
    const colCount = COMM_COLS.length;

    const batchSize = 200;
    for (let i = 0; i < commodities.length; i += batchSize) {
      const batch = commodities.slice(i, i + batchSize);
      const values: any[] = [];
      let paramIdx = 0;
      const valuePlaceholders = batch.map(() => {
        const cols = Array.from({ length: colCount }, () => `$${++paramIdx}`);
        return `(${cols.join(',')})`;
      });

      for (const cm of batch) {
        const canonical = canonicalizeCommodityRecord({
          name: cm.name,
          className: cm.className,
          type: cm.type,
          subType: cm.subType,
          symbol: cm.symbol,
        });

        values.push(
          env,
          cm.uuid,
          cm.className,
          cm.name,
          canonical.normalizedName,
          canonical.canonicalCommodityKey,
          cm.type,
          cm.subType,
          cm.symbol,
          cm.occupancyScu,
          cm.dataJson ? JSON.stringify(cm.dataJson) : null,
        );
      }

      await conn.query(
        `INSERT INTO game.commodities (${COMM_COLS.join(', ')}) VALUES ${valuePlaceholders.join(', ')}
         ON CONFLICT (uuid, env) DO UPDATE SET ${COMM_UPDATE}, updated_at=CURRENT_TIMESTAMP`,
        values,
      );
      savedCommodities += batch.length;
    }
  }

  onProgress?.(`Items: ${savedItems}, Commodities: ${savedCommodities}`);
  return { items: savedItems, commodities: savedCommodities };
}
