/**
 * Shop Extractor — Extracts physical shop instances from P4K Prefab XMLs + DataForge ShopFranchise
 *
 * Source of truth:
 *   - Data/Prefabs/shops/<category>/<franchise>_<location>[_variant].xml
 *     → encodes shop identity (franchise slug) + placement (location slug) + type (folder category)
 *   - DataForge ShopFranchise struct (SF_* records)
 *     → maps franchise slug → localization key → display name
 *
 * This replaces the old approach of reading SCItemManufacturer records which
 * only yielded ~18 generic franchise templates with no location data.
 */

import type { DataForgeContext } from './dataforge-utils.js';
import type { LocalizationService } from './localization-service.js';
import type { P4KProvider } from './p4k-provider.js';
import logger from './logger.js';

// ── Category folder → shop_type mapping ─────────────────────────────────────

const CATEGORY_TO_SHOP_TYPE: Record<string, string> = {
  personalweapon: 'weapons',
  armor:          'armor',
  clothing:       'clothing',
  dealership:     'vehicles',
  bar:            'food_drink',
  commex:         'commodities',
  medical:        'medical',
  service:        'service',
  bounty:         'bounty',
  vendor:         'general',
  components:     'components',
  utility:        'utility',
  shippart:       'ship_parts',
  customs:        'general',
};

// ── Franchise slug fallback names (when DataForge / localization fails) ──────

const FRANCHISE_SLUG_FALLBACK: Record<string, string> = {
  // Well-known shops
  casabaoutlet:         'Casaba Outlet',
  centermass:           'CenterMass',
  cubbyblast:           'Cubby Blast',
  skutters:             'Skutters',
  cordrys:              "Cordry's",
  conscientiousobjects: 'Conscientious Objects',
  astroarmada:          'Astro Armada',
  newdeal:              'New Deal',
  dumperdepot:          "Dumper's Depot",
  dumpersdepot:         "Dumper's Depot",
  regal:                'Regal Luxury Rentals',
  vantage:              'Vantage Rentals',
  ftl:                  'FTL Transports',
  shubin:               'Shubin Interstellar',
  tdd:                  'Trade & Development Division',
  kctrading:            'KC Trading',
  kctrending:           'KC Trending',          // actual filename slug
  platinumbay:          'Platinum Bay',
  cousincrows:          "Cousin Crow's Custom Crafts",
  cousincrow:           "Cousin Crow's Custom Crafts",
  livefire:             'Live Fire Weapons',
  livefireweapons:      'Live Fire Weapons',    // actual filename slug
  livefirewepons:       'Live Fire Weapons',    // typo in game files
  hurstonshowroom:      'Hurston Dynamics Showroom',
  hurston:              'Hurston Dynamics Showroom',
  omegapro:             'Omega Pro',
  garrity:              'Garrity Defense',
  garritydefense:       'Garrity Defense',
  factoryline:          'Factory Line',
  tammany:              'Tammany and Sons',
  tammanysonandsons:    'Tammany and Sons',
  aparelli:             'Aparelli',
  procyon:              'Procyon CDF',
  procyoncdf:           'Procyon CDF',
  makau:                'Makau Defense',
  makaudefense:         'Makau Defense',
  kelto:                'Kel-To',
  crusaderprovidence:   'Crusader Providence Surplus',
  crusaderindustries:   'Crusader Industries',
  microtech:            'mTech',
  reclamation:          'Reclamation & Disposal',
  kgb:                  'KGB Armory',
  torchbearer:          'Torchbearer',
  fta:                  'Federal Trade Alliance',
  // Shops found in current P4K Prefabs
  cafemusain:           'Café Musain',
  gloc:                 'Glo-C',
  old38:                'Old 38',
  technotic:            'Technotic',
  libertymaintenance:   'Liberty Maintenance',
  medicalunit:          'Medical Unit',
  independent:          'Independent',
  customs:              'Customs',
  admin:                'Admin Center',
  street:               'Street Vendor',
};

// ── Location slug direct overrides (filename slug → exact game loc_key) ──────
// Used when the filename slug doesn't match the location display name slug.
// loc_keys are stable game constants (localization keys in global.ini).

const LOCATION_SLUG_OVERRIDES: Record<string, string> = {
  // Shops on ArcCorp use "arccorp" in filenames, but the landing zone is "Area 18"
  arccorp: '@ui_pregame_port_Area18_name',
};

// ── Template / non-physical location slugs to skip ───────────────────────────
// These appear as "location" slugs in filenames but indicate templates or props.

const SKIP_LOCATION_SLUGS = new Set([
  'franchise',    // generic franchise template (e.g. casabaoutlet_franchise_sizeb.xml)
  'prop',         // prop placeholder
  'intcomponent', // internal component
  'component',
  'vendor',       // street_vendor.xml
]);

// ── Size/variant suffixes to strip from filename stem ────────────────────────

const SIZE_SUFFIX_RE = /_(sizea|sizeb|sizec|size[a-z]?|v\d+|small|med|large|int)$/i;

// ── Exported types ────────────────────────────────────────────────────────────

export interface ShopExtractRecord {
  /** Filename stem, e.g. "casabaoutlet_portolisar" */
  className: string;
  /** Franchise part, e.g. "casabaoutlet" */
  franchiseSlug: string;
  /** Location part from filename, e.g. "portolisar" */
  locationSlug: string;
  /** Normalized shop category, e.g. "clothing" */
  shopType: string;
  /** Human-readable shop name, e.g. "Casaba Outlet" */
  name: string;
  /** Localization key from ShopFranchise, e.g. "@item_NameShop_CasabaOutlet" */
  franchiseLocKey: string | null;
}

// ── Franchise resolution from DataForge ──────────────────────────────────────

function buildFranchiseMap(ctx: DataForgeContext): Map<string, { locKey: string; name: string | null }> {
  const result = new Map<string, { locKey: string; name: string | null }>();
  const dfData = ctx.getDfData();
  if (!dfData) return result;

  const structIdx = dfData.structDefs.findIndex((s) => s.name === 'ShopFranchise');
  if (structIdx === -1) {
    logger.warn('ShopFranchise struct not found in DataForge', { module: 'shop-extractor' });
    return result;
  }

  for (const r of dfData.records) {
    if (r.structIndex !== structIdx) continue;
    try {
      const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 3);
      if (!data) continue;

      // Record name pattern: "ShopFranchise.SF_casabaoutlet"
      const rawName = r.name || '';
      const slug = rawName.replace(/^ShopFranchise\./i, '').replace(/^SF_/i, '').toLowerCase();
      if (!slug) continue;

      const locKey = typeof data.name === 'string' ? data.name : null;
      result.set(slug, { locKey: locKey ?? '', name: null });
    } catch {
      // Skip
    }
  }

  logger.info(`ShopFranchise: loaded ${result.size} franchise records`, { module: 'shop-extractor' });
  return result;
}

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extract physical shop instances from P4K Prefab XMLs.
 * Returns one ShopExtractRecord per real shop (skips templates/props).
 */
export async function extractShopsFromPrefabs(
  ctx: DataForgeContext,
  provider: P4KProvider,
  locService: LocalizationService,
): Promise<ShopExtractRecord[]> {
  const results: ShopExtractRecord[] = [];

  // 1. Build franchise map from DataForge + resolve display names
  const franchiseMap = buildFranchiseMap(ctx);
  for (const [slug, entry] of franchiseMap) {
    if (entry.locKey) {
      const resolved = locService.resolveKey(entry.locKey);
      if (resolved) entry.name = resolved;
    }
    if (!entry.name) entry.name = FRANCHISE_SLUG_FALLBACK[slug] ?? null;
  }

  // 2. Find all Prefab shop XML files
  const shopPrefabs = await provider.findFiles(/Data[/\\]Prefabs[/\\]shops[/\\].*\.xml$/i, 500);
  logger.info(`Shop Prefabs: found ${shopPrefabs.length} XML files`, { module: 'shop-extractor' });

  for (const entry of shopPrefabs) {
    const filePath = entry.fileName.replace(/\\/g, '/');

    // Extract category from path: .../shops/<category>/<filename>.xml
    const pathParts = filePath.split('/');
    const shopIdx = pathParts.findIndex((p) => p.toLowerCase() === 'shops');
    const category = shopIdx >= 0 && pathParts.length > shopIdx + 1
      ? pathParts[shopIdx + 1].toLowerCase()
      : 'general';

    const fileName = pathParts[pathParts.length - 1];
    const rawStem = fileName.replace(/\.xml$/i, '').toLowerCase();

    // Strip size/variant suffixes iteratively
    let stem = rawStem;
    let prev = '';
    while (stem !== prev) {
      prev = stem;
      stem = stem.replace(SIZE_SUFFIX_RE, '');
    }

    // Skip single-word filenames (no location encoded) — these are generic assets
    // e.g. admin.xml, casabaoutlet.xml, livefireweapons.xml, street_vendor.xml
    if (!stem.includes('_')) {
      logger.debug(`Skipping single-name Prefab: ${fileName}`, { module: 'shop-extractor' });
      continue;
    }

    // Split into franchise slug + location slug
    // Strategy: try to find longest known franchise prefix
    const parts = stem.split('_');
    let franchiseSlug = '';
    let locationSlug = '';

    for (let i = parts.length - 1; i >= 1; i--) {
      const candidate = parts.slice(0, i).join('');
      if (franchiseMap.has(candidate) || FRANCHISE_SLUG_FALLBACK[candidate]) {
        franchiseSlug = candidate;
        locationSlug = parts.slice(i).join('');
        break;
      }
    }

    // Fallback: first segment = franchise, rest = location
    if (!franchiseSlug) {
      franchiseSlug = parts[0];
      locationSlug = parts.slice(1).join('');
    }

    // Skip template / prop files
    if (SKIP_LOCATION_SLUGS.has(locationSlug)) {
      logger.debug(`Skipping template Prefab: ${fileName} (location="${locationSlug}")`, { module: 'shop-extractor' });
      continue;
    }

    // Resolve shop type from category folder
    const shopType = CATEGORY_TO_SHOP_TYPE[category] ?? 'general';

    // Resolve display name: DataForge franchise → localization → fallback map → slugified
    const franchiseEntry = franchiseMap.get(franchiseSlug);
    let name = franchiseEntry?.name ?? FRANCHISE_SLUG_FALLBACK[franchiseSlug] ?? null;
    const franchiseLocKey = franchiseEntry?.locKey || null;

    if (!name) {
      // Last resort: convert slug to Title Case
      name = franchiseSlug
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }

    results.push({
      className: stem,
      franchiseSlug,
      locationSlug,
      shopType,
      name,
      franchiseLocKey,
    });
  }

  // Deduplicate by className
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    if (seen.has(r.className)) return false;
    seen.add(r.className);
    return true;
  });

  logger.info(
    `Shop Prefabs: extracted ${unique.length} physical shop instances (${shopPrefabs.length - unique.length} templates/assets skipped)`,
    { module: 'shop-extractor' },
  );
  return unique;
}

// ── Location slug resolution helper ──────────────────────────────────────────

/**
 * Build a slug → loc_key index from the locations table.
 *
 * Indexes by:
 *   1. Normalized full class_name (unique, highest confidence)
 *   2. Normalized full display name (e.g. "area18" from "Area 18")
 *   3. Direct overrides from LOCATION_SLUG_OVERRIDES (hardcoded game-slug → loc_key)
 *
 * Intentionally NO word-level indexing to avoid ambiguity when multiple locations
 * share common words (e.g. "ArcCorp Mining Area 045" and "Area 18" both contain "area").
 */
export function buildLocationSlugIndex(
  locationRows: Array<{ class_name: string; name: string; loc_key: string | null; type: string }>,
): Map<string, string> {
  const index = new Map<string, string>();

  for (const row of locationRows) {
    if (!row.loc_key) continue;
    const locKey = row.loc_key;

    // Index by full normalized class_name (e.g. "stanton3area18")
    const classSlug = row.class_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (classSlug) index.set(classSlug, locKey);

    // Index by full normalized display name (e.g. "area18", "grimhex", "levski")
    // Don't overwrite an existing entry — first-seen wins (prefer earlier/simpler names)
    const nameSlug = row.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (nameSlug && !index.has(nameSlug)) index.set(nameSlug, locKey);
  }

  // Apply direct overrides LAST — these always win over auto-derived entries
  for (const [slug, locKey] of Object.entries(LOCATION_SLUG_OVERRIDES)) {
    index.set(slug, locKey);
  }

  return index;
}
