/**
 * PAINTS → ship_paints table
 * Includes fix for Starfighter/Starlancer (contains-match)
 */
import logger from '../logger.js';
import { BATCH_SIZE, batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

export async function savePaints(ctx: PersistContext): Promise<void> {
  const { conn, env, df, onProgress } = ctx;
  const paints = df.extractPaints();
  if (!paints.length) {
    onProgress?.('No paints found');
    return;
  }

  const { rows: shipRows } = await conn.query<any>('SELECT uuid, name, class_name FROM game.ships WHERE env = $1', [env]);
  const nameMap = new Map<string, string>();
  const classMap = new Map<string, string>();
  // Also build a reverse index: ships whose name CONTAINS a keyword
  const shipList: Array<{ uuid: string; name: string; classShort: string }> = [];

  for (const s of shipRows) {
    nameMap.set(s.name.toLowerCase(), s.uuid);
    classMap.set(s.class_name.toLowerCase(), s.uuid);
    const parts = s.class_name.split('_');
    if (parts.length >= 2) {
      const withoutMfg = parts.slice(1).join('_').toLowerCase();
      if (!nameMap.has(withoutMfg)) nameMap.set(withoutMfg, s.uuid);
    }
    shipList.push({
      uuid: s.uuid,
      name: (s.name || '').toLowerCase(),
      classShort: parts.length >= 2 ? parts.slice(1).join('_').toLowerCase() : s.class_name.toLowerCase(),
    });
  }

  let matched = 0;
  let debugSamples = 0;
  const paintRows: (string | number | null)[][] = [];
  await conn.query('DELETE FROM game.ship_paints WHERE env = $1', [env]);

  for (const paint of paints) {
    const shortName = paint.shipShortName.toLowerCase().replace(/_/g, ' ');
    const shortNameUnderscore = paint.shipShortName.toLowerCase();

    let shipUuids: string[] = [];
    let match = nameMap.get(shortName) || nameMap.get(shortNameUnderscore);

    if (!match) match = classMap.get(shortNameUnderscore);

    // Prefix match: shortName starts with a ship name
    if (!match) {
      let bestLen = 0;
      for (const [n, uuid] of nameMap) {
        if (shortNameUnderscore.startsWith(n) && n.length > bestLen) {
          match = uuid;
          bestLen = n.length;
        }
      }
    }

    // **FIX**: Contains match — find ships whose name CONTAINS the shortName
    // e.g., shortName="Starfighter" matches "Ares Starfighter Inferno", "Ares Starfighter Ion"
    // e.g., shortName="Starlancer" matches "Starlancer Max", "Starlancer TAC"
    if (!match) {
      for (const ship of shipList) {
        if (ship.name.includes(shortName) || ship.classShort.includes(shortNameUnderscore)) {
          shipUuids.push(ship.uuid);
        }
      }
      shipUuids = [...new Set(shipUuids)];
    }

    if (match) {
      shipUuids = [match];
    } else if (!shipUuids.length) {
      // Try progressively shorter versions
      const segments = shortName.split(' ');
      for (let len = segments.length - 1; len >= 1 && !shipUuids.length; len--) {
        const shorter = segments.slice(0, len).join(' ');
        const shorterU = segments.slice(0, len).join('_');
        const exactMatch = nameMap.get(shorter) || nameMap.get(shorterU);
        if (exactMatch) {
          shipUuids = [exactMatch];
        } else {
          for (const [n, uuid] of nameMap) {
            if (n.startsWith(shorter) || n.startsWith(shorterU)) {
              shipUuids.push(uuid);
            }
          }
          shipUuids = [...new Set(shipUuids)];
        }
      }
    }

    if (!shipUuids.length) {
      if (debugSamples < 15) {
        logger.debug(`[Paints] Unmatched: "${paint.paintClassName}" → shortName="${paint.shipShortName}"`);
        debugSamples++;
      }
      continue;
    }

    matched++;
    for (const shipUuid of shipUuids) {
      paintRows.push([env, shipUuid, paint.paintClassName, paint.paintName, paint.paintUuid]);
    }
  }

  // Batch insert paints (ignore duplicates / FK errors)
  const inserted = await batchUpsert(
    conn,
    'INSERT INTO game.ship_paints (env, ship_uuid, paint_class_name, paint_name, paint_uuid)',
    '',
    5,
    paintRows,
    BATCH_SIZE,
  );
  const unmatched = paints.length - matched;
  onProgress?.(
    `Paints: ${inserted} rows saved (${paintRows.length} prepared, ${matched}/${paints.length} matched${unmatched ? `, ${unmatched} unmatched` : ''})`,
  );
}
