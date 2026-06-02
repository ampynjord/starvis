/**
 * LocationExtractor — StarMapObject records from DataForge
 *
 * Extracts all navigable / discoverable locations from the Star Citizen universe:
 *   Systems, Planets, Moons, Landing Zones, Stations, Rest Stops, Outposts,
 *   Comm Arrays, Asteroid Fields, Jump Points, Mining Claims, Junk Sites, Warehouses
 *
 * Classification uses the DataForge record file path (fileName field).
 * Names are resolved via the localization service (global.ini LOC keys).
 */

import locationExtractorConfig from './data/location-extractor-config.json' with { type: 'json' };
import type { DataForgeContext } from './dataforge-utils.js';
import logger from './logger.js';

export interface LocationRecord {
  uuid: string;
  className: string;
  name: string;
  type: string;
  systemCode: string | null;
  parentUuid: string | null;
  locKey: string | null;
  description: string | null;
  coordinates: Record<string, number> | null;
  p4kPath: string | null;
  rawJson: Record<string, unknown> | null;
  isScannable: boolean;
  hideInStarmap: boolean;
}

export interface LocationLocAdapter {
  resolveKey(rawKey: string): string | null;
}

// ── Types that appear in the starmap ──────────────────────────────────────────

/**
 * Classify a StarMapObject by its DataForge file path.
 * Returns the location type string, or null to skip this record.
 */
function classifyByPath(filePath: string): string | null {
  const fp = filePath.replace(/\\/g, '/').toLowerCase();

  // Skip internal / template entries
  if (
    fp.includes('/mission_item/') ||
    fp.includes('/test/') ||
    fp.includes('/template') ||
    fp.includes('template.xml') ||
    fp.endsWith('_template.xml') ||
    // Internal UI / system markers at root pu/ level
    /\/(cardinalpoint|placeholder|youareheremarker|specialevent|youarehere)\d*\.xml$/.test(fp)
  )
    return null;

  // ── System-level ──
  if (/solarsystem\.xml$/.test(fp)) return 'system';

  // ── Jump Points ──
  if (fp.includes('jumppoint')) return 'jump_point';

  // ── Asteroid-related ──
  if (
    fp.includes('asteroidcluster') ||
    fp.includes('asteroidring') ||
    fp.includes('asteroidbelt') ||
    fp.includes('glaciemring') ||
    fp.includes('keegebelt') ||
    fp.includes('keegerbelt') ||
    fp.includes('nyx_kaboos')
  )
    return 'asteroid_field';

  // ── Main celestial body record ──
  // Pattern: /system/SYSNAME/FOLDER/FOLDER.xml  or  /system/SYSNAME/FOLDER/starmapobject.FOLDER.xml
  // where the file name (stem) equals the folder name → this IS the body record.
  // e.g. /system/stanton/stanton2/starmapobject.stanton2.xml  → planet
  //      /system/stanton/stanton2c/starmapobject.stanton2c.xml → moon
  //      /system/stanton/stantonstar/starmapobject.stantonstar.xml → star
  //      /system/pyro/pyro1/pyro1.xml → planet
  //      /system/nyx/delamar/starmapobject.delamar.xml → planet/asteroid
  const celestialMatch = fp.match(/\/system\/[^/]+\/([^/]+)\/(?:starmapobject\.\1|\1)\.xml$/);
  if (celestialMatch) {
    const folder = celestialMatch[1];
    if (folder.includes('star') || folder.includes('sun')) return 'star';
    if (/[a-z]+\d+[a-z]+$/.test(folder)) return 'moon'; // digit(s) then letter(s) suffix
    return 'planet';
  }

  // ── Depth-0 star (e.g. /system/nyx/nyxstar.xml) ──
  if (/\/system\/[^/]+\/[a-z]*(?:star|sun)[^/]*\.xml$/.test(fp)) return 'star';

  // ── Sub-locations under a moon folder (SYSNAMEdigit+letter) ──
  if (/\/system\/[^/]+\/[a-z]+\d+[a-z]+\//.test(fp)) {
    if (fp.includes('/landingzone/')) return 'landing_zone';
    if (fp.includes('/outpost/')) return 'outpost';
    if (fp.includes('/commarray/') || fp.includes('/comm_array/')) return 'comm_array';
    if (fp.includes('/miningclaim/') || fp.includes('/mining_claim/')) return 'mining_claim';
    if (fp.includes('/junksite/') || fp.includes('/junk_site/')) return 'junk_site';
    if (fp.includes('/distributioncentre/') || fp.includes('/distribution_centre/')) return 'warehouse';
    if (fp.includes('/cave/')) return 'cave';
    if (fp.includes('/ruins/')) return 'ruins';
    if (fp.includes('/ugf/')) return 'bunker';
    // Direct children of a moon folder (no category sub-folder)
    // e.g. stanton1b/stanton1b_hurdynmining_hdmsanderson.xml (outpost on moon)
    //      stanton1a/stanton1_comm002.xml (comm array on moon)
    if (/\/system\/[^/]+\/[a-z]+\d+[a-z]+\/[^/]+\.xml$/.test(fp)) {
      if (fp.includes('_comm')) return 'comm_array';
      return 'outpost';
    }
    return null;
  }

  // ── Sub-locations under a planet folder (SYSNAMEdigit only) ──
  if (/\/system\/[^/]+\/[a-z]+\d+\//.test(fp)) {
    if (fp.includes('/landingzone/')) return 'landing_zone';
    if (fp.includes('/floatingislands/') || fp.includes('/floating_islands/')) return 'landing_zone';
    if (fp.includes('/secondarycities/') || fp.includes('/secondary_cities/')) return 'landing_zone';
    if (fp.includes('/conventioncenter/') || fp.includes('/convention_center/')) return 'landing_zone';
    if (fp.includes('/orbiting/')) return 'station';
    if (fp.includes('/outpost/')) return 'outpost';
    if (fp.includes('/commarray/') || fp.includes('/comm_array/')) return 'comm_array';
    if (fp.includes('/miningclaim/') || fp.includes('/mining_claim/')) return 'mining_claim';
    if (fp.includes('/junksite/') || fp.includes('/junk_site/')) return 'junk_site';
    if (fp.includes('/distributioncentre/') || fp.includes('/distribution_centre/')) return 'warehouse';
    if (fp.includes('/cave/')) return 'cave';
    if (fp.includes('/ruins/')) return 'ruins';
    if (fp.includes('/ugf/')) return 'bunker';
    // Direct children of a planet folder without a category sub-folder
    // e.g. stanton1/stanton1_hurdynmining_hdmsthedus.xml (outpost on planet surface)
    if (/\/system\/[^/]+\/[a-z]+\d+\/[^/]+\.xml$/.test(fp)) {
      if (fp.includes('_comm')) return 'comm_array';
      return 'outpost';
    }
    return null;
  }

  // ── Sub-locations under a named body (no digit) e.g. Delamar ──
  // e.g. /system/nyx/delamar/miningclaim/privateminingpoint_delamar_001.xml
  // e.g. /system/nyx/delamar/landingzone/nyx_levski.xml
  if (/\/system\/[^/]+\/[a-z]+\//.test(fp) && !/solarsystem\.xml$/.test(fp)) {
    if (fp.includes('/landingzone/')) return 'landing_zone';
    if (fp.includes('/outpost/')) return 'outpost';
    if (fp.includes('/commarray/') || fp.includes('/comm_array/')) return 'comm_array';
    if (fp.includes('/miningclaim/') || fp.includes('/mining_claim/')) return 'mining_claim';
    if (fp.includes('/junksite/') || fp.includes('/junk_site/')) return 'junk_site';
    if (fp.includes('/distributioncentre/') || fp.includes('/distribution_centre/')) return 'warehouse';
    if (fp.includes('/cave/')) return 'cave';
    if (fp.includes('/ruins/')) return 'ruins';
    if (fp.includes('/ugf/')) return 'bunker';
    return null;
  }

  // ── Stations ──
  if (fp.includes('/station/reststop/') || fp.includes('/reststop/')) return 'rest_stop';
  if (fp.includes('/station/motel/') || fp.includes('/motel/')) return 'station';
  if (fp.includes('/station/') || fp.includes('/spacestation/') || fp.includes('/orbital_station/')) return 'station';

  // ── Free-standing outposts in space (not under a planet) ──
  if (fp.includes('/outpost/')) return 'outpost';

  // ── Asteroid clusters directly under a system folder ──
  // e.g. /system/pyro/pyro_akirocluster.xml
  if (/\/system\/[^/]+\/[^/]+cluster[^/]+\.xml$/.test(fp)) return 'asteroid_field';

  return null;
}

/**
 * Extract system code from a DataForge file path or class name.
 * E.g. "starmap/pu/system/stanton/..." → "STANTON"
 */
function extractSystemCode(filePath: string, className?: string): string | null {
  const fp = filePath.replace(/\\/g, '/').toLowerCase();
  // Primary: /system/NAME/ path pattern
  const m = fp.match(/\/system\/([a-z]+)\//);
  if (m) return m[1].toUpperCase();
  // Secondary: class name contains system name as a whole word
  if (className) {
    const cn = className.toLowerCase();
    // Specific overrides FIRST — jump points are named after destination, not origin system
    if (cn === 'jumppoint_pyro' || cn === 'jumppoint_stanton') return 'NYX';
    if (cn === 'glaciemring') return 'NYX';
    if (cn === 'keegerbelt') return 'NYX';
    if (cn === 'asteroidcluster_miningbase') return 'NYX';
    // Generic keyword matching (must come after specific overrides)
    if (/(?:^|[_-])stanton(?:[_-]|$)/.test(cn)) return 'STANTON';
    if (/(?:^|[_-])pyro(?:[_-]|$)/.test(cn)) return 'PYRO';
    if (/(?:^|[_-])nyx(?:[_-]|$)/.test(cn)) return 'NYX';
  }
  return null;
}

const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

/**
 * Build a human-readable fallback name from a class name when LOC key fails.
 * E.g. "Stanton1_Lorville" → "Lorville", "RR_HUR_L1_CLINIC" → "RR HUR L1 Clinic"
 */
function fallbackName(className: string): string {
  // Remove struct prefix e.g. "StarMapObject."
  let name = className.replace(/^StarMapObject\./i, '');
  // Strip leading @ LOC patterns
  if (name.startsWith('@') || name === '@LOC_UNINITIALIZED') return className;
  // Replace underscores + title case
  name = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return name.trim() || className;
}

function extractCoordinates(data: Record<string, unknown>): Record<string, number> | null {
  const candidates = [data.position, data.Position, data.coordinates, data.Coordinates, data.location, data.Location];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const obj = candidate as Record<string, unknown>;
    const x = Number(obj.x ?? obj.X);
    const y = Number(obj.y ?? obj.Y);
    const z = Number(obj.z ?? obj.Z);
    if ([x, y, z].every(Number.isFinite)) return { x, y, z };
  }
  return null;
}

export function extractLocations(df: DataForgeContext, loc: LocationLocAdapter, onProgress?: (msg: string) => void): LocationRecord[] {
  const dfData = df.getDfData();
  if (!dfData) return [];

  const smoStructIdx = dfData.structDefs.findIndex((s) => s.name === 'StarMapObject');
  if (smoStructIdx === -1) {
    logger.warn('DataForge: no "StarMapObject" struct found', { module: 'location-extractor' });
    return [];
  }

  // ── Pass 1: build full UUID→parentUUID map for ALL StarMapObjects ──────────
  // This lets us resolve "orphaned" parents (e.g. stations whose direct parent
  // is a Lagrange-point object we don't extract).
  const smoParentMap = new Map<string, string>();
  for (const record of dfData.records) {
    if (record.structIndex !== smoStructIdx) continue;
    if (!record.id || record.id === ZERO_GUID) continue;
    const data = df.readInstance(record.structIndex, record.instanceIndex, 0, 1);
    if (!data) continue;
    const pRef = (data.parent?.__ref ?? data.Parent?.__ref ?? '') as string;
    if (pRef && pRef !== ZERO_GUID) smoParentMap.set(record.id, pRef);
  }

  // ── Pass 2: extract typed records ──────────────────────────────────────────
  const records: LocationRecord[] = [];
  const extractedUuids = new Set<string>();
  let seen = 0;
  let skipped = 0;

  for (const record of dfData.records) {
    if (record.structIndex !== smoStructIdx) continue;
    if (!record.id || record.id === ZERO_GUID) continue;

    seen++;
    const filePath = record.fileName ?? '';
    const type = classifyByPath(filePath);
    if (!type) {
      skipped++;
      continue;
    }

    const data = df.readInstance(record.structIndex, record.instanceIndex, 0, 2);
    if (!data) {
      skipped++;
      continue;
    }

    const className = (record.name ?? '').replace(/^StarMapObject\./, '');

    const rawLocKey = (data.name ?? data.Name ?? '') as string;
    let name: string | null = null;
    if (rawLocKey && !rawLocKey.startsWith('@LOC_UNINIT')) {
      name = loc.resolveKey(rawLocKey);
    }
    if (!name) name = fallbackName(className);

    const rawDescKey = (data.description ?? data.Description ?? '') as string;
    let description: string | null = null;
    if (rawDescKey && !rawDescKey.startsWith('@LOC_UNINIT')) {
      description = loc.resolveKey(rawDescKey);
    }

    const parentRef = (data.parent?.__ref ?? data.Parent?.__ref ?? '') as string;
    const rawParentUuid = parentRef && parentRef !== ZERO_GUID ? parentRef : null;

    const systemCode = extractSystemCode(filePath, className);
    const isScannable = Boolean(data.isScannable ?? data.IsScannable ?? false);
    const hideInStarmap = Boolean(data.hideInStarmap ?? data.HideInStarmap ?? false);
    const coordinates = extractCoordinates(data);

    records.push({
      uuid: record.id,
      className,
      name: name.substring(0, 255),
      type,
      systemCode,
      parentUuid: rawParentUuid,
      locKey: rawLocKey && rawLocKey !== '@LOC_UNINITIALIZED' ? rawLocKey.substring(0, 255) : null,
      description: description ? description.substring(0, 4000) : null,
      coordinates,
      p4kPath: filePath || null,
      rawJson: { record, data },
      isScannable,
      hideInStarmap,
    });
    extractedUuids.add(record.id);
  }

  // ── Pass 3: resolve orphaned parent UUIDs ──────────────────────────────────
  // Walk up the smoParentMap until we hit a UUID that was actually extracted,
  // or reach null. This fixes stations at Lagrange points whose direct parent
  // is a non-extracted orbital marker.
  let resolved = 0;
  for (const rec of records) {
    if (!rec.parentUuid || extractedUuids.has(rec.parentUuid)) continue;

    let pid: string | undefined = rec.parentUuid;
    const visited = new Set<string>();
    while (pid && !extractedUuids.has(pid)) {
      if (visited.has(pid)) break; // cycle guard
      visited.add(pid);
      pid = smoParentMap.get(pid);
    }
    const effectivePid = pid && extractedUuids.has(pid) ? pid : null;
    if (effectivePid !== rec.parentUuid) {
      rec.parentUuid = effectivePid;
      resolved++;
    }
  }

  if (resolved > 0) {
    logger.info(`Locations: resolved ${resolved} orphaned parent UUIDs via chain walk`, { module: 'location-extractor' });
  }

  // ── Pass 4: assign Lagrange rest-stops to their Stanton planet ─────────────
  // After pass 3 the chain walk re-parents e.g. RR_ARC_L1 to StantonStar
  // (the nearest extracted ancestor). We want them under the planet instead.
  // Mapping: class_name prefix → planet class_name
  const LAGRANGE_PREFIX_TO_PLANET: Record<string, string> = locationExtractorConfig.lagrangePrefixToPlanet;
  const planetUuidByClassName = new Map<string, string>();
  for (const rec of records) {
    if (rec.type === 'planet') planetUuidByClassName.set(rec.className.toLowerCase(), rec.uuid);
  }
  let lagrangeAssigned = 0;
  for (const rec of records) {
    if (rec.type === 'planet' || rec.type === 'system' || rec.type === 'star' || rec.type === 'moon') continue;
    const cn = rec.className.toLowerCase();
    for (const [prefix, planetCn] of Object.entries(LAGRANGE_PREFIX_TO_PLANET)) {
      if (cn.startsWith(prefix)) {
        const planetUuid = planetUuidByClassName.get(planetCn);
        if (planetUuid && rec.parentUuid !== planetUuid) {
          rec.parentUuid = planetUuid;
          lagrangeAssigned++;
        }
        break;
      }
    }
  }
  if (lagrangeAssigned > 0) {
    logger.info(`Locations: assigned ${lagrangeAssigned} Lagrange stations to Stanton planets`, { module: 'location-extractor' });
  }

  // ── Pass 5: path-based body assignment ────────────────────────────────────
  // For locations inside a planet/moon sub-folder (via DataForge file path),
  // re-parent them to the correct body when chain walk resolved too high.
  // E.g. Levski is at .../nyx/delamar/landingzone/... → parent should be Delamar
  const bodyUuidByFolder = new Map<string, string>();
  for (const rec of records) {
    if (rec.type !== 'planet' && rec.type !== 'moon') continue;
    // Body class_name (e.g. "Delamar", "Stanton1", "Stanton2c") → use lowercase as key
    bodyUuidByFolder.set(rec.className.toLowerCase(), rec.uuid);
  }

  // Build a map of record uuid → fileName for all extracted records (needed to check path)
  // We need the original filePath for each record — store it on the record during extraction.
  // Since we don't store filePath on LocationRecord, we re-use the class_name to infer folder.
  // Instead: scan all DataForge records to build uuid→fileName
  const uuidToFileName = new Map<string, string>();
  for (const dfRec of dfData.records) {
    if (dfRec.structIndex !== smoStructIdx) continue;
    if (dfRec.id && dfRec.id !== ZERO_GUID) uuidToFileName.set(dfRec.id, dfRec.fileName);
  }

  let pathAssigned = 0;
  for (const rec of records) {
    if (['system', 'planet', 'moon', 'star'].includes(rec.type)) continue;
    const filePath = uuidToFileName.get(rec.uuid);
    if (!filePath) continue;
    const fp = filePath.replace(/\\/g, '/').toLowerCase();
    // Match /system/SYSNAME/BODYNAME/ where BODYNAME != SYSNAME and not digits-only folder
    const m = fp.match(/\/system\/[^/]+\/([^/]+)\//);
    if (!m) continue;
    const bodyFolder = m[1]; // e.g. "delamar", "stanton2c", "stanton1"
    let bodyUuid = bodyUuidByFolder.get(bodyFolder);

    // Fallback: if bodyFolder is not a body (e.g. "station", "reststop"), try to infer
    // the parent body from the record's class name (e.g. "rr_pyro1_l1" → "pyro1")
    if (!bodyUuid) {
      const cn = rec.className.toLowerCase();
      for (const [bodyKey, uuid] of bodyUuidByFolder) {
        // Match body name as a word-boundary segment in the class name
        const escapedKey = bodyKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(?:^|[_-])${escapedKey}(?:[_-]|$)`).test(cn)) {
          bodyUuid = uuid;
          break;
        }
      }
    }

    if (!bodyUuid || rec.parentUuid === bodyUuid) continue;
    // Only re-assign if current parent is NOT the correct body
    // (don't override correct moon/planet parenting already done)
    rec.parentUuid = bodyUuid;
    pathAssigned++;
  }
  if (pathAssigned > 0) {
    logger.info(`Locations: path-assigned ${pathAssigned} records to their body`, { module: 'location-extractor' });
  }

  logger.info(`Locations: ${records.length} extracted (${seen} StarMapObject seen, ${skipped} skipped)`, {
    module: 'location-extractor',
  });
  onProgress?.(`Locations: ${records.length} extracted`);
  return records;
}
