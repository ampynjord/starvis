/**
 * Cross-reference logic: link P4K ships ↔ Ship Matrix entries
 *
 * Extracted from ExtractionService to keep the main pipeline lean.
 */
import type { PoolConnection } from 'mysql2/promise';
import logger from './logger.js';

/** Ship Matrix name → P4K ship name mapping for non-obvious matches */
export const SM_TO_P4K_ALIASES: Record<string, string> = {
  Mercury: 'Star Runner',
  'Ares Inferno': 'Starfighter Inferno',
  'Ares Ion': 'Starfighter Ion',
  'A2 Hercules': 'Starlifter A2',
  'C2 Hercules': 'Starlifter C2',
  'M2 Hercules': 'Starlifter M2',
  Genesis: 'Starliner Genesis',
  'A1 Spirit': 'Spirit A1',
  'C1 Spirit': 'Spirit C1',
  'E1 Spirit': 'Spirit E1',
  'F7A Hornet Mk I': 'Hornet F7A Mk1',
  'F7A Hornet Mk II': 'Hornet F7A Mk2',
  'F7C Hornet Mk I': 'Hornet F7C',
  'F7C Hornet Mk II': 'Hornet F7C Mk2',
  'F7C Hornet Wildfire Mk I': 'Hornet F7C Wildfire',
  'F7C-R Hornet Tracker Mk I': 'Hornet F7CR',
  'F7C-R Hornet Tracker Mk II': 'Hornet F7CR Mk2',
  'F7C-S Hornet Ghost Mk I': 'Hornet F7CS',
  'F7C-S Hornet Ghost Mk II': 'Hornet F7CS Mk2',
  'F7C-M Super Hornet Mk I': 'Hornet F7CM',
  'F7C-M Super Hornet Heartseeker Mk I': 'Hornet F7CM Heartseeker',
  'F7C-M Super Hornet Mk II': 'Hornet F7CM Mk2',
  'F8C Lightning': 'Lightning F8C',
  'F8C Lightning Executive Edition': 'Lightning F8C Exec',
  'P-52 Merlin': 'P52 Merlin',
  'P-72 Archimedes': 'P72 Archimedes',
  'P-72 Archimedes Emerald': 'P72 Archimedes Emerald',
  'Reliant Kore': 'Reliant',
  Expanse: 'Starlancer Max',
  'Fury MX': 'Fury Miru',
  '890 Jump': '890Jump',
  '600i Explorer': '600i',
  '600i Touring': '600i Touring',
  'MPUV Cargo': 'MPUV 1T',
  'MPUV Personnel': 'MPUV Transport',
  'MPUV Tractor': 'MPUV',
  'Dragonfly Black': 'Dragonfly',
  'Dragonfly Yellowjacket': 'Dragonfly Yellow',
  'Mustang Alpha Vindicator': 'Mustang Alpha',
  'Gladius Pirate Edition': 'Gladius PIR',
  'Caterpillar Pirate Edition': 'Caterpillar Pirate',
  'Caterpillar Best In Show Edition 2949': 'Caterpillar',
  'Cutlass Black Best In Show Edition 2949': 'Cutlass Black',
  'Hammerhead Best In Show Edition 2949': 'Hammerhead',
  'Reclaimer Best In Show Edition 2949': 'Reclaimer',
  'Valkyrie Liberator Edition': 'Valkyrie',
  'Argo Mole Carbon Edition': 'MOLE Carbon',
  'Argo Mole Talus Edition': 'MOLE Talus',
  'Nautilus Solstice Edition': 'Nautilus Solstice',
  'Carrack w/C8X': 'Carrack',
  'Carrack Expedition w/C8X': 'Carrack Expedition',
  'Anvil Ballista Dunestalker': 'Ballista Dunestalker',
  'Anvil Ballista Snowblind': 'Ballista Snowblind',
  Nox: 'Nox',
  'Nox Kue': 'Nox Kue',
  'Khartu-Al': 'Scout',
  "San'tok.yāi": 'SanTokYai',
  "San'tok.y?i": 'SanTokYai',
  'CSV-SM': 'CSV Cargo',
  'Zeus Mk II CL': 'Zeus CL',
  'Zeus Mk II ES': 'Zeus ES',
  'Zeus Mk II MR': 'Zeus MR',
  'Vanguard Warden': 'Vanguard',
  Ursa: 'Ursa Rover',
  'Ursa Fortuna': 'Ursa Rover Emerald',
  'ROC-DS': 'ROC DS',
  'L-21 Wolf': 'L21 Wolf',
  'L-22 Alpha Wolf': 'L22 AlphaWolf',
};

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019\u2018]/g, "'")
    .replace(/-/g, ' ')
    .replace(/\./g, '')
    .replace(/\//g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Cross-reference P4K ships with Ship Matrix entries.
 * Uses exact name matching, alias resolution, and token-based fuzzy matching.
 */
export async function crossReferenceShipMatrix(conn: PoolConnection): Promise<number> {
  await conn.execute('UPDATE ships SET ship_matrix_id = NULL WHERE ship_matrix_id IS NOT NULL');

  const [ships] = await conn.execute<any[]>('SELECT uuid, class_name, name FROM ships');
  const [smEntries] = await conn.execute<any[]>('SELECT id, name FROM ship_matrix');

  const aliasMap = new Map<string, string>();
  for (const [smName, p4kName] of Object.entries(SM_TO_P4K_ALIASES)) {
    aliasMap.set(normalizeForMatch(smName), normalizeForMatch(p4kName));
  }

  const p4kByName = new Map<string, string>();
  const p4kByClassName = new Map<string, string>();
  for (const ship of ships) {
    const norm = normalizeForMatch(ship.name || '');
    if (norm && !p4kByName.has(norm)) p4kByName.set(norm, ship.uuid);
    const short = normalizeForMatch(ship.class_name.replace(/^[A-Z]{3,5}_/, '').replace(/_/g, ' '));
    if (short && !p4kByClassName.has(short)) p4kByClassName.set(short, ship.uuid);
  }

  const matchedP4K = new Set<string>();
  const matchedSM = new Set<number>();
  const results: Array<{ smId: number; uuid: string }> = [];

  const tryMatch = (smId: number, strategies: Array<() => string | undefined>) => {
    if (matchedSM.has(smId)) return;
    for (const strategy of strategies) {
      const uuid = strategy();
      if (uuid && !matchedP4K.has(uuid)) {
        matchedP4K.add(uuid);
        matchedSM.add(smId);
        results.push({ smId, uuid });
        return;
      }
    }
  };

  // Pass 1: Exact name matches
  for (const sm of smEntries) {
    const smNorm = normalizeForMatch(sm.name);
    tryMatch(sm.id, [() => p4kByName.get(smNorm)]);
  }

  // Pass 2: Alias + class_name matches
  for (const sm of smEntries) {
    const smNorm = normalizeForMatch(sm.name);
    tryMatch(sm.id, [
      () => {
        const alias = aliasMap.get(smNorm);
        return alias ? p4kByName.get(alias) || p4kByClassName.get(alias) : undefined;
      },
      () => p4kByClassName.get(smNorm),
      () => {
        const stripped = smNorm.replace(/^(anvil|argo|crusader|drake)\s+/, '');
        return stripped !== smNorm ? p4kByName.get(stripped) || p4kByClassName.get(stripped) : undefined;
      },
    ]);
  }

  // Pass 3: Token-based fuzzy matching
  for (const sm of smEntries) {
    if (matchedSM.has(sm.id)) continue;
    const smNorm = normalizeForMatch(sm.name);
    const smTokens = new Set(smNorm.split(' ').filter((t) => t.length > 1));
    if (smTokens.size < 2) continue;

    let bestScore = 0;
    let bestUuid: string | undefined;
    for (const ship of ships) {
      if (matchedP4K.has(ship.uuid)) continue;
      const p4kNorm = normalizeForMatch(ship.name || '');
      const p4kTokens = new Set(p4kNorm.split(' ').filter((t) => t.length > 1));
      let hits = 0;
      for (const t of smTokens) if (p4kTokens.has(t)) hits++;
      const score = hits / smTokens.size;
      if (hits >= 2 && score > bestScore && score >= 0.6) {
        bestScore = score;
        bestUuid = ship.uuid;
      }
    }
    if (bestUuid) {
      matchedP4K.add(bestUuid);
      matchedSM.add(sm.id);
      results.push({ smId: sm.id, uuid: bestUuid });
    }
  }

  for (const { smId, uuid } of results) {
    await conn.execute('UPDATE ships SET ship_matrix_id = ? WHERE uuid = ?', [smId, uuid]);
  }

  return results.length;
}

/** Tag variant types for ships not linked to Ship Matrix */
export async function tagVariantTypes(conn: PoolConnection): Promise<void> {
  const rules: Array<{ type: string; patterns: string[] }> = [
    { type: 'collector', patterns: ['%_Collector_%', '%_Collector'] },
    { type: 'exec', patterns: ['%_Exec_%', '%_Exec'] },
    { type: 'bis_edition', patterns: ['%_BIS%'] },
    { type: 'tutorial', patterns: ['%_Teach%', '%Tutorial%'] },
    { type: 'enemy_ai', patterns: ['%_EA_%', '%_EA'] },
    { type: 'military', patterns: ['%_Military%', '%_UEE%', '%_Advocacy%'] },
    { type: 'event', patterns: ['%Fleetweek%', '%_FW%', '%CitizenCon%', '%ShipShowdown%', '%Showdown%'] },
    { type: 'pirate', patterns: ['%_PIR%', '%Pirate%'] },
    { type: 'arena_ai', patterns: ['%_Swarm%'] },
  ];

  for (const rule of rules) {
    const conditions = rule.patterns.map(() => 'class_name LIKE ?').join(' OR ');
    await conn.execute(`UPDATE ships SET variant_type = ? WHERE ship_matrix_id IS NULL AND variant_type IS NULL AND (${conditions})`, [
      rule.type,
      ...rule.patterns,
    ]);
  }

  await conn.execute("UPDATE ships SET variant_type = 'special' WHERE ship_matrix_id IS NULL AND variant_type IS NULL");
}

/** Apply Hull series cargo fallback from Ship Matrix data */
export async function applyHullSeriesCargoFallback(conn: PoolConnection): Promise<void> {
  try {
    const [updated]: any = await conn.execute(
      `UPDATE ships s JOIN ship_matrix sm ON s.ship_matrix_id = sm.id
       SET s.cargo_capacity = sm.cargocapacity
       WHERE (s.cargo_capacity IS NULL OR s.cargo_capacity = 0)
         AND sm.cargocapacity IS NOT NULL AND sm.cargocapacity > 0
         AND s.class_name LIKE '%Hull_%'`,
    );
    if (updated.affectedRows > 0) {
      logger.info(`Hull series cargo fallback applied to ${updated.affectedRows} ships`);
    }
  } catch (e: unknown) {
    logger.warn(`Hull cargo fallback failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
