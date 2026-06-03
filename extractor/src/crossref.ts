/**
 * Cross-reference logic: link P4K ships ↔ Ship Matrix entries
 *
 * Extracted from ExtractionService to keep the main pipeline lean.
 */
import type { PoolClient } from 'pg';
import type { GameEnv } from './extraction-service.js';
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
  return (
    name
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['\u2019\u2018]/g, "'")
      .replace(/-/g, ' ')
      .replace(/\./g, '')
      .replace(/\//g, '')
      // Unify "Mk IV/III/II/I" and "Mk4/3/2/1" so Ship Matrix ↔ P4K always match
      .replace(/\bmk\s*iv\b/g, 'mk 4')
      .replace(/\bmk\s*iii\b/g, 'mk 3')
      .replace(/\bmk\s*ii\b/g, 'mk 2')
      .replace(/\bmk\s*i\b/g, 'mk 1')
      .replace(/\bmk\s*(\d)\b/g, 'mk $1')
      .replace(/\s+/g, ' ')
  );
}

/**
 * Cross-reference P4K ships with Ship Matrix entries.
 * Uses exact name matching, alias resolution, and token-based fuzzy matching.
 */
export async function crossReferenceShipMatrix(conn: PoolClient, env: GameEnv): Promise<number> {
  await conn.query('UPDATE game.ships SET ship_matrix_id = NULL WHERE ship_matrix_id IS NOT NULL AND env = $1', [env]);

  const { rows: ships } = await conn.query<any>('SELECT uuid, class_name, name FROM game.ships WHERE env = $1', [env]);
  const { rows: smEntries } = await conn.query<any>('SELECT id, name FROM rsi.ship_matrix');

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
    await conn.query('UPDATE game.ships SET ship_matrix_id = $1 WHERE uuid = $2 AND env = $3', [smId, uuid, env]);
  }

  return results.length;
}

function normalizeStarmapType(type: string | null | undefined): string {
  const normalized = normalizeForMatch(type ?? '').replace(/\s+/g, '_');
  if (normalized === 'system') return 'star';
  if (normalized === 'jump_point' || normalized === 'jumppoint') return 'jump point';
  if (normalized === 'asteroid_field') return 'asteroid';
  return normalized;
}

function stripLocationNoise(name: string): string {
  return normalizeForMatch(name)
    .replace(/\b(star|sun|system|planet|moon)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function locationMatchScore(p4kName: string, rsiName: string, rsiSystemName?: string | null): number {
  const p4k = normalizeForMatch(p4kName);
  const rsi = normalizeForMatch(rsiName);
  const rsiSystem = normalizeForMatch(rsiSystemName ?? '');
  if (!p4k || !rsi) return 0;
  if (p4k === rsi || (rsiSystem && p4k === rsiSystem)) return 100;

  const p4kStripped = stripLocationNoise(p4k);
  const rsiStripped = stripLocationNoise(rsi);
  const systemStripped = stripLocationNoise(rsiSystem);
  if (p4kStripped && (p4kStripped === rsiStripped || p4kStripped === systemStripped)) return 95;

  const p4kTokens = new Set(p4kStripped.split(' ').filter((token) => token.length > 1));
  const rsiTokens = new Set(`${rsiStripped} ${systemStripped}`.split(' ').filter((token) => token.length > 1));
  if (!p4kTokens.size || !rsiTokens.size) return 0;

  let hits = 0;
  for (const token of p4kTokens) if (rsiTokens.has(token)) hits++;
  return Math.round((hits / p4kTokens.size) * 80);
}

function areStarmapTypesCompatible(p4kType: string, rsiType: string): boolean {
  const p4k = normalizeStarmapType(p4kType);
  const rsi = normalizeStarmapType(rsiType);
  if (p4k === rsi) return true;
  if (p4k === 'star' && rsi === 'star') return true;
  if (p4k === 'planet' && ['planet', 'dwarf planet'].includes(rsi)) return true;
  if (p4k === 'moon' && ['moon', 'satellite'].includes(rsi)) return true;
  return false;
}

function inferSystemCode(location: { name: string; type: string; system_code: string | null; class_name?: string | null }): string {
  if (location.system_code) return location.system_code.toUpperCase();

  const type = normalizeStarmapType(location.type);
  if (type !== 'star') return '';

  const fromName = normalizeForMatch(location.name)
    .replace(/\b(system|star|sun)\b/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (fromName) return fromName.toUpperCase();

  const fromClass = normalizeForMatch(location.class_name ?? '')
    .replace(/\b(solar|system|star|sun)\b/g, '')
    .replace(/\s+/g, '')
    .trim();
  return fromClass.toUpperCase();
}

/**
 * Cross-reference P4K StarMapObject locations with RSI/SC Wiki starmap records.
 *
 * The sources overlap but are not equivalent:
 * - game.locations is the in-game/DataForge view (coordinates, hierarchy, loc keys).
 * - rsi.starmap_locations is the official web/lore view (status, affiliations, descriptions, web URLs).
 */
export async function crossReferenceStarmapLocations(conn: PoolClient, env: GameEnv): Promise<number> {
  await conn.query('UPDATE game.locations SET rsi_starmap_location_id = NULL WHERE env = $1', [env]);

  const { rows: locations } = await conn.query<{
    uuid: string;
    name: string;
    type: string;
    system_code: string | null;
    class_name: string | null;
  }>('SELECT uuid, class_name, name, type, system_code FROM game.locations WHERE env = $1', [env]);

  const { rows: rsiLocations } = await conn.query<{
    id: number;
    name: string;
    type: string;
    system_code: string | null;
    system_name: string | null;
  }>('SELECT id, name, type, system_code, system_name FROM rsi.starmap_locations');

  const rsiBySystem = new Map<string, typeof rsiLocations>();
  for (const rsi of rsiLocations) {
    const key = (rsi.system_code ?? '').toUpperCase();
    if (!key) continue;
    const list = rsiBySystem.get(key) ?? [];
    list.push(rsi);
    rsiBySystem.set(key, list);
  }

  const links: Array<{ uuid: string; rsiId: number }> = [];

  for (const location of locations) {
    const systemCode = inferSystemCode(location);
    if (!systemCode) continue;

    const candidates = (rsiBySystem.get(systemCode) ?? []).filter((rsi) => areStarmapTypesCompatible(location.type, rsi.type));
    if (!candidates.length) continue;

    let best: { id: number; score: number } | null = null;
    for (const candidate of candidates) {
      const score = locationMatchScore(location.name, candidate.name, candidate.system_name);
      if (!best || score > best.score) best = { id: candidate.id, score };
    }

    if (best && best.score >= 70) links.push({ uuid: location.uuid, rsiId: best.id });
  }

  for (const link of links) {
    await conn.query('UPDATE game.locations SET rsi_starmap_location_id = $1 WHERE uuid = $2 AND env = $3', [link.rsiId, link.uuid, env]);
  }

  if (links.length > 0) logger.info(`Linked ${links.length} P4K locations to RSI starmap entries`);
  return links.length;
}

/** Copy chassis_id from ship_matrix to ships for fast variant grouping */
export async function populateChassisId(conn: PoolClient, env: GameEnv): Promise<number> {
  const result = await conn.query<any>(
    `UPDATE game.ships s SET chassis_id = sm.chassis_id
     FROM rsi.ship_matrix sm
     WHERE s.ship_matrix_id = sm.id AND s.env = $1 AND s.ship_matrix_id IS NOT NULL`,
    [env],
  );
  const count = result.rowCount ?? 0;
  if (count > 0) logger.info(`Populated chassis_id for ${count} ships`);
  return count;
}

/** Tag variant types for ships not linked to Ship Matrix */
export async function tagVariantTypes(conn: PoolClient, env: GameEnv): Promise<void> {
  // Tag SM-linked ships that are ultra-rare collectors
  await conn.query(
    "UPDATE game.ships SET variant_type = 'collector' WHERE class_name IN ('VNCL_Scythe', 'ANVL_Lightning_F8C_Exec') AND variant_type IS NULL AND env = $1",
    [env],
  );
  const rules: Array<{ type: string; patterns: string[] }> = [
    // collector: true limited/exclusive editions (only 2 today)
    {
      type: 'collector',
      patterns: [
        '%_Executive_Edition', // ORIG_600i_Executive_Edition
        '%_Dragonfly_Pink', // DRAK_Dragonfly_Pink (Star Kitten)
      ],
    },
    // wikelo: same chassis with alternate loadout/colors (Collector suffix, ATLS IKTI variants)
    {
      type: 'wikelo',
      patterns: [
        '%_Collector_%',
        '%_Collector',
        '%_ATLS_IKTI%', // ARGO_ATLS_IKTI, ARGO_ATLS_IKTI_ARGOS
        '%_ATLS_GEO_Collector%', // ARGO_ATLS_GEO_Collector_Grad01/02/03
      ],
    },
    // pyam_exec: PYAM Exec program variants + Scorpius Stealth / Ursa Medivac Stealth
    {
      type: 'pyam_exec',
      patterns: ['%_Exec_%', '%_Exec', 'RSI_Scorpius_Stealth', 'RSI_Ursa_Medivac_Stealth'],
    },
    { type: 'bis_edition', patterns: ['%_BIS%'] },
    { type: 'tutorial', patterns: ['%_Teach%', '%Tutorial%'] },
    // npc: enemy AI, pirate, and showdown ships — NPC-only, pruned at extraction
    { type: 'npc', patterns: ['%_EA_%', '%_EA', '%_PIR%', '%Pirate%', '%_Showdown'] },
    { type: 'military', patterns: ['%_Military%', '%_UEE%', '%_Advocacy%'] },
    { type: 'event', patterns: ['%Fleetweek%', '%_FW%', '%CitizenCon%', '%ShipShowdown%'] },
    { type: 'arena_ai', patterns: ['%_Swarm%'] },
  ];

  for (const rule of rules) {
    // $1 = type, $2 .. $N = patterns, $(N+1) = env
    let paramIdx = 1;
    const conditions = rule.patterns.map(() => `class_name LIKE $${++paramIdx}`).join(' OR ');
    const envIdx = ++paramIdx;
    await conn.query(
      `UPDATE game.ships SET variant_type = $1 WHERE ship_matrix_id IS NULL AND variant_type IS NULL AND (${conditions}) AND env = $${envIdx}`,
      [rule.type, ...rule.patterns, env],
    );
  }

  await conn.query("UPDATE game.ships SET variant_type = 'special' WHERE ship_matrix_id IS NULL AND variant_type IS NULL AND env = $1", [
    env,
  ]);
}

/**
 * Delete ships whose variant_type should not be visible in the application.
 * Called after tagVariantTypes so that all ships have been classified first.
 *
 * Excluded:
 *  - bis_edition  → promo skins, the base ship is already linked via SM
 *  - event        → time-limited event variants (Fleetweek, CitizenCon, ShipShowdown…)
 *  - military     → NPC-only military/advocacy variants
 *  - tutorial     → solo tutorial ships not available in the PU
 *  - special      → miscellaneous one-off ships (NoInterior, Piano, etc.)  already narrowed
 *                   down because ATLS IKTI / Dragonfly Pink were re-tagged as collector
 *  - arena_ai     → swarm AI ships used only in Arena Commander
 *  - npc          → NPC-only ships (EA, pirate packages, Hammerhead Showdown…)
 *
 * Ships tagged pyam_exec, collector, or wikelo are kept.
 * Cascading FK deletes will clean ship_loadouts, ship_modules, ship_paints automatically.
 */
export async function pruneExcludedVariants(conn: PoolClient, env: GameEnv): Promise<number> {
  const EXCLUDED = ['bis_edition', 'event', 'military', 'tutorial', 'special', 'arena_ai', 'npc'];
  const placeholders = EXCLUDED.map((_, i) => `$${i + 1}`).join(', ');
  const result = await conn.query<any>(`DELETE FROM game.ships WHERE variant_type IN (${placeholders}) AND env = $${EXCLUDED.length + 1}`, [
    ...EXCLUDED,
    env,
  ]);
  const count = result.rowCount ?? 0;
  if (count > 0) logger.info(`Pruned ${count} ships with excluded variant types (bis, event, military, tutorial, special, arena, npc)`);
  return count;
}

/** Apply Hull series cargo fallback from Ship Matrix data */
export async function applyHullSeriesCargoFallback(conn: PoolClient, env: GameEnv): Promise<void> {
  try {
    const result = await conn.query<any>(
      `UPDATE game.ships s SET cargo_capacity = sm.cargocapacity
       FROM rsi.ship_matrix sm
       WHERE s.ship_matrix_id = sm.id
         AND s.env = $1
         AND (s.cargo_capacity IS NULL OR s.cargo_capacity = 0)
         AND sm.cargocapacity IS NOT NULL AND sm.cargocapacity > 0
         AND s.class_name LIKE '%Hull_%'`,
      [env],
    );
    if ((result.rowCount ?? 0) > 0) {
      logger.info(`Hull series cargo fallback applied to ${result.rowCount} ships`);
    }
  } catch (e: unknown) {
    logger.warn(`Hull cargo fallback failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Apply dimensions fallback from Ship Matrix when P4K bbox is missing (size_y = NULL or 0).
 * Maps SM columns: beam → size_x (width), length → size_y (length), height → size_z (height).
 */
export async function applyDimensionsFallback(conn: PoolClient, env: GameEnv): Promise<void> {
  try {
    const result = await conn.query<any>(
      `UPDATE game.ships s SET size_x = sm.beam, size_y = sm.length, size_z = sm.height
       FROM rsi.ship_matrix sm
       WHERE s.ship_matrix_id = sm.id
         AND s.env = $1
         AND (s.size_y IS NULL OR s.size_y = 0)
         AND sm.length IS NOT NULL AND sm.length > 0`,
      [env],
    );
    if ((result.rowCount ?? 0) > 0) {
      logger.info(`Dimensions fallback (Ship Matrix) applied to ${result.rowCount} ships`);
    }
  } catch (e: unknown) {
    logger.warn(`Dimensions fallback failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
