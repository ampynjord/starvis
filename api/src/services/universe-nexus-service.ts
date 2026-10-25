import type { PrismaLike as PrismaClient } from '@starvis/db';
import { convertBigIntToNumber, type PaginatedResult, type Row, toPostgres } from './shared.js';

export type UniverseCategory =
  | 'ships'
  | 'fleet'
  | 'vehicles'
  | 'components'
  | 'armor'
  | 'clothing'
  | 'weapons'
  | 'utility'
  | 'ammo'
  | 'sustenance'
  | 'locations'
  | 'commodities'
  | 'items';

export interface UniverseOmniResult {
  id: string;
  uuid?: string;
  className?: string;
  name: string;
  category: UniverseCategory;
  subCategory?: string | null;
  type: string;
  subType?: string | null;
  manufacturer?: string | null;
  manufacturerCode?: string | null;
  thumbnail?: string | null;
  priceAuec?: number | null;
  storePriceUsd?: number | null;
  productionStatus?: string | null;
  size?: string | number | null;
  system?: string | null;
  badge?: {
    label: string;
    color: 'blue' | 'purple' | 'amber' | 'emerald' | 'cyan' | 'slate' | 'rose' | 'indigo' | 'lime';
  };
}

export interface UniverseExploreParams {
  category?: 'all' | UniverseCategory | string;
  subCategory?: string;
  sub_category?: string;
  search?: string;
  manufacturer?: string;
  type?: string;
  system?: string;
  status?: string;
  page?: number;
  limit?: number;
  env?: string;
  lang?: string;
}

export interface TaxonomySubCategory {
  id: string;
  label_fr: string;
  label_en: string;
  count: number;
}

export interface TaxonomyCategory {
  id: string;
  label_fr: string;
  label_en: string;
  icon: string;
  total: number;
  subCategories: TaxonomySubCategory[];
}

export const SUB_CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  // ships
  'flight-ready': { fr: 'En vol', en: 'Flight-Ready' },
  'in-concept': { fr: 'Concept', en: 'Concept' },
  lore: { fr: 'Lore / SQ42', en: 'Lore / SQ42' },
  // vehicles / components
  weapons: { fr: 'Armes & Gimbals', en: 'Weapons & Gimbals' },
  turrets: { fr: 'Tourelles', en: 'Turrets' },
  cm_launchers: { fr: 'Contre-mesures', en: 'Countermeasures' },
  missile_racks: { fr: 'Râteliers de missiles', en: 'Missile Racks' },
  power_plants: { fr: 'Générateurs', en: 'Power Plants' },
  ordnance: { fr: 'Missiles & Roquettes', en: 'Missiles & Rockets' },
  coolers: { fr: 'Refroidisseurs', en: 'Coolers' },
  radar: { fr: 'Radars', en: 'Radars' },
  shields: { fr: 'Boucliers', en: 'Shields' },
  quantum_drives: { fr: 'Propulseurs quantiques', en: 'Quantum Drives' },
  jump_modules: { fr: 'Modules de saut', en: 'Jump Modules' },
  mining: { fr: 'Minage & Rayons', en: 'Mining & Beams' },
  emp: { fr: 'IEM & Interdiction', en: 'EMP & Interdiction' },
  // armor
  core: { fr: 'Plastrons', en: 'Torso Core' },
  legs: { fr: 'Jambes', en: 'Legs' },
  arms: { fr: 'Bras', en: 'Arms' },
  undersuits: { fr: 'Combinaisons', en: 'Undersuits' },
  backpacks: { fr: 'Sacs à dos', en: 'Backpacks' },
  helmets: { fr: 'Casques', en: 'Helmets' },
  // clothing
  jackets: { fr: 'Vestes & Manteaux', en: 'Jackets & Coats' },
  legwear: { fr: 'Pantalons', en: 'Legwear' },
  shirts: { fr: 'Hauts & Chemises', en: 'Shirts & Tops' },
  footwear: { fr: 'Chaussures', en: 'Footwear' },
  headwear: { fr: 'Chapeaux & Casquettes', en: 'Headwear' },
  gloves: { fr: 'Gants', en: 'Gloves' },
  // weapons
  primary: { fr: 'Fusils & SMG', en: 'Primary Rifles & SMG' },
  attachments: { fr: 'Accessoires & Optiques', en: 'Attachments & Optics' },
  sidearms: { fr: 'Armes de poing', en: 'Sidearms' },
  melee: { fr: 'Mêlée & Couteaux', en: 'Melee & Knives' },
  special: { fr: 'Armes lourdes & Spécial', en: 'Special & Heavy' },
  throwables: { fr: 'Grenades & Jetables', en: 'Throwables' },
  // utility
  gadgets: { fr: 'Multi-outils & Gadgets', en: 'Multi-tools & Gadgets' },
  cryptokeys: { fr: 'Clés de piratage', en: 'Cryptokeys' },
  medical: { fr: 'Médical & Soins', en: 'Medical & Health' },
  // ammo
  magazines: { fr: 'Chargeurs & Munitions', en: 'Magazines & Ammo' },
  // sustenance
  food: { fr: 'Nourriture', en: 'Food' },
  drink: { fr: 'Boissons', en: 'Drinks' },
  // locations
  bunkers: { fr: 'Bunkers', en: 'Bunkers' },
  stations: { fr: 'Stations spatiales', en: 'Space Stations' },
  outposts: { fr: 'Avant-postes', en: 'Outposts' },
  landing_zones: { fr: 'Zones d’atterrissage', en: 'Landing Zones' },
  jump_points: { fr: 'Points de saut', en: 'Jump Points' },
  moons: { fr: 'Lunes', en: 'Moons' },
  planets: { fr: 'Planètes', en: 'Planets' },
  // commodities
  metals: { fr: 'Métaux', en: 'Metals' },
  minerals: { fr: 'Minéraux', en: 'Minerals' },
  gas: { fr: 'Gaz', en: 'Gases' },
  agricultural: { fr: 'Agricole & Alimentaire', en: 'Agricultural & Food' },
  vice: { fr: 'Vice & Illicite', en: 'Vice & Illicit' },
  waste: { fr: 'Déchets & Recyclage', en: 'Waste & Scrap' },
  goods: { fr: 'Biens manufacturés', en: 'Manufactured Goods' },
};

export const CATEGORY_META: Record<string, { label_fr: string; label_en: string; icon: string }> = {
  ships: { label_fr: 'Flotte & Vaisseaux', label_en: 'Fleet & Ships', icon: 'Rocket' },
  vehicles: { label_fr: 'Composants Véhicules', label_en: 'Vehicle Components', icon: 'Cpu' },
  armor: { label_fr: 'Armures', label_en: 'Armor', icon: 'Shield' },
  clothing: { label_fr: 'Vêtements', label_en: 'Clothing', icon: 'Shirt' },
  weapons: { label_fr: 'Armes FPS', label_en: 'FPS Weapons', icon: 'Crosshair' },
  utility: { label_fr: 'Utilitaires', label_en: 'Utility', icon: 'Wrench' },
  ammo: { label_fr: 'Munitions', label_en: 'Ammo', icon: 'Disc' },
  sustenance: { label_fr: 'Sustenance', label_en: 'Sustenance', icon: 'Coffee' },
  locations: { label_fr: 'Lieux & Starmap', label_en: 'Locations & Starmap', icon: 'MapPin' },
  commodities: { label_fr: 'Marchandises & Fret', label_en: 'Commodities & Cargo', icon: 'TrendingUp' },
};

type NexusLang = 'fr' | 'en';

function asLang(lang?: string): NexusLang {
  return lang === 'en' ? 'en' : 'fr';
}

function translationJoin(alias: string): string {
  return `LEFT JOIN game.game_insights tr ON tr.uuid = ${alias}.uuid AND tr.env = ${alias}.env AND tr.category = 'translation_fr'`;
}

/** One human name for the active language. Identical proper nouns keep a single casing. */
function displayNameSql(alias: string, column: string, lang: NexusLang): string {
  const base = `${alias}.${column}`;
  const english = `COALESCE(NULLIF(tr.raw_json->>'name_en', ''), ${base})`;
  if (lang === 'en') return english;
  const french = `NULLIF(tr.raw_json->>'name_fr', '')`;
  return `CASE
    WHEN ${french} IS NOT NULL AND lower(${french}) IS DISTINCT FROM lower(${english})
    THEN ${french}
    ELSE ${english}
  END`;
}

function nameMatchSql(alias: string, column: string, param: string): string {
  return `(
    ${alias}.${column} ILIKE ${param}
    OR COALESCE(tr.raw_json->>'name_fr', '') ILIKE ${param}
    OR COALESCE(tr.raw_json->>'name_en', '') ILIKE ${param}
    OR COALESCE(tr.name, '') ILIKE ${param}
  )`;
}

function uiLabel(lang: NexusLang, fr: string, en: string): string {
  return lang === 'fr' ? fr : en;
}

/**
 * Reject workshop leftovers (`Pulse Collector Civ`, `Corsair Exec StealthIndustrial`,
 * raw `ANVL_…` class names) so Nexus never shows DataForge identifiers.
 */
function readableShipNameSql(alias: string, column = 'name'): string {
  return `(
    ${alias}.${column} NOT ILIKE '%placeholder%'
    AND ${alias}.${column} !~ '^[A-Z]{2,5}_'
    AND ${alias}.${column} !~* '(Collector\\s+(Civ|Military|Stealth|Mod|Indust|Grad)|Exec\\s+(Military|Stealth)|StealthIndustrial|\\bGrad\\d+\\b)'
  )`;
}

/** Concept / lore / upcoming rows that exist only in Ship Matrix (not yet in game.ships). */
function conceptShipsSelectSql(searchParam: string | null, statusParam?: string | null): string {
  const search = searchParam
    ? `AND (sm2.name ILIKE ${searchParam} OR COALESCE(sm2.manufacturer_name, '') ILIKE ${searchParam} OR COALESCE(sm2.focus, '') ILIKE ${searchParam})`
    : '';
  let statusCondition =
    "COALESCE(sm2.production_status, 'in-concept') IN ('in-concept', 'in-production', 'in-development', 'lore', 'flight-ready')";
  if (statusParam === 'flight-ready') {
    statusCondition = "sm2.production_status = 'flight-ready'";
  } else if (statusParam === 'in-concept') {
    statusCondition = "sm2.production_status IN ('in-concept', 'in-production', 'in-development')";
  } else if (statusParam === 'lore') {
    statusCondition = "sm2.production_status = 'lore'";
  }
  return `
    SELECT
      ('concept-' || sm2.id::text) AS uuid,
      LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) AS class_name,
      sm2.name AS name,
      COALESCE(sm2.manufacturer_name, sm2.manufacturer_code) AS manufacturer_name,
      sm2.manufacturer_code,
      sm2.focus AS role,
      CASE WHEN sm2.type IS NULL OR sm2.type = '' THEN NULL ELSE INITCAP(REPLACE(sm2.type, '-', ' ')) END AS career,
      NULL::text AS vehicle_category,
      COALESCE(sm2.media_store_small, sm2.media_store_large) AS thumbnail,
      sm2.production_status
    FROM rsi.ship_matrix sm2
    WHERE ${statusCondition}
      AND sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL)
      AND sm2.name NOT ILIKE '%placeholder%'
      ${search}
  `;
}

function shipStatusFilterSql(status?: string): string {
  if (status === 'flight-ready') {
    return "AND (sm.production_status = 'flight-ready' OR sm.production_status IS NULL)";
  }
  if (status === 'in-concept') {
    return "AND sm.production_status IN ('in-concept', 'in-production', 'in-development')";
  }
  if (status === 'lore') {
    return "AND sm.production_status = 'lore'";
  }
  return '';
}

function readTranslation(
  row: Row,
): { name_en?: string | null; name_fr?: string | null; description_en?: string | null; description_fr?: string | null } | null {
  const raw = row.translation_json;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as {
        name_en?: string | null;
        name_fr?: string | null;
        description_en?: string | null;
        description_fr?: string | null;
      };
    } catch {
      return null;
    }
  }
  return raw as { name_en?: string | null; name_fr?: string | null; description_en?: string | null; description_fr?: string | null };
}

function applyLanguage(row: Row, lang: NexusLang): Row {
  const parsed = readTranslation(row);
  const english = (parsed?.name_en || row.name)
    ?.toString()
    .replace(/\s+GS$/i, '')
    .replace(/_GS\b/g, '');
  const french = (parsed?.name_fr || row.translation_name)
    ?.toString()
    .replace(/\s+GS$/i, '')
    .replace(/_GS\b/g, '');
  const name =
    lang === 'fr' && french && String(french).toLowerCase() !== String(english || '').toLowerCase() ? french : english || row.name;
  const description = lang === 'fr' ? parsed?.description_fr || row.description : parsed?.description_en || row.description;
  const cleanedName = typeof name === 'string' ? name.replace(/\s+GS$/i, '').replace(/_GS\b/g, '') : name;
  const next: Row = { ...row, name: cleanedName };
  if (description) next.description = description;
  delete next.translation_json;
  delete next.translation_name;
  return next;
}

export interface UniverseEntityNexus {
  entity: Row;
  category: string;
  connections: {
    equippedOn?: Row[]; // for components: ships equipping this item
    loadout?: Row[]; // for ships: components equipped by slot
    purchasableAt?: Row[]; // shops & locations selling this entity with prices
    shops?: Row[]; // for locations: shops located here
    inventory?: Row[]; // for shops: items/ships sold
    marketOffers?: Row[]; // for commodities: buy/sell terminals & price spreads
    manufacturer?: Row | null;
  };
}

function vehicleSubCategoryFilter(subCategory?: string): string {
  switch (subCategory) {
    case 'weapons':
      return "AND c.type IN ('WeaponGun', 'Gimbal')";
    case 'turrets':
      return "AND c.type IN ('Turret', 'TurretUnmanned')";
    case 'missile_racks':
      return "AND c.type = 'MissileRack'";
    case 'ordnance':
      return "AND c.type IN ('Missile', 'RocketPod')";
    case 'power_plants':
      return "AND c.type = 'PowerPlant'";
    case 'coolers':
      return "AND c.type = 'Cooler'";
    case 'shields':
      return "AND c.type = 'Shield'";
    case 'quantum_drives':
      return "AND c.type = 'QuantumDrive'";
    case 'jump_modules':
      return "AND c.type = 'JumpModule'";
    case 'cm_launchers':
      return "AND c.type = 'Countermeasure'";
    case 'emp':
      return "AND c.type IN ('EMP', 'QuantumInterdictionGenerator')";
    case 'mining':
      return "AND c.type IN ('MiningLaser', 'MiningModifier', 'SalvageHead', 'TractorBeam')";
    case 'radar':
      return "AND c.type = 'Radar'";
    default:
      return '';
  }
}

function determineVehicleSubCategory(type?: string | null): string {
  if (!type) return 'weapons';
  if (['WeaponGun', 'Gimbal'].includes(type)) return 'weapons';
  if (['Turret', 'TurretUnmanned'].includes(type)) return 'turrets';
  if (type === 'MissileRack') return 'missile_racks';
  if (['Missile', 'RocketPod'].includes(type)) return 'ordnance';
  if (type === 'PowerPlant') return 'power_plants';
  if (type === 'Cooler') return 'coolers';
  if (type === 'Shield') return 'shields';
  if (type === 'QuantumDrive') return 'quantum_drives';
  if (type === 'JumpModule') return 'jump_modules';
  if (type === 'Countermeasure') return 'cm_launchers';
  if (['EMP', 'QuantumInterdictionGenerator'].includes(type)) return 'emp';
  if (['MiningLaser', 'MiningModifier', 'SalvageHead', 'TractorBeam'].includes(type)) return 'mining';
  if (type === 'Radar') return 'radar';
  return 'weapons';
}

function armorSubCategoryFilter(subCategory?: string): string {
  switch (subCategory) {
    case 'undersuits':
      return "AND i.type = 'Undersuit'";
    case 'helmets':
      return "AND i.type = 'Armor_Helmet'";
    case 'core':
      return "AND i.type IN ('Armor_Torso', 'Armor')";
    case 'arms':
      return "AND i.type = 'Armor_Arms'";
    case 'legs':
      return "AND i.type = 'Armor_Legs'";
    case 'backpacks':
      return "AND i.type = 'Armor_Backpack'";
    default:
      return '';
  }
}

function determineArmorSubCategory(type?: string | null): string {
  if (type === 'Undersuit') return 'undersuits';
  if (type === 'Armor_Helmet') return 'helmets';
  if (type === 'Armor_Torso' || type === 'Armor') return 'core';
  if (type === 'Armor_Arms') return 'arms';
  if (type === 'Armor_Legs') return 'legs';
  if (type === 'Armor_Backpack') return 'backpacks';
  return 'core';
}

function clothingSubCategoryFilter(subCategory?: string): string {
  switch (subCategory) {
    case 'jackets':
      return "AND i.data_json->>'attachType' IN ('Char_Clothing_Torso_1', 'Char_Clothing_Torso_2')";
    case 'legwear':
      return "AND i.data_json->>'attachType' = 'Char_Clothing_Legs'";
    case 'shirts':
      return "AND i.data_json->>'attachType' = 'Char_Clothing_Torso_0'";
    case 'footwear':
      return "AND i.data_json->>'attachType' = 'Char_Clothing_Feet'";
    case 'headwear':
      return "AND i.data_json->>'attachType' = 'Char_Clothing_Hat'";
    case 'gloves':
      return "AND i.data_json->>'attachType' = 'Char_Clothing_Hands'";
    default:
      return '';
  }
}

function determineClothingSubCategory(attachType?: string | null): string {
  if (['Char_Clothing_Torso_1', 'Char_Clothing_Torso_2'].includes(attachType || '')) return 'jackets';
  if (attachType === 'Char_Clothing_Legs') return 'legwear';
  if (attachType === 'Char_Clothing_Torso_0') return 'shirts';
  if (attachType === 'Char_Clothing_Feet') return 'footwear';
  if (attachType === 'Char_Clothing_Hat') return 'headwear';
  if (attachType === 'Char_Clothing_Hands') return 'gloves';
  return 'jackets';
}

function weaponsSubCategoryFilter(subCategory?: string): string {
  switch (subCategory) {
    case 'primary':
      return "AND i.type = 'FPS_Weapon' AND i.sub_type IN ('SMG', 'Assault Rifle', 'Shotgun', 'Sniper Rifle', 'LMG', 'Medium', 'Small')";
    case 'sidearms':
      return "AND i.type = 'FPS_Weapon' AND i.sub_type = 'Pistol'";
    case 'special':
      return "AND i.type = 'FPS_Weapon' AND i.sub_type IN ('Launcher', 'Large', 'Mine')";
    case 'melee':
      return "AND i.type = 'FPS_Weapon' AND i.sub_type = 'Melee'";
    case 'attachments':
      return "AND i.type = 'Attachment'";
    case 'throwables':
      return "AND i.type = 'FPS_Weapon' AND i.sub_type = 'Throwable'";
    default:
      return '';
  }
}

function determineWeaponSubCategory(type?: string | null, subType?: string | null): string {
  if (type === 'Attachment') return 'attachments';
  if (['SMG', 'Assault Rifle', 'Shotgun', 'Sniper Rifle', 'LMG', 'Medium', 'Small'].includes(subType || '')) return 'primary';
  if (subType === 'Pistol') return 'sidearms';
  if (['Launcher', 'Large', 'Mine'].includes(subType || '')) return 'special';
  if (subType === 'Melee') return 'melee';
  if (subType === 'Throwable') return 'throwables';
  return 'primary';
}

function utilitySubCategoryFilter(subCategory?: string): string {
  switch (subCategory) {
    case 'gadgets':
      return "AND ((i.type = 'Tool' AND i.sub_type = 'Multitool') OR (i.type = 'Gadget' AND i.sub_type IN ('Handheld', 'Two-handed', 'Device')))";
    case 'medical':
      return "AND ((i.type = 'Tool' AND i.sub_type = 'Medical') OR (i.type = 'Consumable' AND i.sub_type IN ('Medical', 'MedPack')))";
    case 'cryptokeys':
      return "AND i.type = 'Consumable' AND i.sub_type IN ('SystemAccess', 'Hacking')";
    case 'attachments':
      return "AND i.type = 'Tool' AND i.sub_type = 'Device'";
    default:
      return '';
  }
}

function determineUtilitySubCategory(type?: string | null, subType?: string | null): string {
  if ((type === 'Tool' && subType === 'Multitool') || (type === 'Gadget' && ['Handheld', 'Two-handed', 'Device'].includes(subType || '')))
    return 'gadgets';
  if ((type === 'Tool' && subType === 'Medical') || (type === 'Consumable' && ['Medical', 'MedPack'].includes(subType || '')))
    return 'medical';
  if (type === 'Consumable' && ['SystemAccess', 'Hacking'].includes(subType || '')) return 'cryptokeys';
  if (type === 'Tool' && subType === 'Device') return 'attachments';
  return 'gadgets';
}

function sustenanceSubCategoryFilter(subCategory?: string): string {
  switch (subCategory) {
    case 'food':
      return "AND (i.sub_type = 'Food' OR i.sub_type = 'OxygenCap')";
    case 'drink':
      return "AND i.sub_type = 'Drink'";
    default:
      return '';
  }
}

function determineSustenanceSubCategory(subType?: string | null): string {
  if (subType === 'Drink') return 'drink';
  return 'food';
}

function locationsSubCategoryFilter(subCategory?: string): string {
  switch (subCategory) {
    case 'bunkers':
      return "AND LOWER(l.type) = 'bunker'";
    case 'outposts':
      return "AND LOWER(l.type) = 'outpost'";
    case 'stations':
      return "AND LOWER(l.type) IN ('station', 'rest_stop', 'spacestation', 'comm_array', 'lagrangepoint')";
    case 'landing_zones':
      return "AND LOWER(l.type) IN ('landing_zone', 'city', 'settlement')";
    case 'mining':
      return "AND LOWER(l.type) = 'mining_claim'";
    case 'planets':
      return "AND LOWER(l.type) = 'planet'";
    case 'moons':
      return "AND LOWER(l.type) = 'moon'";
    case 'jump_points':
      return "AND LOWER(l.type) = 'jump_point'";
    default:
      return '';
  }
}

function determineLocationSubCategory(type?: string | null): string {
  const t = (type || '').toLowerCase();
  if (t === 'bunker') return 'bunkers';
  if (['station', 'rest_stop', 'spacestation', 'comm_array', 'lagrangepoint'].includes(t)) return 'stations';
  if (t === 'mining_claim') return 'mining';
  if (t === 'outpost') return 'outposts';
  if (['landing_zone', 'city', 'settlement'].includes(t)) return 'landing_zones';
  if (t === 'jump_point') return 'jump_points';
  if (t === 'moon') return 'moons';
  if (t === 'planet') return 'planets';
  return 'stations';
}

function commoditiesSubCategoryFilter(subCategory?: string): string {
  switch (subCategory) {
    case 'metals':
      return "AND cm.type IN ('Metal', 'Alloy')";
    case 'minerals':
      return "AND cm.type IN ('Mineral', 'Nonmetal', 'Mixed Mining')";
    case 'gas':
      return "AND cm.type IN ('Gas', 'Halogen')";
    case 'agricultural':
      return "AND cm.type IN ('Food', 'Agricultural Supply', 'Natural')";
    case 'medical':
      return "AND cm.type = 'Medical Supply'";
    case 'vice':
      return "AND cm.type IN ('Vice', 'Counterfeit')";
    case 'waste':
      return "AND cm.type IN ('Waste', 'Scrap')";
    case 'goods':
      return "AND cm.type IN ('Consumer Goods', 'Manmade', 'Processed Goods')";
    default:
      return '';
  }
}

function determineCommoditySubCategory(type?: string | null): string {
  if (['Metal', 'Alloy'].includes(type || '')) return 'metals';
  if (['Mineral', 'Nonmetal', 'Mixed Mining'].includes(type || '')) return 'minerals';
  if (['Gas', 'Halogen'].includes(type || '')) return 'gas';
  if (['Food', 'Agricultural Supply', 'Natural'].includes(type || '')) return 'agricultural';
  if (type === 'Medical Supply') return 'medical';
  if (['Vice', 'Counterfeit'].includes(type || '')) return 'vice';
  if (['Waste', 'Scrap'].includes(type || '')) return 'waste';
  return 'goods';
}

export class UniverseNexusService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Omni-search across ships, modular components, FPS gear, locations, and commodities.
   * Strictly filters out dev placeholders, engine thruster pipes, and ghost records.
   * Returns human-readable in-game names.
   */
  async omniSearch(query: string, env = 'live', limit = 20, lang?: string): Promise<UniverseOmniResult[]> {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const likePattern = `%${cleanQuery}%`;
    const language = asLang(lang);

    // Parallel multi-domain query with human-name resolution and placeholder exclusion
    const [ships, components, items, locations, commodities] = await Promise.all([
      // 1. Ships (game.ships + concept/lore Ship Matrix rows)
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT * FROM (
          SELECT 
            s.uuid::text AS uuid,
            s.class_name,
            ${displayNameSql('s', 'name', language)} AS name,
            COALESCE(m.name, s.manufacturer_code) AS manufacturer_name,
            s.manufacturer_code,
            s.role,
            s.career,
            s.vehicle_category,
            COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
            sm.production_status
          FROM game.ships s
          LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
          LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
          ${translationJoin('s')}
          WHERE s.env = $1
            AND ${nameMatchSql('s', 'name', '$2')}
            AND ${readableShipNameSql('s')}
          UNION ALL
          ${conceptShipsSelectSql('$2')}
        ) ships
        ORDER BY 
          CASE WHEN name ILIKE $3 THEN 0 ELSE 1 END,
          name ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),

      // 2. Components (excluding internal engine thrusters, pipes, and placeholders)
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          c.uuid,
          c.class_name,
          ${displayNameSql('c', 'name', language)} AS name,
          c.type,
          c.sub_type,
          c.size,
          c.grade,
          c.manufacturer_code,
          COALESCE(m.name, c.manufacturer_code) AS manufacturer_name
        FROM game.components c
        LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
        ${translationJoin('c')}
        WHERE c.env = $1
          AND ${nameMatchSql('c', 'name', '$2')}
          AND c.name NOT ILIKE '%placeholder%'
          AND c.name != ''
          AND c.name !~ '^[A-Z]{2,5}_'
          AND c.name !~ '^[A-Z]{2,5} '
          AND c.type NOT IN ('Thruster', 'FuelIntake')
          AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ORDER BY 
          CASE WHEN ${displayNameSql('c', 'name', language)} ILIKE $3 THEN 0 ELSE 1 END,
          ${displayNameSql('c', 'name', language)} ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),

      // 3. FPS Items & Equipment (Armors, Weapons, Gadgets)
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          i.uuid,
          i.class_name,
          ${displayNameSql('i', 'name', language)} AS name,
          i.type,
          i.sub_type,
          i.manufacturer_code,
          COALESCE(m.name, i.manufacturer_code) AS manufacturer_name
        FROM game.items i
        LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
        ${translationJoin('i')}
        WHERE i.env = $1
          AND ${nameMatchSql('i', 'name', '$2')}
          AND i.name NOT ILIKE '%placeholder%'
          AND i.name != ''
          AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ORDER BY 
          CASE WHEN ${displayNameSql('i', 'name', language)} ILIKE $3 THEN 0 ELSE 1 END,
          ${displayNameSql('i', 'name', language)} ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),

      // 4. Locations & Stations
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          l.uuid,
          ${displayNameSql('l', 'name', language)} AS name,
          l.type,
          l.system_code,
          l.description
        FROM game.locations l
        ${translationJoin('l')}
        WHERE l.env = $1
          AND ${nameMatchSql('l', 'name', '$2')}
          AND l.name NOT ILIKE '%placeholder%'
          AND l.name != ''
          AND LOWER(l.type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
        ORDER BY 
          CASE WHEN ${displayNameSql('l', 'name', language)} ILIKE $3 THEN 0 ELSE 1 END,
          ${displayNameSql('l', 'name', language)} ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),

      // 5. Commodities
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          cm.uuid,
          ${displayNameSql('cm', 'name', language)} AS name,
          cm.type,
          cm.sub_type,
          cm.symbol
        FROM game.commodities cm
        ${translationJoin('cm')}
        WHERE cm.env = $1
          AND ${nameMatchSql('cm', 'name', '$2')}
          AND cm.name NOT ILIKE '%placeholder%'
          AND cm.name != ''
        ORDER BY 
          CASE WHEN ${displayNameSql('cm', 'name', language)} ILIKE $3 THEN 0 ELSE 1 END,
          ${displayNameSql('cm', 'name', language)} ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),
    ]);

    const results: UniverseOmniResult[] = [];

    // Map ships
    for (const s of convertBigIntToNumber(ships)) {
      results.push({
        id: s.uuid,
        uuid: s.uuid,
        className: s.class_name,
        name: s.name,
        category: 'ships',
        type: s.role || uiLabel(language, 'Vaisseau', 'Ship'),
        subType: s.career,
        manufacturer: s.manufacturer_name,
        manufacturerCode: s.manufacturer_code,
        thumbnail: s.thumbnail,
        storePriceUsd: s.price_usd ? Number(s.price_usd) : null,
        productionStatus: s.production_status || 'flight-ready',
        badge: {
          label:
            s.production_status === 'lore'
              ? 'Lore / SQ42'
              : s.production_status === 'in-concept'
                ? uiLabel(language, 'Concept', 'Concept')
                : s.role || uiLabel(language, 'Vaisseau', 'Ship'),
          color: s.production_status === 'lore' ? 'purple' : s.production_status === 'in-concept' ? 'amber' : 'blue',
        },
      });
    }

    // Map components
    for (const c of convertBigIntToNumber(components)) {
      results.push({
        id: c.uuid,
        uuid: c.uuid,
        className: c.class_name,
        name: c.name,
        category: 'components',
        type: c.type || uiLabel(language, 'Composant', 'Component'),
        subType: c.sub_type,
        manufacturer: c.manufacturer_name,
        manufacturerCode: c.manufacturer_code,
        size: c.size,
        badge: {
          label: `T${c.size || 1} ${c.type}`,
          color: 'cyan',
        },
      });
    }

    // Map items
    for (const i of convertBigIntToNumber(items)) {
      results.push({
        id: i.uuid,
        uuid: i.uuid,
        className: i.class_name,
        name: i.name,
        category: 'items',
        type: i.type || uiLabel(language, 'Équipement', 'Equipment'),
        subType: i.sub_type,
        manufacturer: i.manufacturer_name,
        manufacturerCode: i.manufacturer_code,
        badge: {
          label: i.type || 'Item',
          color: 'emerald',
        },
      });
    }

    // Map locations
    for (const l of convertBigIntToNumber(locations)) {
      results.push({
        id: l.uuid,
        uuid: l.uuid,
        name: l.name,
        category: 'locations',
        type: l.type || uiLabel(language, 'Lieu', 'Location'),
        system: l.system_code,
        badge: {
          label: l.system_code ? `${l.system_code} • ${l.type}` : l.type,
          color: 'amber',
        },
      });
    }

    // Map commodities
    for (const cm of convertBigIntToNumber(commodities)) {
      results.push({
        id: cm.uuid,
        uuid: cm.uuid,
        name: cm.name,
        category: 'commodities',
        type: cm.type || uiLabel(language, 'Marchandise', 'Commodity'),
        subType: cm.sub_type,
        badge: {
          label: cm.type || 'Commodity',
          color: 'slate',
        },
      });
    }

    return results.slice(0, safeLimit);
  }

  /**
   * Fast live taxonomy tree with real dynamic entity counts per category and subcategory.
   */
  async getTaxonomy(env = 'live'): Promise<TaxonomyCategory[]> {
    const rawCounts = await this.prisma.$queryRawUnsafe<Row[]>(
      `WITH cat_counts AS (
        -- Ships
        SELECT 'ships' as cat, 
          CASE 
            WHEN ships.production_status = 'lore' THEN 'lore'
            WHEN ships.production_status IN ('in-concept', 'in-production', 'in-development') THEN 'in-concept'
            ELSE 'flight-ready'
          END as sub_cat,
          count(*) as count
        FROM (
          SELECT s.uuid::text, s.name, sm.production_status FROM game.ships s
          LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
          WHERE s.env = $1 AND s.name NOT ILIKE '%placeholder%' AND s.name !~ '^[A-Z]{2,5}_'
          UNION ALL
          SELECT ('concept-' || sm2.id::text), sm2.name, sm2.production_status FROM rsi.ship_matrix sm2
          WHERE sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL)
            AND sm2.name NOT ILIKE '%placeholder%'
        ) ships
        GROUP BY 2

        UNION ALL

        -- Vehicles (Components)
        SELECT 'vehicles',
          CASE 
            WHEN type IN ('WeaponGun', 'Gimbal') THEN 'weapons'
            WHEN type IN ('Turret', 'TurretUnmanned') THEN 'turrets'
            WHEN type = 'MissileRack' THEN 'missile_racks'
            WHEN type IN ('Missile', 'RocketPod') THEN 'ordnance'
            WHEN type = 'PowerPlant' THEN 'power_plants'
            WHEN type = 'Cooler' THEN 'coolers'
            WHEN type = 'Shield' THEN 'shields'
            WHEN type = 'QuantumDrive' THEN 'quantum_drives'
            WHEN type = 'JumpModule' THEN 'jump_modules'
            WHEN type = 'Countermeasure' THEN 'cm_launchers'
            WHEN type IN ('EMP', 'QuantumInterdictionGenerator') THEN 'emp'
            WHEN type IN ('MiningLaser', 'MiningModifier', 'SalvageHead', 'TractorBeam') THEN 'mining'
            WHEN type = 'Radar' THEN 'radar'
            ELSE 'other'
          END,
          count(*)
        FROM game.components
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != ''
          AND type NOT IN ('Thruster', 'FuelIntake', 'FuelTank', 'LifeSupport')
          AND class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        GROUP BY 2

        UNION ALL

        -- Armor
        SELECT 'armor',
          CASE 
            WHEN type = 'Undersuit' THEN 'undersuits'
            WHEN type = 'Armor_Helmet' THEN 'helmets'
            WHEN type IN ('Armor_Torso', 'Armor') THEN 'core'
            WHEN type = 'Armor_Arms' THEN 'arms'
            WHEN type = 'Armor_Legs' THEN 'legs'
            WHEN type = 'Armor_Backpack' THEN 'backpacks'
            ELSE 'other'
          END,
          count(*)
        FROM game.items
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != ''
          AND type IN ('Armor_Torso', 'Armor_Legs', 'Armor_Arms', 'Armor_Helmet', 'Armor_Backpack', 'Armor', 'Undersuit')
        GROUP BY 2

        UNION ALL

        -- Clothing
        SELECT 'clothing',
          CASE 
            WHEN data_json->>'attachType' IN ('Char_Clothing_Torso_1', 'Char_Clothing_Torso_2') THEN 'jackets'
            WHEN data_json->>'attachType' = 'Char_Clothing_Legs' THEN 'legwear'
            WHEN data_json->>'attachType' = 'Char_Clothing_Torso_0' THEN 'shirts'
            WHEN data_json->>'attachType' = 'Char_Clothing_Feet' THEN 'footwear'
            WHEN data_json->>'attachType' = 'Char_Clothing_Hat' THEN 'headwear'
            WHEN data_json->>'attachType' = 'Char_Clothing_Hands' THEN 'gloves'
            ELSE 'other'
          END,
          count(*)
        FROM game.items
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != '' AND type = 'Clothing'
        GROUP BY 2

        UNION ALL

        -- Weapons
        SELECT 'weapons',
          CASE 
            WHEN type = 'FPS_Weapon' AND sub_type IN ('SMG', 'Assault Rifle', 'Shotgun', 'Sniper Rifle', 'LMG', 'Medium', 'Small') THEN 'primary'
            WHEN type = 'FPS_Weapon' AND sub_type = 'Pistol' THEN 'sidearms'
            WHEN type = 'FPS_Weapon' AND sub_type IN ('Launcher', 'Large', 'Mine') THEN 'special'
            WHEN type = 'FPS_Weapon' AND sub_type = 'Melee' THEN 'melee'
            WHEN type = 'Attachment' THEN 'attachments'
            WHEN type = 'FPS_Weapon' AND sub_type = 'Throwable' THEN 'throwables'
            ELSE 'other'
          END,
          count(*)
        FROM game.items
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != '' AND type IN ('FPS_Weapon', 'Attachment')
        GROUP BY 2

        UNION ALL

        -- Utility
        SELECT 'utility',
          CASE 
            WHEN (type = 'Tool' AND sub_type = 'Multitool') OR (type = 'Gadget' AND sub_type IN ('Handheld', 'Two-handed', 'Device')) THEN 'gadgets'
            WHEN (type = 'Tool' AND sub_type = 'Medical') OR (type = 'Consumable' AND sub_type IN ('Medical', 'MedPack')) THEN 'medical'
            WHEN type = 'Consumable' AND sub_type IN ('SystemAccess', 'Hacking') THEN 'cryptokeys'
            WHEN type = 'Tool' AND sub_type = 'Device' THEN 'attachments'
            ELSE 'other'
          END,
          count(*)
        FROM game.items
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != ''
          AND (type IN ('Gadget', 'Tool') OR (type = 'Consumable' AND sub_type IN ('SystemAccess', 'Hacking', 'Medical', 'MedPack')))
        GROUP BY 2

        UNION ALL

        -- Ammo
        SELECT 'ammo', 'magazines', count(*)
        FROM game.items
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != ''
          AND (type = 'Magazine' OR sub_type = 'Magazine')

        UNION ALL

        -- Sustenance
        SELECT 'sustenance',
          CASE 
            WHEN sub_type = 'Food' THEN 'food'
            WHEN sub_type = 'Drink' THEN 'drink'
            ELSE 'food'
          END,
          count(*)
        FROM game.items
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != ''
          AND type = 'Consumable' AND sub_type IN ('Food', 'Drink', 'OxygenCap')
        GROUP BY 2

        UNION ALL

        -- Locations
        SELECT 'locations',
          CASE 
            WHEN LOWER(type) = 'bunker' THEN 'bunkers'
            WHEN LOWER(type) = 'outpost' THEN 'outposts'
            WHEN LOWER(type) IN ('station', 'rest_stop', 'spacestation', 'comm_array', 'lagrangepoint') THEN 'stations'
            WHEN LOWER(type) IN ('landing_zone', 'city', 'settlement') THEN 'landing_zones'
            WHEN LOWER(type) = 'mining_claim' THEN 'mining'
            WHEN LOWER(type) = 'planet' THEN 'planets'
            WHEN LOWER(type) = 'moon' THEN 'moons'
            WHEN LOWER(type) = 'jump_point' THEN 'jump_points'
            ELSE 'other'
          END,
          count(*)
        FROM game.locations
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != ''
          AND LOWER(type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
        GROUP BY 2

        UNION ALL

        -- Commodities
        SELECT 'commodities',
          CASE 
            WHEN type IN ('Metal', 'Alloy') THEN 'metals'
            WHEN type IN ('Mineral', 'Nonmetal', 'Mixed Mining') THEN 'minerals'
            WHEN type IN ('Gas', 'Halogen') THEN 'gas'
            WHEN type IN ('Food', 'Agricultural Supply', 'Natural') THEN 'agricultural'
            WHEN type = 'Medical Supply' THEN 'medical'
            WHEN type IN ('Vice', 'Counterfeit') THEN 'vice'
            WHEN type IN ('Waste', 'Scrap') THEN 'waste'
            ELSE 'goods'
          END,
          count(*)
        FROM game.commodities
        WHERE env = $1 AND name NOT ILIKE '%placeholder%' AND name != ''
        GROUP BY 2
      )
      SELECT * FROM cat_counts ORDER BY cat, count DESC`,
      toPostgres(env),
    );

    const categoriesOrder = [
      'ships',
      'vehicles',
      'armor',
      'clothing',
      'weapons',
      'utility',
      'ammo',
      'sustenance',
      'locations',
      'commodities',
    ];

    const grouped: Record<string, { total: number; subCategories: TaxonomySubCategory[] }> = {};
    for (const catId of categoriesOrder) {
      grouped[catId] = { total: 0, subCategories: [] };
    }

    for (const row of convertBigIntToNumber(rawCounts)) {
      const cat = row.cat as string;
      const subCat = row.sub_cat as string;
      const count = Number(row.count || 0);
      if (!grouped[cat]) {
        grouped[cat] = { total: 0, subCategories: [] };
      }
      grouped[cat].total += count;
      const meta = SUB_CATEGORY_LABELS[subCat] || {
        fr: subCat,
        en: subCat,
      };
      if (subCat !== 'other') {
        grouped[cat].subCategories.push({
          id: subCat,
          label_fr: meta.fr,
          label_en: meta.en,
          count,
        });
      }
    }

    return categoriesOrder.map((catId) => {
      const meta = CATEGORY_META[catId] || { label_fr: catId, label_en: catId, icon: 'Sparkles' };
      return {
        id: catId,
        label_fr: meta.label_fr,
        label_en: meta.label_en,
        icon: meta.icon,
        total: grouped[catId]?.total || 0,
        subCategories: grouped[catId]?.subCategories || [],
      };
    });
  }

  /**
   * Helper for querying FPS items and equipment across armor, clothing, weapons, utility, ammo, sustenance.
   */
  private async exploreItemsGeneric(
    env: string,
    language: NexusLang,
    categoryName: UniverseCategory,
    baseCondition: string,
    subCatCondition: string,
    whereSearch: string | null,
    manufacturer: string | undefined,
    type: string | undefined,
    subCat: string,
    safeLimit: number,
    offset: number,
    page: number,
    badgeColor: 'emerald' | 'cyan' | 'purple' | 'amber' | 'slate' | 'rose' | 'indigo' | 'lime',
    determineSubCategory: (row: Row) => string,
    formatBadgeLabel?: (row: Row, lang: NexusLang) => string,
  ): Promise<PaginatedResult<UniverseOmniResult> & { facets: Row }> {
    const countSql = `SELECT COUNT(*) as total FROM game.items i
      ${translationJoin('i')}
      WHERE i.env = $1
        AND i.name NOT ILIKE '%placeholder%'
        AND i.name != ''
        AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ${baseCondition}
        ${subCatCondition}
        ${whereSearch ? `AND ${nameMatchSql('i', 'name', '$2')}` : ''}
        ${manufacturer ? `AND i.manufacturer_code = $${whereSearch ? 3 : 2}` : ''}
        ${type ? `AND i.type = $${whereSearch ? (manufacturer ? 4 : 3) : manufacturer ? 3 : 2}` : ''}`;

    const countParams: unknown[] = [toPostgres(env)];
    if (whereSearch) countParams.push(whereSearch);
    if (manufacturer) countParams.push(manufacturer);
    if (type) countParams.push(type);

    const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
    const total = Number(totalCountRow[0]?.total || 0);

    const itemsSql = `SELECT 
      i.uuid,
      i.class_name,
      ${displayNameSql('i', 'name', language)} AS name,
      i.type,
      i.sub_type,
      i.size,
      i.grade,
      i.data_json->>'attachType' AS attach_type,
      i.manufacturer_code,
      COALESCE(m.name, i.manufacturer_code) AS manufacturer_name
    FROM game.items i
    LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
    ${translationJoin('i')}
    WHERE i.env = $1
      AND i.name NOT ILIKE '%placeholder%'
      AND i.name != ''
      AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
      ${baseCondition}
      ${subCatCondition}
      ${whereSearch ? `AND ${nameMatchSql('i', 'name', '$2')}` : ''}
      ${manufacturer ? `AND i.manufacturer_code = $${whereSearch ? 3 : 2}` : ''}
      ${type ? `AND i.type = $${whereSearch ? (manufacturer ? 4 : 3) : manufacturer ? 3 : 2}` : ''}
    ORDER BY ${displayNameSql('i', 'name', language)} ASC
    LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

    const itemsParams = [...countParams, safeLimit, offset];
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

    const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((i: Row) => {
      const derivedSubCategory = determineSubCategory(i);
      const label = formatBadgeLabel
        ? formatBadgeLabel(i, language)
        : SUB_CATEGORY_LABELS[derivedSubCategory]?.[language] || i.sub_type || i.type || 'Item';
      return {
        id: i.uuid,
        uuid: i.uuid,
        className: i.class_name,
        name: i.name,
        category: categoryName,
        subCategory: derivedSubCategory,
        type: i.type || uiLabel(language, 'Équipement', 'Equipment'),
        subType: i.sub_type,
        manufacturer: i.manufacturer_name,
        manufacturerCode: i.manufacturer_code,
        size: i.size,
        badge: {
          label,
          color: badgeColor,
        },
      };
    });

    return {
      data,
      total,
      page,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit) || 1,
      facets: {
        category: categoryName,
        subCategory: subCat || 'all',
      },
    };
  }

  /**
   * Unified Explore endpoint powering the main Nexus view.
   * Supports all official in-game categories and subcategories with intelligent facets.
   */
  async explore(params: UniverseExploreParams): Promise<PaginatedResult<UniverseOmniResult> & { facets: Row }> {
    const { search, manufacturer, type, status, page = 1, limit = 24, env = 'live', lang } = params;
    const cat = (params.category || 'all').toLowerCase();
    const subCat = (params.sub_category || params.subCategory || '').toLowerCase();
    const language = asLang(lang);
    const offset = Math.max(0, (page - 1) * limit);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    // Build search parameter
    const whereSearch = search ? `%${search.trim()}%` : null;

    if (cat === 'all') {
      const shipSearch = whereSearch ? `AND ${nameMatchSql('s', 'name', '$2')}` : '';
      const conceptSearch = whereSearch ? '$2' : null;
      const shipStatusSql = shipStatusFilterSql(status);
      const isOnlyConceptOrLore = status === 'in-concept' || status === 'lore';

      const componentSearch = whereSearch ? `AND ${nameMatchSql('c', 'name', '$2')}` : '';
      const itemSearch = whereSearch ? `AND ${nameMatchSql('i', 'name', '$2')}` : '';
      const locationSearch = whereSearch ? `AND ${nameMatchSql('l', 'name', '$2')}` : '';
      const commoditySearch = whereSearch ? `AND ${nameMatchSql('cm', 'name', '$2')}` : '';

      const nonShipSql = isOnlyConceptOrLore
        ? ''
        : `
        UNION ALL
        SELECT c.uuid::text, c.class_name, ${displayNameSql('c', 'name', language)},
          'vehicles'::text, COALESCE(c.type, 'Component'), c.sub_type,
          COALESCE(m.name, c.manufacturer_code), c.manufacturer_code,
          NULL::text, NULL::text, NULL::text, c.size
        FROM game.components c
        LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
        ${translationJoin('c')}
        WHERE c.env = $1 AND c.name NOT ILIKE '%placeholder%' AND c.name != ''
          AND c.name !~ '^[A-Z]{2,5}_'
          AND c.name !~ '^[A-Z]{2,5} '
          AND c.type NOT IN ('Thruster', 'FuelIntake', 'FuelTank', 'LifeSupport')
          AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          ${componentSearch}
        UNION ALL
        SELECT i.uuid::text, i.class_name, ${displayNameSql('i', 'name', language)},
          'armor'::text, COALESCE(i.type, 'Equipment'), i.sub_type,
          COALESCE(m.name, i.manufacturer_code), i.manufacturer_code,
          NULL::text, NULL::text, NULL::text, NULL::int
        FROM game.items i
        LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
        ${translationJoin('i')}
        WHERE i.env = $1 AND i.name NOT ILIKE '%placeholder%' AND i.name != ''
          AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          AND i.type IN ('Armor_Torso', 'Armor_Legs', 'Armor_Arms', 'Armor_Helmet', 'Armor_Backpack', 'Armor', 'Undersuit')
          ${itemSearch}
        UNION ALL
        SELECT i2.uuid::text, i2.class_name, ${displayNameSql('i2', 'name', language)},
          'weapons'::text, COALESCE(i2.type, 'Equipment'), i2.sub_type,
          COALESCE(m2.name, i2.manufacturer_code), i2.manufacturer_code,
          NULL::text, NULL::text, NULL::text, NULL::int
        FROM game.items i2
        LEFT JOIN game.manufacturers m2 ON m2.code = i2.manufacturer_code
        ${translationJoin('i2')}
        WHERE i2.env = $1 AND i2.name NOT ILIKE '%placeholder%' AND i2.name != ''
          AND i2.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          AND i2.type IN ('FPS_Weapon', 'Attachment')
          ${itemSearch}
        UNION ALL
        SELECT l.uuid::text, NULL::text, ${displayNameSql('l', 'name', language)},
          'locations'::text, COALESCE(l.type, 'Location'), NULL::text,
          NULL::text, NULL::text, NULL::text, l.system_code, NULL::text, NULL::int
        FROM game.locations l
        ${translationJoin('l')}
        WHERE l.env = $1 AND l.name NOT ILIKE '%placeholder%' AND l.name != ''
          AND LOWER(l.type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
          ${locationSearch}
        UNION ALL
        SELECT cm.uuid::text, NULL::text, ${displayNameSql('cm', 'name', language)},
          'commodities'::text, COALESCE(cm.type, 'Commodity'), cm.sub_type,
          NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int
        FROM game.commodities cm
        ${translationJoin('cm')}
        WHERE cm.env = $1 AND cm.name NOT ILIKE '%placeholder%' AND cm.name != ''
          ${commoditySearch}
      `;

      const universeSql = `
        SELECT s.uuid::text AS id, s.class_name, ${displayNameSql('s', 'name', language)} AS name,
          'ships'::text AS category, COALESCE(s.role, 'Ship') AS type, s.career AS sub_type,
          COALESCE(m.name, s.manufacturer_code) AS manufacturer_name, s.manufacturer_code,
          COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
          NULL::text AS system_code, sm.production_status, NULL::int AS size
        FROM game.ships s
        LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        ${translationJoin('s')}
        WHERE s.env = $1 AND ${readableShipNameSql('s')} ${shipStatusSql} ${shipSearch}
        UNION ALL
        SELECT cs.uuid AS id, cs.class_name, cs.name, 'ships', COALESCE(cs.role, 'Ship'), cs.career,
          cs.manufacturer_name, cs.manufacturer_code, cs.thumbnail, NULL::text, cs.production_status, NULL::int
        FROM (${conceptShipsSelectSql(conceptSearch, status)}) cs
        ${nonShipSql}
      `;
      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);
      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) AS total FROM (${universeSql}) universe`,
        ...countParams,
      );
      const total = Number(totalCountRow[0]?.total || 0);
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT * FROM (${universeSql}) universe ORDER BY name ASC LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`,
        ...countParams,
        safeLimit,
        offset,
      );
      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((row: Row) => ({
        id: row.id,
        uuid: row.id,
        className: row.class_name,
        name: row.name,
        category: row.category as UniverseCategory,
        type: row.type,
        subType: row.sub_type,
        manufacturer: row.manufacturer_name,
        manufacturerCode: row.manufacturer_code,
        thumbnail: row.thumbnail,
        system: row.system_code,
        size: row.size,
        productionStatus: row.production_status,
        badge: {
          label: row.production_status === 'lore' ? 'Lore / SQ42' : row.type,
          color: row.category === 'ships' ? 'blue' : row.category === 'locations' ? 'amber' : 'cyan',
        },
      }));
      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: { category: 'all' },
      };
    }

    if (cat === 'ships' || cat === 'fleet') {
      const effectiveStatus = subCat === 'flight-ready' || subCat === 'in-concept' || subCat === 'lore' ? subCat : status;
      const conceptSearch = whereSearch ? '$2' : null;
      const shipStatusSql = shipStatusFilterSql(effectiveStatus);
      const shipsUnionSql = `
        SELECT s.uuid::text AS uuid, s.class_name, ${displayNameSql('s', 'name', language)} AS name,
          COALESCE(m.name, s.manufacturer_code) AS manufacturer_name, s.manufacturer_code,
          s.role, s.career, COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail, sm.production_status
        FROM game.ships s
        LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        ${translationJoin('s')}
        WHERE s.env = $1 AND ${readableShipNameSql('s')} ${shipStatusSql}
          ${whereSearch ? `AND ${nameMatchSql('s', 'name', '$2')}` : ''}
        UNION ALL
        SELECT cs.uuid, cs.class_name, cs.name, cs.manufacturer_name, cs.manufacturer_code,
          cs.role, cs.career, cs.thumbnail, cs.production_status
        FROM (${conceptShipsSelectSql(conceptSearch, effectiveStatus)}) cs
      `;
      const countParams = whereSearch ? [toPostgres(env), whereSearch] : [toPostgres(env)];
      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) as total FROM (${shipsUnionSql}) ships`,
        ...countParams,
      );
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT * FROM (${shipsUnionSql}) ships
        ORDER BY name ASC
        LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((s: Row) => ({
        id: s.uuid,
        uuid: s.uuid,
        className: s.class_name,
        name: s.name,
        category: 'ships',
        subCategory: s.production_status || 'flight-ready',
        type: s.role || uiLabel(language, 'Vaisseau', 'Ship'),
        subType: s.career,
        manufacturer: s.manufacturer_name,
        manufacturerCode: s.manufacturer_code,
        thumbnail: s.thumbnail,
        storePriceUsd: s.price_usd ? Number(s.price_usd) : null,
        productionStatus: s.production_status || 'flight-ready',
        badge: {
          label:
            s.production_status === 'lore'
              ? 'Lore / SQ42'
              : s.production_status === 'in-concept'
                ? uiLabel(language, 'Concept', 'Concept')
                : s.role || uiLabel(language, 'Vaisseau', 'Ship'),
          color: s.production_status === 'lore' ? 'purple' : s.production_status === 'in-concept' ? 'amber' : 'blue',
        },
      }));

      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: {
          category: 'ships',
          subCategory: effectiveStatus || 'all',
        },
      };
    }

    if (cat === 'vehicles' || cat === 'components') {
      const subCatFilter = vehicleSubCategoryFilter(subCat);
      const countSql = `SELECT COUNT(*) as total FROM game.components c
        ${translationJoin('c')}
        WHERE c.env = $1 
          AND c.name NOT ILIKE '%placeholder%' 
          AND c.name != '' 
          AND c.name !~ '^[A-Z]{2,5}_'
          AND c.name !~ '^[A-Z]{2,5} '
          AND c.type NOT IN ('Thruster', 'FuelIntake', 'FuelTank', 'LifeSupport')
          AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          ${subCatFilter}
          ${whereSearch ? `AND ${nameMatchSql('c', 'name', '$2')}` : ''}
          ${manufacturer ? `AND c.manufacturer_code = $${whereSearch ? 3 : 2}` : ''}
          ${type ? `AND c.type = $${whereSearch ? (manufacturer ? 4 : 3) : manufacturer ? 3 : 2}` : ''}`;

      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);
      if (manufacturer) countParams.push(manufacturer);
      if (type) countParams.push(type);

      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        c.uuid,
        c.class_name,
        ${displayNameSql('c', 'name', language)} AS name,
        c.type,
        c.sub_type,
        c.size,
        c.grade,
        c.manufacturer_code,
        COALESCE(m.name, c.manufacturer_code) AS manufacturer_name
      FROM game.components c
      LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
      ${translationJoin('c')}
      WHERE c.env = $1
        AND c.name NOT ILIKE '%placeholder%'
        AND c.name != ''
        AND c.name !~ '^[A-Z]{2,5}_'
        AND c.name !~ '^[A-Z]{2,5} '
        AND c.type NOT IN ('Thruster', 'FuelIntake', 'FuelTank', 'LifeSupport')
        AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ${subCatFilter}
        ${whereSearch ? `AND ${nameMatchSql('c', 'name', '$2')}` : ''}
        ${manufacturer ? `AND c.manufacturer_code = $${whereSearch ? 3 : 2}` : ''}
        ${type ? `AND c.type = $${whereSearch ? (manufacturer ? 4 : 3) : manufacturer ? 3 : 2}` : ''}
      ORDER BY ${displayNameSql('c', 'name', language)} ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((c: Row) => {
        const derivedSubCategory = determineVehicleSubCategory(c.type);
        const isJumpModule = c.type === 'JumpModule';
        const label = isJumpModule
          ? uiLabel(language, 'Module de saut', 'Jump Module')
          : `T${c.size || 1} ${SUB_CATEGORY_LABELS[derivedSubCategory]?.[language] || c.type}`;
        return {
          id: c.uuid,
          uuid: c.uuid,
          className: c.class_name,
          name: c.name,
          category: 'vehicles',
          subCategory: derivedSubCategory,
          type: c.type || uiLabel(language, 'Composant', 'Component'),
          subType: c.sub_type,
          manufacturer: c.manufacturer_name,
          manufacturerCode: c.manufacturer_code,
          size: c.size,
          badge: {
            label,
            color: isJumpModule ? 'purple' : 'cyan',
          },
        };
      });

      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: {
          category: 'vehicles',
          subCategory: subCat || 'all',
        },
      };
    }

    if (cat === 'armor') {
      return this.exploreItemsGeneric(
        env,
        language,
        'armor',
        "AND i.type IN ('Armor_Torso', 'Armor_Legs', 'Armor_Arms', 'Armor_Helmet', 'Armor_Backpack', 'Armor', 'Undersuit')",
        armorSubCategoryFilter(subCat),
        whereSearch,
        manufacturer,
        type,
        subCat,
        safeLimit,
        offset,
        page,
        'emerald',
        (r) => determineArmorSubCategory(r.type),
      );
    }

    if (cat === 'clothing') {
      return this.exploreItemsGeneric(
        env,
        language,
        'clothing',
        "AND i.type = 'Clothing'",
        clothingSubCategoryFilter(subCat),
        whereSearch,
        manufacturer,
        type,
        subCat,
        safeLimit,
        offset,
        page,
        'indigo',
        (r) => determineClothingSubCategory(r.attach_type),
      );
    }

    if (cat === 'weapons') {
      return this.exploreItemsGeneric(
        env,
        language,
        'weapons',
        "AND i.type IN ('FPS_Weapon', 'Attachment')",
        weaponsSubCategoryFilter(subCat),
        whereSearch,
        manufacturer,
        type,
        subCat,
        safeLimit,
        offset,
        page,
        'rose',
        (r) => determineWeaponSubCategory(r.type, r.sub_type),
      );
    }

    if (cat === 'utility') {
      return this.exploreItemsGeneric(
        env,
        language,
        'utility',
        "AND (i.type IN ('Gadget', 'Tool') OR (i.type = 'Consumable' AND i.sub_type IN ('SystemAccess', 'Hacking', 'Medical', 'MedPack')))",
        utilitySubCategoryFilter(subCat),
        whereSearch,
        manufacturer,
        type,
        subCat,
        safeLimit,
        offset,
        page,
        'amber',
        (r) => determineUtilitySubCategory(r.type, r.sub_type),
      );
    }

    if (cat === 'ammo') {
      return this.exploreItemsGeneric(
        env,
        language,
        'ammo',
        "AND (i.type = 'Magazine' OR i.sub_type = 'Magazine')",
        '',
        whereSearch,
        manufacturer,
        type,
        subCat,
        safeLimit,
        offset,
        page,
        'amber',
        () => 'magazines',
      );
    }

    if (cat === 'sustenance') {
      return this.exploreItemsGeneric(
        env,
        language,
        'sustenance',
        "AND i.type = 'Consumable' AND i.sub_type IN ('Food', 'Drink', 'OxygenCap')",
        sustenanceSubCategoryFilter(subCat),
        whereSearch,
        manufacturer,
        type,
        subCat,
        safeLimit,
        offset,
        page,
        'lime',
        (r) => determineSustenanceSubCategory(r.sub_type),
      );
    }

    if (cat === 'locations') {
      const subCatFilter = locationsSubCategoryFilter(subCat);
      const countSql = `SELECT COUNT(*) as total FROM game.locations l
        ${translationJoin('l')}
        WHERE l.env = $1
          AND l.name NOT ILIKE '%placeholder%' 
          AND l.name != '' 
          AND LOWER(l.type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
          ${subCatFilter}
          ${whereSearch ? `AND ${nameMatchSql('l', 'name', '$2')}` : ''}`;
      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);

      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        l.uuid,
        ${displayNameSql('l', 'name', language)} AS name,
        l.type,
        l.system_code,
        l.description
      FROM game.locations l
      ${translationJoin('l')}
      WHERE l.env = $1
        AND l.name NOT ILIKE '%placeholder%'
        AND l.name != ''
        AND LOWER(l.type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
        ${subCatFilter}
        ${whereSearch ? `AND ${nameMatchSql('l', 'name', '$2')}` : ''}
      ORDER BY ${displayNameSql('l', 'name', language)} ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((l: Row) => {
        const derivedSubCategory = determineLocationSubCategory(l.type);
        return {
          id: l.uuid,
          uuid: l.uuid,
          name: l.name,
          category: 'locations',
          subCategory: derivedSubCategory,
          type: l.type || uiLabel(language, 'Lieu', 'Location'),
          system: l.system_code,
          badge: {
            label: l.system_code
              ? `${l.system_code} • ${SUB_CATEGORY_LABELS[derivedSubCategory]?.[language] || l.type}`
              : SUB_CATEGORY_LABELS[derivedSubCategory]?.[language] || l.type,
            color: 'amber',
          },
        };
      });

      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: {
          category: 'locations',
          subCategory: subCat || 'all',
        },
      };
    }

    if (cat === 'commodities') {
      const subCatFilter = commoditiesSubCategoryFilter(subCat);
      const countSql = `SELECT COUNT(*) as total FROM game.commodities cm
        ${translationJoin('cm')}
        WHERE cm.env = $1
          AND cm.name NOT ILIKE '%placeholder%' 
          AND cm.name != '' 
          ${subCatFilter}
          ${whereSearch ? `AND ${nameMatchSql('cm', 'name', '$2')}` : ''}`;
      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);

      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        cm.uuid,
        ${displayNameSql('cm', 'name', language)} AS name,
        cm.type,
        cm.sub_type,
        cm.symbol
      FROM game.commodities cm
      ${translationJoin('cm')}
      WHERE cm.env = $1
        AND cm.name NOT ILIKE '%placeholder%'
        AND cm.name != ''
        ${subCatFilter}
        ${whereSearch ? `AND ${nameMatchSql('cm', 'name', '$2')}` : ''}
      ORDER BY ${displayNameSql('cm', 'name', language)} ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((cm: Row) => {
        const derivedSubCategory = determineCommoditySubCategory(cm.type);
        return {
          id: cm.uuid,
          uuid: cm.uuid,
          name: cm.name,
          category: 'commodities',
          subCategory: derivedSubCategory,
          type: cm.type || uiLabel(language, 'Marchandise', 'Commodity'),
          subType: cm.sub_type,
          badge: {
            label: SUB_CATEGORY_LABELS[derivedSubCategory]?.[language] || cm.type || 'Commodity',
            color: 'slate',
          },
        };
      });

      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: {
          category: 'commodities',
          subCategory: subCat || 'all',
        },
      };
    }

    // Default: fallback items
    return this.exploreItemsGeneric(
      env,
      language,
      'items',
      '',
      '',
      whereSearch,
      manufacturer,
      type,
      subCat,
      safeLimit,
      offset,
      page,
      'emerald',
      (r) => r.type || 'items',
    );
  }

  /**
   * Get 360° Pivot Nexus Sheet for an entity, including all relational connections.
   */
  async getEntityNexus(category: string, id: string, env = 'live', lang?: string): Promise<UniverseEntityNexus | null> {
    const language = asLang(lang);
    const cat = (category || '').toLowerCase();

    if (cat === 'ships' || cat === 'fleet') {
      if (id.startsWith('concept-')) {
        const smId = Number(id.replace('concept-', ''));
        if (!Number.isFinite(smId)) return null;
        const conceptRows = await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT
            ('concept-' || sm2.id::text) AS uuid,
            LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) AS class_name,
            sm2.name,
            sm2.manufacturer_code,
            COALESCE(sm2.manufacturer_name, sm2.manufacturer_code) AS manufacturer_name,
            sm2.focus AS role,
            CASE WHEN sm2.type IS NULL OR sm2.type = '' THEN NULL ELSE INITCAP(REPLACE(sm2.type, '-', ' ')) END AS career,
            sm2.mass, sm2.beam AS size_x, sm2.length AS size_y, sm2.height AS size_z,
            sm2.scm_speed, sm2.afterburner_speed AS max_speed, sm2.cargocapacity AS cargo_capacity,
            sm2.min_crew AS crew_size, sm2.min_crew, sm2.max_crew,
            sm2.media_store_small AS thumbnail, sm2.media_store_large AS thumbnail_large,
            sm2.production_status, sm2.description AS sm_description, sm2.url AS store_url,
            sm2.ctm_url, sm2.id AS ship_matrix_id
          FROM rsi.ship_matrix sm2
          WHERE sm2.id = $1
          LIMIT 1`,
          smId,
        );
        if (!conceptRows?.length) return null;
        const ship = convertBigIntToNumber(conceptRows[0]);
        return {
          entity: ship,
          category: 'ships',
          connections: {
            loadout: [],
            purchasableAt: [],
            manufacturer: ship.manufacturer_name ? { code: ship.manufacturer_code, name: ship.manufacturer_name } : null,
          },
        };
      }

      const shipRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          s.*,
          REGEXP_REPLACE(COALESCE(sm.name, s.name), '\\s+GS$', '') AS name,
          tr.raw_json AS translation_json,
          tr.name AS translation_name,
          COALESCE(m.name, s.manufacturer_code) AS manufacturer_name,
          m.known_for AS manufacturer_known_for,
          COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
          sm.description AS sm_description,
          sm.url AS store_url,
          sm.production_status,
          sm.focus AS sm_focus,
          sm.type AS sm_type
        FROM game.ships s
        LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        ${translationJoin('s')}
        WHERE s.env = $1 AND (s.uuid = $2 OR s.class_name = $2)
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!shipRows || shipRows.length === 0) return null;
      const ship = applyLanguage(convertBigIntToNumber(shipRows[0]), language);

      // Fetch equipped loadout with human component names and tree relationships (parent_id)
      const loadoutRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sl.id,
          sl.parent_id,
          sl.port_name,
          sl.port_type,
          sl.port_min_size,
          sl.port_max_size,
          sl.component_class_name,
          sl.component_uuid,
          ${displayNameSql('c', 'name', language)} AS component_name,
          COALESCE(c.type, sl.port_type) AS component_type,
          c.sub_type AS component_sub_type,
          COALESCE(c.size, sl.port_max_size, sl.port_min_size) AS component_size,
          c.grade AS component_grade,
          c.component_class,
          c.manufacturer_code AS component_manufacturer,
          c.weapon_dps,
          c.weapon_damage,
          c.weapon_fire_rate,
          c.weapon_range,
          c.weapon_ammo_count,
          c.weapon_damage_type,
          c.weapon_speed,
          c.weapon_burst_dps,
          c.weapon_sustained_dps,
          c.weapon_alpha_damage,
          c.shield_hp,
          c.shield_regen,
          c.shield_hardening,
          c.shield_faces,
          c.qd_speed AS quantum_speed,
          c.qd_spool_time AS quantum_spool_time,
          c.qd_range AS quantum_range,
          c.qd_fuel_rate,
          c.qd_cooldown,
          c.cooling_rate AS cooler_cooling_rate,
          c.power_output,
          c.em_signature,
          c.ir_signature,
          c.thruster_max_thrust,
          c.thruster_type,
          c.cm_ammo_count
        FROM game.ship_loadouts sl
        LEFT JOIN game.components c ON (c.uuid = sl.component_uuid OR c.class_name = sl.component_class_name) AND c.env = $1
        ${translationJoin('c')}
        WHERE sl.ship_uuid = $2 AND sl.env = $1
        ORDER BY sl.id ASC`,
        toPostgres(env),
        ship.uuid,
      );

      // Fetch shops where this ship is purchasable / rentable in aUEC
      const shopsRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sh.id AS shop_id,
          sh.name AS shop_name,
          sh.location,
          sh.system,
          sh.planet_moon,
          sh.city,
          si.base_price AS price_auec,
          si.rental_price_1d,
          si.rental_price_3d,
          si.rental_price_7d,
          si.rental_price_30d
        FROM game.shop_inventory si
        JOIN game.shops sh ON sh.id = si.shop_id AND sh.env = $1
        WHERE (si.component_uuid = $2 OR si.component_class_name = $3)
        ORDER BY si.base_price ASC`,
        toPostgres(env),
        ship.uuid,
        ship.class_name,
      );

      return {
        entity: ship,
        category: 'ships',
        connections: {
          loadout: convertBigIntToNumber(loadoutRows),
          purchasableAt: convertBigIntToNumber(shopsRows),
          manufacturer: ship.manufacturer_name
            ? {
                code: ship.manufacturer_code,
                name: ship.manufacturer_name,
                known_for: ship.manufacturer_known_for,
              }
            : null,
        },
      };
    }

    if (cat === 'components' || cat === 'vehicles') {
      const compRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          c.*,
          tr.raw_json AS translation_json,
          tr.name AS translation_name,
          COALESCE(m.name, c.manufacturer_code) AS manufacturer_name,
          m.known_for AS manufacturer_known_for
        FROM game.components c
        LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
        ${translationJoin('c')}
        WHERE c.env = $1 AND (c.uuid = $2 OR c.class_name = $2)
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!compRows || compRows.length === 0) return null;
      const component = applyLanguage(convertBigIntToNumber(compRows[0]), language);

      // Find ships equipping this component
      const equippedShips = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT DISTINCT
          s.uuid,
          s.class_name,
          ${displayNameSql('s', 'name', language)} AS name,
          s.role,
          COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
          sl.port_name,
          sl.port_type
        FROM game.ship_loadouts sl
        JOIN game.ships s ON s.uuid = sl.ship_uuid AND s.env = $1
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        ${translationJoin('s')}
        WHERE (sl.component_uuid = $2 OR sl.component_class_name = $3)
          AND s.name NOT ILIKE '%placeholder%'
        ORDER BY ${displayNameSql('s', 'name', language)} ASC
        LIMIT 30`,
        toPostgres(env),
        component.uuid,
        component.class_name,
      );

      // Find shops selling this component
      const shopRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sh.id AS shop_id,
          sh.name AS shop_name,
          sh.location,
          sh.system,
          sh.planet_moon,
          sh.city,
          si.base_price AS price_auec,
          si.current_inventory AS stock
        FROM game.shop_inventory si
        JOIN game.shops sh ON sh.id = si.shop_id AND sh.env = $1
        WHERE (si.component_uuid = $2 OR si.component_class_name = $3)
        ORDER BY si.base_price ASC`,
        toPostgres(env),
        component.uuid,
        component.class_name,
      );

      return {
        entity: component,
        category: 'components',
        connections: {
          equippedOn: convertBigIntToNumber(equippedShips),
          purchasableAt: convertBigIntToNumber(shopRows),
          manufacturer: component.manufacturer_name
            ? {
                code: component.manufacturer_code,
                name: component.manufacturer_name,
                known_for: component.manufacturer_known_for,
              }
            : null,
        },
      };
    }

    if (cat === 'locations') {
      const locRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          l.*,
          tr.raw_json AS translation_json,
          tr.name AS translation_name,
          sml.name AS starmap_name,
          sml.code AS starmap_code
        FROM game.locations l
        LEFT JOIN rsi.starmap_locations sml ON sml.id = l.rsi_starmap_location_id
        ${translationJoin('l')}
        WHERE l.env = $1 AND l.uuid = $2
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!locRows || locRows.length === 0) return null;
      const location = applyLanguage(convertBigIntToNumber(locRows[0]), language);

      // Fetch shops attached to this location
      const shops = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sh.id,
          sh.name,
          sh.shop_type,
          sh.city,
          sh.planet_moon,
          sh.system,
          (SELECT COUNT(*) FROM game.shop_inventory si WHERE si.shop_id = sh.id) AS inventory_count
        FROM game.shops sh
        WHERE sh.env = $1 AND (sh.location_uuid = $2 OR sh.location ILIKE $3)
        ORDER BY sh.name ASC`,
        toPostgres(env),
        location.uuid,
        `%${location.name}%`,
      );

      return {
        entity: location,
        category: 'locations',
        connections: {
          shops: convertBigIntToNumber(shops),
        },
      };
    }

    if (cat === 'commodities') {
      const commRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          cm.*,
          tr.raw_json AS translation_json,
          tr.name AS translation_name
        FROM game.commodities cm
        ${translationJoin('cm')}
        WHERE cm.env = $1 AND (cm.uuid = $2 OR cm.class_name = $2)
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (commRows && commRows.length > 0) {
        const commodity = applyLanguage(convertBigIntToNumber(commRows[0]), language);

        const priceRows = await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT 
            sh.id AS shop_id,
            sh.name AS shop_name,
            sh.location,
            sh.system,
            sh.planet_moon,
            sh.city,
            cp.buy_price,
            cp.sell_price,
            cp.reported_at
          FROM game.commodity_prices cp
          JOIN game.shops sh ON sh.id = cp.shop_id AND sh.env = $1
          WHERE cp.commodity_uuid = $2 AND cp.commodity_env = $1
          ORDER BY cp.sell_price DESC NULLS LAST`,
          toPostgres(env),
          commodity.uuid,
        );

        return {
          entity: commodity,
          category: 'commodities',
          connections: {
            marketOffers: convertBigIntToNumber(priceRows),
            purchasableAt: convertBigIntToNumber(priceRows).map((p: Row) => ({
              shop_id: p.shop_id,
              shop_name: p.shop_name,
              location: p.location,
              system: p.system,
              planet_moon: p.planet_moon,
              city: p.city,
              price_auec: p.buy_price || p.sell_price,
            })),
          },
        };
      }
    }

    // Default item (armor, clothing, weapons, utility, ammo, sustenance, items)
    const itemRows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT 
        i.*,
        tr.raw_json AS translation_json,
        tr.name AS translation_name,
        COALESCE(m.name, i.manufacturer_code) AS manufacturer_name,
        m.known_for AS manufacturer_known_for
      FROM game.items i
      LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
      ${translationJoin('i')}
      WHERE i.env = $1 AND (i.uuid = $2 OR i.class_name = $2)
      LIMIT 1`,
      toPostgres(env),
      id,
    );

    if (!itemRows || itemRows.length === 0) return null;
    const item = applyLanguage(convertBigIntToNumber(itemRows[0]), language);

    // Shops selling this item
    const shopRows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT 
        sh.id AS shop_id,
        sh.name AS shop_name,
        sh.location,
        sh.system,
        sh.planet_moon,
        sh.city,
        si.base_price AS price_auec,
        si.current_inventory AS stock
      FROM game.shop_inventory si
      JOIN game.shops sh ON sh.id = si.shop_id AND sh.env = $1
      WHERE (si.component_uuid = $2 OR si.component_class_name = $3)
      ORDER BY si.base_price ASC`,
      toPostgres(env),
      item.uuid,
      item.class_name,
    );

    return {
      entity: item,
      category: 'items',
      connections: {
        purchasableAt: convertBigIntToNumber(shopRows),
        manufacturer: item.manufacturer_name
          ? {
              code: item.manufacturer_code,
              name: item.manufacturer_name,
              known_for: item.manufacturer_known_for,
            }
          : null,
      },
    };
  }
}
