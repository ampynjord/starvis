/**
 * CHANGELOG → meta.changelog table
 * Compares the pre-extraction snapshot with freshly extracted data.
 */
import type { PoolClient } from 'pg';
import logger from '../logger.js';
import type { GameEnv } from '../module-registry.js';

export async function generateChangelog(
  conn: PoolClient,
  env: GameEnv,
  extractionId: number,
  oldShips: Map<string, any>,
  oldComps: Map<string, any>,
  oldItems: Map<string, any>,
  oldCommodities: Map<string, any>,
): Promise<void> {
  const { rows: newShipsRaw } = await conn.query<any>(
    'SELECT uuid, class_name, name, manufacturer_code, role, career, mass, scm_speed, max_speed, total_hp, shield_hp, cargo_capacity, missile_damage_total, weapon_damage_total, crew_size FROM game.ships WHERE env = $1',
    [env],
  );
  const { rows: newCompsRaw } = await conn.query<any>(
    'SELECT uuid, class_name, name, type, sub_type, size, grade, component_class, manufacturer_code FROM game.components WHERE env = $1',
    [env],
  );
  const newShips = new Map(newShipsRaw.map((s: any) => [s.class_name, s]));
  const newComps = new Map(newCompsRaw.map((c: any) => [c.class_name, c]));

  const inserts: Array<[number, string, string, string, string, string | null, string | null, string | null]> = [];

  type InsertRow = [number, string, string, string, string, string | null, string | null, string | null];

  function pushDetails(
    rows: InsertRow[],
    extractId: number,
    entityType: string,
    uuid: string,
    name: string,
    changeType: 'added' | 'removed',
    obj: Record<string, any>,
    fields: string[],
  ): void {
    for (const field of fields) {
      const val = obj[field];
      if (val == null) continue;
      rows.push([
        extractId,
        entityType,
        uuid,
        name,
        changeType,
        field,
        changeType === 'removed' ? String(val) : null,
        changeType === 'added' ? String(val) : null,
      ]);
    }
  }

  // Ship detail fields for added/removed (name omitted — already in entity_name)
  const shipDetailFields = [
    'manufacturer_code',
    'role',
    'career',
    'mass',
    'scm_speed',
    'max_speed',
    'total_hp',
    'shield_hp',
    'cargo_capacity',
    'missile_damage_total',
    'weapon_damage_total',
    'crew_size',
  ];
  // Ship fields tracked for modifications (includes name for renames)
  const shipModFields = [...shipDetailFields, 'name'];

  // Added ships
  for (const [cn, ship] of newShips) {
    if (!oldShips.has(cn)) {
      inserts.push([extractionId, 'ship', ship.uuid, ship.name || cn, 'added', null, null, null]);
      pushDetails(inserts, extractionId, 'ship', ship.uuid, ship.name || cn, 'added', ship, shipDetailFields);
    }
  }
  // Removed ships
  for (const [cn, ship] of oldShips) {
    if (!newShips.has(cn)) {
      inserts.push([extractionId, 'ship', ship.uuid, ship.name || cn, 'removed', null, null, null]);
      pushDetails(inserts, extractionId, 'ship', ship.uuid, ship.name || cn, 'removed', ship, shipDetailFields);
    }
  }
  // Modified ships
  for (const [cn, newShip] of newShips) {
    const oldShip = oldShips.get(cn);
    if (!oldShip) continue;
    for (const field of shipModFields) {
      const oldVal = oldShip[field];
      const newVal = newShip[field];
      if (oldVal == null && newVal == null) continue;
      if (typeof oldVal === 'number' && typeof newVal === 'number') {
        if (Math.abs(oldVal - newVal) < 0.01) continue;
      } else if (String(oldVal) === String(newVal)) {
        continue;
      }
      inserts.push([
        extractionId,
        'ship',
        newShip.uuid,
        newShip.name || cn,
        'modified',
        field,
        oldVal != null ? String(oldVal) : null,
        newVal != null ? String(newVal) : null,
      ]);
    }
  }

  const compDetailFields = ['type', 'sub_type', 'size', 'grade', 'component_class', 'manufacturer_code'];

  // Added components
  for (const [cn, comp] of newComps) {
    if (!oldComps.has(cn)) {
      inserts.push([extractionId, 'component', comp.uuid, comp.name || cn, 'added', null, null, null]);
      pushDetails(inserts, extractionId, 'component', comp.uuid, comp.name || cn, 'added', comp, compDetailFields);
    }
  }
  // Removed components
  for (const [cn, comp] of oldComps) {
    if (!newComps.has(cn)) {
      inserts.push([extractionId, 'component', comp.uuid, comp.name || cn, 'removed', null, null, null]);
      pushDetails(inserts, extractionId, 'component', comp.uuid, comp.name || cn, 'removed', comp, compDetailFields);
    }
  }
  // Modified components
  for (const [cn, newComp] of newComps) {
    const oldComp = oldComps.get(cn);
    if (!oldComp) continue;
    for (const field of compDetailFields) {
      const oldVal = oldComp[field];
      const newVal = newComp[field];
      if (oldVal == null && newVal == null) continue;
      if (String(oldVal) === String(newVal)) continue;
      inserts.push([
        extractionId,
        'component',
        newComp.uuid,
        newComp.name || cn,
        'modified',
        field,
        oldVal != null ? String(oldVal) : null,
        newVal != null ? String(newVal) : null,
      ]);
    }
  }

  const itemDetailFields = ['type', 'sub_type', 'manufacturer_code'];

  // ── Items changelog ──
  const { rows: newItemsRaw } = await conn.query<any>(
    'SELECT uuid, class_name, name, type, sub_type, manufacturer_code FROM game.items WHERE env = $1',
    [env],
  );
  const newItems = new Map(newItemsRaw.map((i: any) => [i.class_name, i]));
  for (const [cn, item] of newItems) {
    if (!oldItems.has(cn)) {
      inserts.push([extractionId, 'item', item.uuid, item.name || cn, 'added', null, null, null]);
      pushDetails(inserts, extractionId, 'item', item.uuid, item.name || cn, 'added', item, itemDetailFields);
    }
  }
  for (const [cn, item] of oldItems) {
    if (!newItems.has(cn)) {
      inserts.push([extractionId, 'item', item.uuid, item.name || cn, 'removed', null, null, null]);
      pushDetails(inserts, extractionId, 'item', item.uuid, item.name || cn, 'removed', item, itemDetailFields);
    }
  }
  // Modified items
  for (const [cn, newItem] of newItems) {
    const oldItem = oldItems.get(cn);
    if (!oldItem) continue;
    for (const field of itemDetailFields) {
      const oldVal = oldItem[field];
      const newVal = newItem[field];
      if (oldVal == null && newVal == null) continue;
      if (String(oldVal) === String(newVal)) continue;
      inserts.push([
        extractionId,
        'item',
        newItem.uuid,
        newItem.name || cn,
        'modified',
        field,
        oldVal != null ? String(oldVal) : null,
        newVal != null ? String(newVal) : null,
      ]);
    }
  }

  const commodityDetailFields = ['type'];

  // ── Commodities changelog ──
  const { rows: newCommoditiesRaw } = await conn.query<any>('SELECT uuid, class_name, name, type FROM game.commodities WHERE env = $1', [
    env,
  ]);
  const newCommodities = new Map(newCommoditiesRaw.map((c: any) => [c.class_name, c]));
  for (const [cn, commodity] of newCommodities) {
    if (!oldCommodities.has(cn)) {
      inserts.push([extractionId, 'commodity', commodity.uuid, commodity.name || cn, 'added', null, null, null]);
      pushDetails(inserts, extractionId, 'commodity', commodity.uuid, commodity.name || cn, 'added', commodity, commodityDetailFields);
    }
  }
  for (const [cn, commodity] of oldCommodities) {
    if (!newCommodities.has(cn)) {
      inserts.push([extractionId, 'commodity', commodity.uuid, commodity.name || cn, 'removed', null, null, null]);
      pushDetails(inserts, extractionId, 'commodity', commodity.uuid, commodity.name || cn, 'removed', commodity, commodityDetailFields);
    }
  }

  if (inserts.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < inserts.length; i += batchSize) {
      const batch = inserts.slice(i, i + batchSize);
      let paramIdx = 0;
      const placeholders = batch
        .map(() => {
          const cols = Array.from({ length: 8 }, () => `$${++paramIdx}`);
          return `(${cols.join(',')})`;
        })
        .join(', ');
      const values = batch.flat();
      await conn.query(
        `INSERT INTO meta.changelog (extraction_id, entity_type, entity_uuid, entity_name, change_type, field_name, old_value, new_value) VALUES ${placeholders}`,
        values,
      );
    }
    logger.info(`Changelog: ${inserts.length} entries generated`);
  } else {
    logger.info('Changelog: No changes detected');
  }
}
