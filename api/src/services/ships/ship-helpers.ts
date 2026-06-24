import type { Row } from '../shared.js';

// prettier-ignore
export const SHIP_SELECT = [
  // Identity
  's.uuid',
  's.class_name',
  'COALESCE(sm.name, s.name) as name',
  's.manufacturer_code',
  'm.name as manufacturer_name',
  // Role & career
  's.career',
  's.role',
  // Physical
  's.mass',
  's.total_hp',
  'COALESCE(s.size_x, sm.beam) as size_x',
  'COALESCE(s.size_y, sm.length) as size_y',
  'COALESCE(s.size_z, sm.height) as size_z',
  // Flight
  's.scm_speed',
  's.max_speed',
  's.boost_speed_forward',
  's.boost_speed_backward',
  's.pitch_max',
  's.yaw_max',
  's.roll_max',
  's.boost_ramp_up',
  's.boost_ramp_down',
  // Resources
  's.hydrogen_fuel_capacity',
  's.quantum_fuel_capacity',
  'COALESCE(s.cargo_capacity, sm.cargocapacity) as cargo_capacity',
  's.crew_size',
  's.shield_hp',
  's.shield_regen',
  's.shield_regen_delay',
  's.shield_down_delay',
  // Combat
  's.missile_damage_total',
  's.weapon_damage_total',
  // Armor & signals
  's.armor_physical',
  's.armor_energy',
  's.armor_distortion',
  's.armor_hp',
  's.armor_phys_resist',
  's.armor_energy_resist',
  's.armor_signal_ir',
  's.armor_signal_em',
  's.armor_signal_cs',
  's.fuse_penetration',
  's.component_penetration',
  // Cross sections
  's.cross_section_x',
  's.cross_section_y',
  's.cross_section_z',
  // Ship Matrix / media
  's.ship_matrix_id',
  'COALESCE(ship_thumb.thumbnail_url, sm.media_store_small) as thumbnail',
  'COALESCE(ship_thumb.url, sm.media_store_large) as thumbnail_large',
  'sm.production_status',
  'sm.description as sm_description',
  'sm.url as store_url',
  'sm.min_crew',
  'sm.max_crew',
  // 3D model
  's.ctm_url',
  // Meta
  's.vehicle_category',
  's.insurance_claim_time',
  's.insurance_expedite_cost',
  's.short_name',
  's.variant_type',
  'ship_market.min_purchase_price',
  'ship_market.min_rental_price_1d',
  'ship_market.min_rental_price_3d',
  'ship_market.min_rental_price_7d',
  'ship_market.min_rental_price_30d',
  'COALESCE(ship_market.purchase_location_count, 0)::integer as purchase_location_count',
  'COALESCE(ship_market.rental_location_count, 0)::integer as rental_location_count',
].join(', ');

export const SHIP_MATRIX_CATEGORY_SQL = `CASE
  WHEN LOWER(COALESCE(sm2.type, '')) = 'gravlev'
    OR LOWER(COALESCE(sm2.url, '')) ~ '(x1|nox|dragonfly|hoverquad|pulse)'
    THEN 'gravlev'
  WHEN LOWER(COALESCE(sm2.type, '')) = 'ground'
    OR (LOWER(COALESCE(sm2.type, '')) = 'competition' AND LOWER(COALESCE(sm2.size, '')) = 'vehicle')
    OR LOWER(COALESCE(sm2.url, '')) ~ '(g12|ranger|cyclone|ursa|rover|lynx|roc|mule|storm|nova|ballista|centurion|spartan|ptv|utv)'
    THEN 'ground'
  ELSE 'ship'
END`;

// prettier-ignore
export const CONCEPT_SELECT = [
  // Identity (derived from ship_matrix alias sm2)
  "'concept-' || sm2.id::text as uuid",
  "LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) as class_name",
  'sm2.name',
  'sm2.manufacturer_code',
  'sm2.manufacturer_name as manufacturer_name',
  // Role & career from RSI marketing data
  "CASE WHEN sm2.type IS NULL OR sm2.type = '' THEN NULL ELSE INITCAP(REPLACE(sm2.type, '-', ' ')) END as career",
  'sm2.focus as role',
  // Physical
  'sm2.mass',
  'NULL as total_hp',
  'sm2.beam as size_x',
  'sm2.length as size_y',
  'sm2.height as size_z',
  // Flight
  'sm2.scm_speed',
  'sm2.afterburner_speed as max_speed',
  'NULL as boost_speed_forward',
  'NULL as boost_speed_backward',
  'sm2.pitch_max',
  'sm2.yaw_max',
  'sm2.roll_max',
  'NULL as boost_ramp_up',
  'NULL as boost_ramp_down',
  // Resources
  'NULL as hydrogen_fuel_capacity',
  'NULL as quantum_fuel_capacity',
  'sm2.cargocapacity as cargo_capacity',
  'sm2.min_crew as crew_size',
  'NULL as shield_hp',
  'NULL as shield_regen',
  'NULL as shield_regen_delay',
  'NULL as shield_down_delay',
  // Combat
  'NULL as missile_damage_total',
  'NULL as weapon_damage_total',
  // Armor & signals
  'NULL as armor_physical',
  'NULL as armor_energy',
  'NULL as armor_distortion',
  'NULL as armor_hp',
  'NULL as armor_phys_resist',
  'NULL as armor_energy_resist',
  'NULL as armor_signal_ir',
  'NULL as armor_signal_em',
  'NULL as armor_signal_cs',
  'NULL as fuse_penetration',
  'NULL as component_penetration',
  // Cross sections
  'NULL as cross_section_x',
  'NULL as cross_section_y',
  'NULL as cross_section_z',
  // Ship Matrix / media
  'sm2.id as ship_matrix_id',
  'sm2.media_store_small as thumbnail',
  'sm2.media_store_large as thumbnail_large',
  'sm2.production_status',
  'sm2.description as sm_description',
  'sm2.url as store_url',
  'sm2.min_crew',
  'sm2.max_crew',
  // 3D model
  'sm2.ctm_url',
  // Meta
  `${SHIP_MATRIX_CATEGORY_SQL} as vehicle_category`,
  'NULL as insurance_claim_time',
  'NULL as insurance_expedite_cost',
  'NULL as short_name',
  'NULL as variant_type',
  'NULL::numeric as min_purchase_price',
  'NULL::numeric as min_rental_price_1d',
  'NULL::numeric as min_rental_price_3d',
  'NULL::numeric as min_rental_price_7d',
  'NULL::numeric as min_rental_price_30d',
  '0::integer as purchase_location_count',
  '0::integer as rental_location_count',
].join(', ');

export const SHIP_MATRIX_UPCOMING_STATUSES = new Set(['in-concept', 'in-production', 'in-development']);
export const SHIP_MATRIX_UPCOMING_SQL = "sm2.production_status IN ('in-concept', 'in-production', 'in-development')";

export const SHIP_JOINS = `FROM game.ships s
  LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code
  LEFT JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
  LEFT JOIN LATERAL (
    SELECT g.url, COALESCE(g.thumbnail_url, g.url) as thumbnail_url
    FROM rsi.ship_galleries g
    WHERE g.ship_matrix_id = sm.id
      AND g.url LIKE '%robertsspaceindustries.com/i/%'
      AND g.url ~* '\\.(webp|png|jpg|jpeg)$'
    ORDER BY g.position ASC, g.id ASC
    LIMIT 1
  ) ship_thumb ON TRUE
  LEFT JOIN (
    SELECT
      p.env,
      p.ship_uuid,
      MIN(p.price) FILTER (WHERE p.price_kind = 'buy' AND p.price > 0) as min_purchase_price,
      MIN(p.price) FILTER (WHERE p.price_kind = 'rent' AND p.price > 0) as min_rental_price_1d,
      NULL::numeric as min_rental_price_3d,
      NULL::numeric as min_rental_price_7d,
      NULL::numeric as min_rental_price_30d,
      COUNT(DISTINCT p.terminal_uex_id) FILTER (WHERE p.price_kind = 'buy' AND p.price > 0) as purchase_location_count,
      COUNT(DISTINCT p.terminal_uex_id) FILTER (WHERE p.price_kind = 'rent' AND p.price > 0) as rental_location_count
    FROM game.uex_vehicle_prices p
    WHERE p.ship_uuid IS NOT NULL
    GROUP BY p.env, p.ship_uuid
  ) ship_market ON ship_market.env = s.env
    AND ship_market.ship_uuid = s.uuid`;

export function galleryMediaKey(url: string): string {
  return (
    url.match(/media\.robertsspaceindustries\.com\/([a-z0-9]+)\//i)?.[1] ??
    url.match(/resize\([^)]*,([A-Za-z0-9]+)\)\/(?:source|[^/]+)\.webp/i)?.[1] ??
    url.match(/robertsspaceindustries\.com\/i\/([a-f0-9]+)\//i)?.[1] ??
    url.replace(/\/(?:source|store_slideshow_small)\.(webp|png|jpe?g)$/i, '')
  );
}

export function gallerySource(url: string, kind?: string | null): 'pledge' | 'media' | 'fallback' {
  if (kind === 'ship-matrix-media') return 'fallback';
  if (url.includes('media.robertsspaceindustries.com')) return 'media';
  if (url.includes('robertsspaceindustries.com/i/')) return 'pledge';
  return 'fallback';
}

export const GALLERY_SOURCE_ORDER = { pledge: 0, media: 1, fallback: 2 } as const;

export function isGalleryImageUrl(url: string): boolean {
  return /\.(?:webp|png|jpe?g)(?:[?#].*)?$/i.test(url);
}

export function galleryImageScore(url: string): number {
  const lower = url.toLowerCase();
  const width = Number.parseInt(url.match(/resize\((\d+),/)?.[1] ?? '0', 10);
  if (lower.includes('/wallpaper_3840x2160.')) return 6000;
  if (lower.includes('/store_slideshow_large_zoom.')) return 5000;
  if (lower.includes('/store_slideshow_large.')) return 4000;
  if (lower.includes('/slideshow_wide.')) return 3000;
  if (lower.includes('/slideshow.')) return 2500;
  if (lower.includes('/source.')) return 2000 + (Number.isFinite(width) ? width : 0);
  return Number.isFinite(width) ? width : 0;
}

export function galleryImageRank(row: Row): number {
  const url = String(row.url ?? '');
  const source = gallerySource(url, String(row.kind ?? ''));
  return (3 - GALLERY_SOURCE_ORDER[source]) * 100_000 + galleryImageScore(url);
}

/**
 * Dot-notation sort keys that map to JSONB path expressions on the game_data column.
 */
export const SHIP_JSON_SORT_MAP: Record<string, string> = {
  'game_data.scm_speed': "(s.game_data#>>'{ifcs,scm_speed}')::numeric",
  'game_data.max_speed': "(s.game_data#>>'{ifcs,max_speed}')::numeric",
  'game_data.cargo_capacity': "(s.game_data#>>'{cargoGrid,cargoCapacity}')::numeric",
  'game_data.hydrogen_fuel': "(s.game_data#>>'{hydro_fuel_capacity}')::numeric",
  'game_data.quantum_fuel': "(s.game_data#>>'{quantum_fuel_capacity}')::numeric",
  'game_data.shield_hp': "(s.game_data#>>'{shield_hp}')::numeric",
  'game_data.total_hp': "(s.game_data#>>'{total_hp}')::numeric",
  'game_data.missile_damage_total': "(s.game_data#>>'{missile_damage_total}')::numeric",
  'game_data.weapon_damage_total': "(s.game_data#>>'{weapon_damage_total}')::numeric",
  'game_data.pitch_max': "(s.game_data#>>'{ifcs,pitch_max}')::numeric",
  'game_data.yaw_max': "(s.game_data#>>'{ifcs,yaw_max}')::numeric",
  'game_data.roll_max': "(s.game_data#>>'{ifcs,roll_max}')::numeric",
};

export const SHIP_SORT_EXPRESSION_MAP: Record<string, string> = {
  min_purchase_price: 'ship_market.min_purchase_price',
  min_rental_price_1d: 'ship_market.min_rental_price_1d',
  purchase_location_count: 'ship_market.purchase_location_count',
  rental_location_count: 'ship_market.rental_location_count',
};

export const SHIP_SORT = new Set([
  'name',
  'class_name',
  'manufacturer_code',
  'mass',
  'scm_speed',
  'max_speed',
  'total_hp',
  'shield_hp',
  'crew_size',
  'cargo_capacity',
  'missile_damage_total',
  'weapon_damage_total',
  'armor_physical',
  'armor_energy',
  'armor_distortion',
  'cross_section_x',
  'cross_section_y',
  'cross_section_z',
  'hydrogen_fuel_capacity',
  'quantum_fuel_capacity',
  'min_purchase_price',
  'min_rental_price_1d',
  'purchase_location_count',
  'rental_location_count',
  'insurance_claim_time',
  'insurance_expedite_cost',
  'boost_speed_forward',
  'pitch_max',
  'yaw_max',
  'roll_max',
  'armor_phys_resist',
  'armor_energy_resist',
  'armor_signal_ir',
  'armor_signal_em',
  'armor_signal_cs',
]);
