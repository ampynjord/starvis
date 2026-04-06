/**
 * Political affiliations for Star Citizen locations.
 *
 * Maps location class_name (lowercase) → faction/organization.
 * Source: RSI lore and in-game faction data.
 *
 * Factions:
 *   UEE         — United Empire of Earth (main government)
 *   Crusader    — Crusader Industries (Stanton II)
 *   microTech   — microTech corporation (Stanton IV)
 *   Hurston     — Hurston Dynamics (Stanton I)
 *   ArcCorp     — ArcCorp corporation (Stanton III)
 *   Outlaw      — Outlaw factions (Nine Tails, etc.)
 *   XenoThreat  — XenoThreat faction
 *   Independent — No dominant faction
 *   Neutral     — Neutral / unclaimed
 */

export type PoliticalAffiliation =
  | 'UEE'
  | 'Crusader'
  | 'microTech'
  | 'Hurston'
  | 'ArcCorp'
  | 'Outlaw'
  | 'XenoThreat'
  | 'Independent'
  | 'Neutral';

/** class_name (lowercased) → affiliation */
const AFFILIATION_MAP: Record<string, PoliticalAffiliation> = {
  // ── Stanton I — Hurston (ArcCorp owns but Hurston Dynamics dominates) ──
  stanton1:                    'Hurston',
  stanton1lz01:                'Hurston',   // Lorville
  lorville:                    'Hurston',

  // ── Stanton II — Crusader ──
  stanton2:                    'Crusader',
  stanton2lz01:                'Crusader',  // Port Olisar (decommissioned)
  portolisar:                  'Crusader',
  stanton2lz02:                'Crusader',  // Seraphim Station
  cru_l1:                      'Crusader',
  cru_l2:                      'Crusader',
  cru_l3:                      'Crusader',
  cru_l4:                      'Crusader',
  cru_l5:                      'Crusader',
  stanton2a:                   'Crusader',  // Daymar
  stanton2b:                   'Crusader',  // Cellin
  stanton2c:                   'Crusader',  // Yela
  stanton2b01:                 'Crusader',  // Klescher (prison)
  klescher:                    'UEE',

  // ── Stanton III — ArcCorp ──
  stanton3:                    'ArcCorp',
  stanton3lz01:                'ArcCorp',   // Area 18
  area18:                      'ArcCorp',
  arc_corp:                    'ArcCorp',
  stanton3a:                   'ArcCorp',   // Lyria
  stanton3b:                   'ArcCorp',   // Wala

  // ── Stanton IV — microTech ──
  stanton4:                    'microTech',
  stanton4lz01:                'microTech',  // New Babbage
  newbabbage:                  'microTech',
  microtech:                   'microTech',
  stanton4a:                   'microTech',  // Calliope
  stanton4b:                   'microTech',  // Clio
  stanton4c:                   'microTech',  // Euterpe

  // ── UEE space stations / jump points ──
  stanton:                     'UEE',
  stantonl1:                   'UEE',
  stantonl2:                   'UEE',
  stantonl3:                   'UEE',
  stantonl4:                   'UEE',
  stantonl5:                   'UEE',
  magda:                       'UEE',        // Magnus system
  magnus:                      'UEE',

  // ── Outlaw / contested locations ──
  grimhex:                     'Outlaw',     // Nine Tails stronghold (Yela asteroid)
  stanton2c01:                 'Outlaw',
  levski:                      'Independent',
  delamar:                     'Independent',

  // ── Pyro (independent / lawless) ──
  pyro:                        'Independent',
  pyro1:                       'Independent',
  pyro2:                       'Independent',
  pyro3:                       'Independent',
  pyro4:                       'Independent',
  pyro5:                       'Independent',
  pyro6:                       'Independent',
  ruin_station:                'Independent',
  checkmate:                   'Independent',
  orbituary:                   'Independent',

  // ── Nyx (Independent) ──
  nyx:                         'Independent',
  nyx1:                        'Independent',
  nyx2:                        'Independent',
  nyx3:                        'Independent',
};

/**
 * Return the political affiliation for a location by its class_name.
 * Falls back to 'UEE' if no specific affiliation is known.
 */
export function getAffiliation(className: string): PoliticalAffiliation | null {
  const key = className.toLowerCase().replace(/[^a-z0-9]/g, '');
  return AFFILIATION_MAP[key] ?? null;
}

/**
 * Annotate a location row with its affiliation.
 * Returns the same object with `affiliation` added (null if unknown).
 */
export function annotateWithAffiliation<T extends { class_name?: string }>(row: T): T & { affiliation: PoliticalAffiliation | null } {
  return {
    ...row,
    affiliation: row.class_name ? getAffiliation(row.class_name) : null,
  };
}
