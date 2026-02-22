/**
 * DataForge Utilities — Pure constants, helpers, and shared types
 * Used by DataForgeService and extraction modules (component, shop, paint).
 */
import type { DataForgeData, RecordDef } from './dataforge-parser.js';

// ============ Shared context interface for extractors ============

/**
 * Interface exposing the DataForgeService capabilities needed by extraction modules.
 * Avoids circular dependency: extractors depend on this interface, not the concrete class.
 */
export interface DataForgeContext {
  getDfData(): DataForgeData | null;
  readInstance(structIndex: number, variantIndex: number, depth?: number, maxDepth?: number): Record<string, any> | null;
  readRecordByGuid(guid: string, maxDepth?: number): Record<string, any> | null;
  resolveGuid(guid: string): string | undefined;
  findEntityRecord(entityClassName: string): RecordDef | null;
}

// ============ Manufacturer codes ============

/** Manufacturer code → full name mapping (from SC game data prefixes) */
export const MANUFACTURER_CODES: Record<string, string> = {
  // Vehicle manufacturers (ship_matrix + P4K)
  AEGS: 'Aegis Dynamics',
  ANVL: 'Anvil Aerospace',
  ARGO: 'ARGO Astronautics',
  BANU: 'Banu',
  CNOU: 'Consolidated Outland',
  CRUS: 'Crusader Industries',
  DRAK: 'Drake Interplanetary',
  ESPR: 'Esperia',
  GAMA: 'Gatac Manufacture',
  GLSN: "Grey's Market",
  GREY: "Grey's Market",
  GRIN: 'Greycat Industrial',
  KRIG: 'Kruger Intergalactic',
  MISC: 'Musashi Industrial & Starflight Concern',
  MRAI: 'Mirai',
  ORIG: 'Origin Jumpworks',
  RSI: 'Roberts Space Industries',
  TMBL: 'Tumbril Land Systems',
  VNCL: 'Vanduul',
  XIAN: 'Aopoa',
  XNAA: 'Aopoa',
  // Component manufacturers (P4K only)
  AMRS: 'Amon & Reese Co.',
  APAR: 'Apocalypse Arms',
  BEHR: 'Behring Applied Technology',
  BRRA: 'Basilisk',
  GATS: 'Gallenson Tactical Systems',
  HRST: 'Hurston Dynamics',
  JOKR: 'Joker Engineering',
  KBAR: 'KnightBridge Arms',
  KLWE: 'Klaus & Werner',
  KRON: 'Kroneg',
  MXOX: 'MaxOx',
  NOVP: 'Nova Pyrotechnik',
  PRAR: 'Preacher Armaments',
  TALN: 'Talon',
  TOAG: 'Thermyte Concern',
};

// ============ Shop localization names ============

/** Known shop names (LOC keys → readable names) */
export const SHOP_LOC_NAMES: Record<string, string> = {
  '@item_NameShop_CenterMass': 'CenterMass',
  '@item_NameShop_CasabaOutlet': 'Casaba Outlet',
  '@item_NameShop_DumpersDepot': "Dumper's Depot",
  '@item_NameShop_AstroArmada': 'Astro Armada',
  '@item_NameShop_NewDeal': 'New Deal',
  '@item_NameShop_TeachsShipShop': "Teach's Ship Shop",
  '@item_NameShop_CubbyBlast': 'Cubby Blast',
  '@item_NameShop_PortOlisar': 'Port Olisar',
  '@item_NameShop_GrimHex': 'GrimHEX',
  '@item_NameShop_Regal': 'Regal Luxury Rentals',
  '@item_NameShop_Cordrys': "Cordry's",
  '@item_NameShop_Vantage': 'Vantage Rentals',
  '@item_NameShop_FTL': 'FTL Transports',
  '@item_NameShop_Shubin': 'Shubin Interstellar',
  '@item_NameShop_TDD': 'Trade & Development Division',
  '@item_NameShop_KCTrading': 'KC Trending',
  '@item_NameShop_Traveler': 'Traveler Rentals',
  '@item_NameShop_Aparelli': 'Aparelli',
  '@item_NameShop_FactoryLine': 'Factory Line',
  '@item_NameShop_TammanyAndSons': 'Tammany and Sons',
  '@item_NameShop_Skutters': 'Skutters',
  '@item_NameShop_ConscientiousObjects': 'Conscientious Objects',
  '@item_NameShop_HurstonDynamics': 'Hurston Dynamics Showroom',
  '@item_NameShop_Microtech': 'mTech',
  '@item_NameShop_ArcCorp': 'ArcCorp',
  '@item_NameShop_OmegaPro': 'Omega Pro',
  '@item_NameShop_GarrityDefense': 'Garrity Defense',
  '@item_NameShop_PlatinumBay': 'Platinum Bay',
  '@item_NameShop_CousinCrows': "Cousin Crow's Custom Crafts",
  '@item_NameShop_LiveFire': 'Live Fire Weapons',
  '@item_NameShop_Refinery': 'Refinery',
  '@item_NameShop_CrusaderIndustries': 'Crusader Industries',
  '@item_NameShop_ProcyonCDF': 'Procyon CDF',
  '@item_NameShop_MakauDefense': 'Makau Defense',
  '@item_NameShop_KelTo': 'Kel-To',
  '@item_NameShop_CrusaderProvidenceSurplus': 'Crusader Providence Surplus',
  '@item_NameShop_FTA': 'Federal Trade Alliance',
};

// ============ Localization helpers ============

/** Resolve SC localization keys to display strings */
export function resolveLocKey(locKey: string, type: 'career' | 'role'): string {
  if (!locKey || !locKey.startsWith('@')) return locKey || '';

  const CAREER_MAP: Record<string, string> = {
    '@vehicle_focus_combat': 'Combat',
    '@vehicle_focus_transporter': 'Transporter',
    '@vehicle_focus_industrial': 'Industrial',
    '@vehicle_focus_competition': 'Competition',
    '@vehicle_focus_exploration': 'Exploration',
    '@vehicle_focus_support': 'Support',
    '@vehicle_focus_gunship': 'Gunship',
    '@vehicle_focus_multirole': 'Multi-Role',
    '@vehicle_focus_starter': 'Starter',
    '@vehicle_focus_ground': 'Ground',
    '@vehicle_focus_groundcombat': 'Ground Combat',
  };

  const ROLE_MAP: Record<string, string> = {
    '@vehicle_class_lightfighter': 'Light Fighter',
    '@vehicle_class_mediumfighter': 'Medium Fighter',
    '@vehicle_class_heavyfighter': 'Heavy Fighter',
    '@vehicle_class_heavyfighter_bomber': 'Heavy Fighter / Bomber',
    '@vehicle_class_interceptor': 'Interceptor',
    '@vehicle_class_stealthfighter': 'Stealth Fighter',
    '@vehicle_class_stealthbomber': 'Stealth Bomber',
    '@vehicle_class_bomber': 'Bomber',
    '@vehicle_class_heavybomber': 'Heavy Bomber',
    '@vehicle_class_snubfighter': 'Snub Fighter',
    '@vehicle_class_gunship': 'Gunship',
    '@vehicle_class_heavygunship': 'Heavy Gunship',
    '@vehicle_class_dropship': 'Dropship',
    '@vehicle_class_lightfreight': 'Light Freight',
    '@vehicle_class_mediumfreight': 'Medium Freight',
    '@vehicle_class_heavyfreight': 'Heavy Freight',
    '@vehicle_class_lightfreight_mediumfighter': 'Light Freight / Medium Fighter',
    '@vehicle_class_mediumfreight_gunship': 'Medium Freight / Gun Ship',
    '@vehicle_class_mediumfreightgunshio': 'Medium Freight / Gun Ship',
    '@vehicle_class_mediumfreightgunship': 'Medium Freight / Gun Ship',
    '@vehicle_class_starter_lightfreight': 'Starter / Light Freight',
    '@vehicle_class_starterlightfreight': 'Starter / Light Freight',
    '@vehicle_class_starter_pathfinder': 'Starter / Pathfinder',
    '@vehicle_class_starterpathfinder': 'Starter / Pathfinder',
    '@vehicle_class_starter_lightmining': 'Starter / Light Mining',
    '@vehicle_class_startermining': 'Starter / Mining',
    '@vehicle_class_starter_lightsalvage': 'Starter / Light Salvage',
    '@vehicle_class_startersalvage': 'Starter / Salvage',
    '@vehicle_class_heavyfighterbomber': 'Heavy Fighter / Bomber',
    '@vehicle_class_expedition': 'Expedition',
    '@vehicle_class_pathfinder': 'Pathfinder',
    '@vehicle_class_touring': 'Touring',
    '@vehicle_class_luxurytouring': 'Luxury Touring',
    '@vehicle_class_passenger': 'Passenger',
    '@vehicle_class_modular': 'Modular',
    '@vehicle_class_generalist': 'Generalist',
    '@vehicle_class_racing': 'Racing',
    '@vehicle_class_medical': 'Medical',
    '@vehicle_class_recovery': 'Recovery',
    '@vehicle_class_reporting': 'Reporting',
    '@vehicle_class_combat': 'Combat',
    '@vehicle_class_interdiction': 'Interdiction',
    '@vehicle_class_lightsalvage': 'Light Salvage',
    '@vehicle_class_heavysalvage': 'Heavy Salvage',
    '@vehicle_class_lightmining': 'Light Mining',
    '@vehicle_class_mediummining': 'Medium Mining',
    '@vehicle_class_lightscience': 'Light Science',
    '@vehicle_class_mediumdata': 'Medium Data',
    '@vehicle_class_heavyrefuelling': 'Heavy Refuelling',
    '@vehicle_class_frigate': 'Frigate',
    '@vehicle_class_corvette': 'Corvette',
    '@vehicle_class_antivehicle': 'Anti-Vehicle',
    '@vehicle_class_antiair': 'Anti-Air',
    '@vehicle_class_heavytank': 'Heavy Tank',
    '@vehicle_class_lighttank': 'Light Tank',
    '@item_shipfocus_heavygunship': 'Heavy Gunship',
    '@item_shipfocus_lightfighter': 'Light Fighter',
  };

  const key = locKey.toLowerCase();
  if (type === 'career' && CAREER_MAP[key]) return CAREER_MAP[key];
  if (type === 'role' && ROLE_MAP[key]) return ROLE_MAP[key];

  // Fallback: try to parse from key pattern
  let raw = locKey;
  for (const prefix of ['@vehicle_focus_', '@vehicle_class_', '@item_ShipFocus_', '@item_shipfocus_']) {
    if (raw.toLowerCase().startsWith(prefix)) {
      raw = raw.substring(prefix.length);
      break;
    }
  }
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Convert a component className like "KLWE_LaserRepeater_S1" to a readable
 * display name. Strips _SCItem suffix, manufacturer prefix, and converts to spaced words.
 */
export function resolveComponentName(className: string): string {
  let name = className;
  name = name.replace(/_SCItem$/i, '');
  name = name.replace(/^(POWR|COOL|SHLD|QDRV|MISL|RADR|WEPN|TURR)_/i, '');
  name = name.replace(/^[A-Z]{3,5}_/, '');
  name = name.replace(/_/g, ' ');
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  return name.trim();
}

// ============ Port type classifier ============

export function classifyPort(portName: string, compClassName: string): string {
  const lp = portName.toLowerCase();
  const cc = (compClassName || '').toLowerCase();

  // Component-based classification
  if (cc) {
    if (
      cc.includes('cannon_s') ||
      cc.includes('repeater_s') ||
      cc.includes('gatling_s') ||
      cc.includes('scattergun_s') ||
      cc.includes('machinegun_s') ||
      cc.includes('neutrongun_s') ||
      cc.includes('laser_beak_') ||
      cc.includes('tarantula') ||
      (cc.includes('weapon') && cc.match(/_s\d/) && !cc.includes('rack') && !cc.includes('turret') && !cc.includes('mount'))
    )
      return 'WeaponGun';
    if (cc.includes('mount_gimbal_') || cc.includes('mount_fixed_')) return 'Gimbal';
    if (cc.includes('turret_') || cc.startsWith('vtol_')) return 'Turret';
    if (cc.includes('mrck_') || cc.includes('missilerack')) return 'MissileRack';
  }

  if (
    (lp.includes('_gun_') || lp.includes('weapon_gun')) &&
    !lp.includes('gunner') &&
    !lp.includes('gunrack') &&
    !lp.includes('seat') &&
    !lp.includes('inventory')
  )
    return 'WeaponGun';
  if (
    lp.match(/hardpoint_weapon(_|$)/) &&
    !lp.includes('locker') &&
    !lp.includes('cabinet') &&
    !lp.includes('controller') &&
    !lp.includes('missile') &&
    !lp.includes('rack') &&
    !lp.includes('mount') &&
    !lp.includes('cockpit') &&
    !lp.includes('salvage') &&
    !lp.includes('tractor')
  )
    return 'WeaponGun';
  if (lp.match(/hardpoint_weapon_wing/)) return 'WeaponGun';
  if (lp.includes('turret')) return 'Turret';
  if (lp.includes('shield')) return 'Shield';
  if (lp.includes('power_plant') || lp.includes('powerplant')) return 'PowerPlant';
  if (lp.includes('cooler')) return 'Cooler';
  if ((lp.includes('quantum') && !lp.includes('interdiction') && !lp.includes('qed')) || lp.includes('quantum_drive'))
    return 'QuantumDrive';
  if (lp.includes('missile') || lp.includes('pylon')) return 'MissileRack';
  if (lp.includes('radar')) return 'Radar';
  if (lp.includes('countermeasure')) return 'Countermeasure';
  if (lp.includes('controller_flight')) return 'FlightController';
  if (lp.includes('thruster')) return 'Thruster';
  if (
    lp.includes('emp_device') ||
    lp.includes('emp_generator') ||
    (lp.includes('emp') && !lp.includes('temp') && !lp.match(/seat|access|dashboard|hud|inventory|weapon_?port/i))
  )
    return 'EMP';
  if (cc.includes('emp_device') || cc.includes('emp_generator') || cc.includes('emp_s')) return 'EMP';
  if (lp.includes('interdiction') || lp.includes('qig') || lp.includes('qed')) return 'QuantumInterdictionGenerator';
  if (cc.includes('quantuminterdiction') || cc.includes('qig_') || cc.includes('qed_') || cc.includes('qdmp_'))
    return 'QuantumInterdictionGenerator';
  if (
    lp.includes('weapon_rack') ||
    lp.includes('weaponrack') ||
    lp.includes('weapon_locker') ||
    lp.includes('weaponlocker') ||
    lp.includes('weapon_cabinet')
  )
    return 'WeaponRack';
  if (lp.includes('weapon') && (lp.includes('controller') || lp.includes('cockpit') || lp.includes('locker'))) return 'Other';
  if (lp.includes('weapon') && !lp.includes('rack')) return 'Weapon';
  return 'Other';
}
