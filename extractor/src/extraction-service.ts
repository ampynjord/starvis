/**
 * ExtractionService — Full extraction pipeline from P4K/DataForge to PostgreSQL
 *
 * This service runs locally on the user's PC with access to the P4K file.
 * It parses binary game data, extracts ships/components/paints/shops,
 * and writes everything to the remote PostgreSQL database (schemas: game, rsi, meta).
 */
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { canonicalizeCommodityRecord, canonicalizeComponentRecord, canonicalizeItemRecord } from './canonical-source.js';
import { getGameComponentCategory } from './component-taxonomy.js';
import { extractCraftingRecipes } from './crafting-extractor.js';
import {
  applyDimensionsFallback,
  applyHullSeriesCargoFallback,
  crossReferenceShipMatrix,
  crossReferenceStarmapLocations,
  populateChassisId,
  pruneExcludedVariants,
  tagVariantTypes,
} from './crossref.js';
import { type ShipToScrape, scrapeShipCtmUrls } from './ctm-scraper.js';
import { classifyPort, type DataForgeService } from './dataforge-service.js';
import { LocalizationService } from './localization-service.js';
import { extractLocations } from './location-extractor.js';
import logger from './logger.js';
import { extractMiningCompositions, extractMiningElements } from './mining-extractor.js';
import {
  extractMissionBlueprintLinks,
  extractMissionFactionData,
  extractMissionMbeEnrichment,
  extractMissions,
} from './mission-extractor.js';
import { RsiSyncService } from './rsi-sync-service.js';
import { buildLocationSlugIndex, extractShopsFromPrefabs } from './shop-extractor.js';

export type ExtractionModule =
  | 'ships'
  | 'components'
  | 'items'
  | 'commodities'
  | 'mining'
  | 'missions'
  | 'crafting'
  | 'paints'
  | 'shops'
  | 'ctm'
  | 'locations'
  // RSI/SC Wiki sync modules (no P4K required, uses rsi_website DB)
  | 'galactapedia'
  | 'comm-links'
  | 'starmap'
  | 'ship-matrix'
  | 'organizations';

export type GameEnv = 'live' | 'ptu' | 'custom';

export interface ExtractionOptions {
  /** Which modules to run. Use `new Set(['all'])` for everything. */
  modules: Set<ExtractionModule | 'all'>;
  /** Game environment label — stored in meta.extraction_log. */
  env: GameEnv;
  /** PostgreSQL pool — same pool used for game + rsi schemas (single DB). */
  rsiPool?: Pool;
  /**
   * CTM scraping mode:
   * - `false` (default): incremental — only ships with `ctm_url IS NULL`
   * - `true`: force — rescrape all ships regardless of existing URL
   */
  ctmForce?: boolean;
  /**
   * Number of ships to scrape concurrently in the CTM module (default: 1).
   * Increase (e.g. 3–4) to parallelise browser sessions and reduce total scrape time.
   */
  ctmConcurrency?: number;
}

const DEFAULT_OPTIONS: ExtractionOptions = { modules: new Set(['all']), env: 'live' };

export interface ExtractionStats {
  manufacturers: number;
  ships: number;
  components: number;
  items: number;
  commodities: number;
  loadoutPorts: number;
  shops: number;
  shipMatrixLinked: number;
  miningElements: number;
  miningCompositions: number;
  missions: number;
  craftingRecipes: number;
  locations: number;
  starmapLocationsLinked: number;
  errors: string[];
  extractionHash?: string;
  durationMs?: number;
}

export class ExtractionService {
  private _extracting = false;
  public locService: LocalizationService;

  /** Default batch size for multi-row INSERT statements */
  private static readonly BATCH_SIZE = 50;

  constructor(
    private pool: Pool,
    private dfService: DataForgeService | null,
  ) {
    this.locService = new LocalizationService();
  }

  /** Non-null accessor — only call from methods that run with P4K modules (not 'ctm'). */
  private get df(): DataForgeService {
    return this.dfService!;
  }

  // ── Batch INSERT helper ──

  /**
   * Execute a multi-row INSERT … ON CONFLICT DO UPDATE in batches (PostgreSQL).
   * @param conn pg PoolClient
   * @param insertHead SQL before VALUES: "INSERT INTO schema.tbl (c1, c2)"
   * @param conflictClause ON CONFLICT clause: "(unique_col) DO UPDATE SET …" or "DO NOTHING"
   * @param colCount Number of columns per row
   * @param rows Array of flat parameter arrays (each length === colCount)
   * @param batchSize Rows per batch (default: BATCH_SIZE)
   * @returns Number of rows affected
   */
  /**
   * Convert a raw lowercase item name from DataForge to a human-readable title.
   * Examples:
   *   "fio shoes 01 01 01"  → "FIO Shoes"
   *   "sc nvy commodore bridgeofficer hat 01 01 01" → "SC NVY Commodore Bridgeofficer Hat"
   *   "cds combat heavy core 03 02 01" → "CDS Combat Heavy Core"
   */
  static titleCaseItemName(rawName: string, className: string): string {
    if (!rawName) return className;
    // Strip trailing variant numbers like "01 01 01", "03 02 01", "a", etc.
    const stripped = rawName
      .replace(/(\s+\d{2})+\s*[a-z]?\s*$/i, '') // " 01 01 01" or " 01 01 01 a"
      .replace(/\s+[a-z]\s*$/i, '') // trailing single letter " a"
      .trim();
    if (!stripped) return rawName;
    // Title-case each word
    return stripped
      .split(' ')
      .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ');
  }

  static async batchUpsert(
    conn: PoolClient,
    insertHead: string,
    conflictClause: string,
    colCount: number,
    rows: (string | number | null | boolean)[][],
    batchSize = ExtractionService.BATCH_SIZE,
  ): Promise<number> {
    if (!rows.length) return 0;
    let affected = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const params = batch.flat();
      let paramIdx = 0;
      const valuePlaceholders = batch.map(() => {
        const cols = Array.from({ length: colCount }, () => `$${++paramIdx}`);
        return `(${cols.join(',')})`;
      });
      const onConflict = conflictClause ? ` ON CONFLICT ${conflictClause}` : '';
      const sql = `${insertHead} VALUES ${valuePlaceholders.join(',')}${onConflict}`;
      const result = await conn.query(sql, params);
      affected += result.rowCount ?? batch.length;
    }

    return affected;
  }

  get isExtracting(): boolean {
    return this._extracting;
  }

  // ======================================================
  //  FULL EXTRACTION PIPELINE
  // ======================================================

  async extractAll(onProgress?: (msg: string) => void, options: ExtractionOptions = DEFAULT_OPTIONS): Promise<ExtractionStats> {
    if (this._extracting) {
      throw new Error('An extraction is already in progress');
    }
    this._extracting = true;
    try {
      return await this._doExtractAll(onProgress, options);
    } finally {
      this._extracting = false;
    }
  }

  private async _doExtractAll(onProgress?: (msg: string) => void, options: ExtractionOptions = DEFAULT_OPTIONS): Promise<ExtractionStats> {
    const { env } = options;
    const runAll = options.modules.has('all');
    const run = (m: ExtractionModule) => runAll || options.modules.has(m);

    const startTime = Date.now();
    const stats: ExtractionStats = {
      manufacturers: 0,
      ships: 0,
      components: 0,
      items: 0,
      commodities: 0,
      loadoutPorts: 0,
      shops: 0,
      shipMatrixLinked: 0,
      miningElements: 0,
      miningCompositions: 0,
      missions: 0,
      craftingRecipes: 0,
      locations: 0,
      starmapLocationsLinked: 0,
      errors: [],
    };

    // 1. Load DataForge if needed (skipped for ctm-only runs)
    if (this.dfService && !this.df.isDataForgeLoaded()) {
      onProgress?.('Loading DataForge…');
      const info = await this.df.loadDataForge(onProgress);
      onProgress?.(`DataForge loaded: ${info.vehicleCount} vehicles, v${info.version}`);
    }

    // 1a. Load localization from P4K (global.ini)
    const provider = this.dfService?.getProvider() ?? null;
    if (!this.locService.isLoaded && provider) {
      onProgress?.('Loading localization (global.ini)…');
      try {
        const locCount = await this.locService.loadFromP4K(provider, onProgress);
        onProgress?.(`Localization loaded: ${locCount} entries`);
      } catch (e) {
        onProgress?.(`Localization loading failed (fallback mode): ${(e as Error).message}`);
        stats.errors.push(`Localization: ${(e as Error).message}`);
      }
    }

    // Compute extraction hash from DataForge metadata
    const extractionHash = createHash('sha256')
      .update(`${this.dfService?.getVersion?.() || 'unknown'}-${Date.now()}`)
      .digest('hex');
    stats.extractionHash = extractionHash;
    let starmapPreSynced = false;

    // ── Ship Matrix pre-sync (before main transaction so crossReferenceShipMatrix has data) ──
    // ship_matrix lives in rsi_website (separate DB/pool) — safe to populate before the P4K tx.
    if (run('ship-matrix') && options.rsiPool) {
      onProgress?.('Pre-syncing Ship Matrix from RSI website (needed for cross-reference)…');
      try {
        const rsiSync = new RsiSyncService(options.rsiPool);
        const s = await rsiSync.syncShipMatrix(onProgress);
        onProgress?.(`✅ Ship Matrix pre-sync: synced=${s.synced}, errors=${s.errors}`);
        if (s.errors) stats.errors.push(`Ship Matrix pre-sync: ${s.errors} errors`);
      } catch (e) {
        stats.errors.push(`Ship Matrix pre-sync failed: ${(e as Error).message}`);
      }
    }

    // Starmap pre-sync mirrors Ship Matrix: when locations are extracted in the same run,
    // correlation needs fresh RSI/SC Wiki rows before the P4K transaction links them.
    if (run('starmap') && run('locations') && options.rsiPool) {
      onProgress?.('Pre-syncing RSI Starmap (needed for location cross-reference)…');
      try {
        const rsiSync = new RsiSyncService(options.rsiPool);
        const s = await rsiSync.syncStarmap(onProgress);
        starmapPreSynced = true;
        onProgress?.(`✅ Starmap pre-sync: upserted=${s.upserted}, errors=${s.errors}`);
        if (s.errors) stats.errors.push(`Starmap pre-sync: ${s.errors} errors`);
      } catch (e) {
        stats.errors.push(`Starmap pre-sync failed: ${(e as Error).message}`);
      }
    }

    const conn = await this.pool.connect();
    // Attach an error listener so that unexpected connection drops (e.g.
    // server-side idle_in_transaction timeout, OOM kill) are logged instead of
    // crashing the process as an unhandled 'error' event.  The error will still
    // surface on the next awaited conn.query() and be caught by the try/catch.
    conn.on('error', (err) => {
      logger.error('PostgreSQL connection terminated unexpectedly during extraction', { error: err.message });
    });
    // Keepalive: send a harmless SELECT every 30 s to prevent the server
    // (or an SSH tunnel in front of it) from closing the connection during the
    // CPU-intensive ship-extraction phase (which can run for 15+ minutes without
    // sending any SQL).
    const keepaliveTimer = setInterval(async () => {
      try {
        await conn.query('SELECT 1');
      } catch {
        /* ignore — if the connection is broken we'll find out on the next real query */
      }
    }, 10_000);
    try {
      // 1b. Snapshot current data BEFORE cleaning — for changelog comparison
      onProgress?.('Snapshotting current data for changelog…');
      const { rows: oldShipsRaw } = await conn.query<any>(
        'SELECT uuid, class_name, name, manufacturer_code, role, career, mass, scm_speed, max_speed, total_hp, shield_hp, cargo_capacity, missile_damage_total, weapon_damage_total, crew_size FROM game.ships WHERE env = $1',
        [env],
      );
      const { rows: oldCompsRaw } = await conn.query<any>(
        'SELECT uuid, class_name, name, type, sub_type, size, grade, manufacturer_code FROM game.components WHERE env = $1',
        [env],
      );
      const oldShips = new Map(oldShipsRaw.map((s: any) => [s.class_name, s]));
      const oldComps = new Map(oldCompsRaw.map((c: any) => [c.class_name, c]));

      const { rows: oldItemsRaw } = await conn.query<any>(
        'SELECT uuid, class_name, name, type, sub_type, manufacturer_code FROM game.items WHERE env = $1',
        [env],
      );
      const { rows: oldCommoditiesRaw } = await conn.query<any>(
        'SELECT uuid, class_name, name, type FROM game.commodities WHERE env = $1',
        [env],
      );
      const oldItems = new Map(oldItemsRaw.map((i: any) => [i.class_name, i]));
      const oldCommodities = new Map(oldCommoditiesRaw.map((c: any) => [c.class_name, c]));

      // Wrap the entire extraction in a transaction — if anything fails,
      // the old data remains intact (no downtime with empty tables)
      await conn.query('BEGIN');

      // 1c. Clean stale data before fresh extraction (order matters for FK constraints)
      onProgress?.('Cleaning stale data…');
      // Shops are upserted below so community-sourced shop_inventory / commodity_prices keep their shop_id links.
      // Deleting shops here would cascade those external records.
      if (run('ships')) {
        // Preserve ctm_url values before wiping ships — they won't be re-scraped
        const { rows: ctmRows } = await conn.query<any>(
          'SELECT class_name, ctm_url FROM game.ships WHERE ctm_url IS NOT NULL AND env = $1',
          [env],
        );
        const savedCtmUrls: Array<{ className: string; ctmUrl: string }> = ctmRows.map((r: any) => ({
          className: r.class_name,
          ctmUrl: r.ctm_url,
        }));
        await conn.query('DELETE FROM game.ship_modules WHERE env = $1', [env]);
        await conn.query('DELETE FROM game.ship_loadouts WHERE env = $1', [env]);
        // ship_paints FK has ON DELETE CASCADE — deleted automatically with ships
        await conn.query('DELETE FROM game.ships WHERE env = $1', [env]);
        // Immediately store for later restore (after re-insert)
        (this as any)._savedCtmUrls = savedCtmUrls;
      }
      if (run('components')) await conn.query('DELETE FROM game.components WHERE env = $1', [env]);
      if (run('items') || run('commodities')) {
        await conn.query('DELETE FROM game.items WHERE env = $1', [env]);
        await conn.query('DELETE FROM game.commodities WHERE env = $1', [env]);
      }
      if (run('mining')) {
        await conn.query('DELETE FROM game.mining_composition_parts WHERE composition_env = $1', [env]);
        await conn.query('DELETE FROM game.mining_compositions WHERE env = $1', [env]);
        await conn.query('DELETE FROM game.mining_elements WHERE env = $1', [env]);
      }
      if (run('missions')) {
        await conn.query('DELETE FROM game.mission_blueprint_rewards WHERE mission_env = $1', [env]);
        await conn.query('DELETE FROM game.missions WHERE env = $1', [env]);
      }
      if (run('crafting')) {
        await conn.query('DELETE FROM game.crafting_ingredients WHERE recipe_env = $1', [env]);
        await conn.query('DELETE FROM game.crafting_slot_modifiers WHERE recipe_env = $1', [env]);
        await conn.query('DELETE FROM game.crafting_recipes WHERE env = $1', [env]);
      }
      if (run('locations')) {
        await conn.query('DELETE FROM game.locations WHERE env = $1', [env]);
      }

      // 2. Collect & save manufacturers FIRST (before ships, due to FK constraint)
      // Skip for P4K-free modules (e.g. ctm) that don't need DataForge data
      if (this.dfService) {
        onProgress?.('Saving manufacturers…');
        stats.manufacturers = await this.saveManufacturersFromData(conn);
      }

      // 3. Extract & save components
      if (run('components')) {
        onProgress?.('Extracting components…');
        stats.components = await this.saveComponents(conn, env, onProgress);
      }

      // 3b. Extract & save items (FPS weapons, armor, clothing, gadgets)
      if (run('items') || run('commodities')) {
        onProgress?.('Extracting items (FPS, armor, clothing)…');
        const itemResult = await this.saveItems(conn, env, onProgress);
        stats.items = itemResult.items;
        stats.commodities = itemResult.commodities;
      }

      // 4. Extract & save ships + loadouts
      if (run('ships')) {
        onProgress?.('Extracting ships…');
        const shipResult = await this.saveShips(conn, env, onProgress);
        stats.ships = shipResult.ships;
        stats.loadoutPorts = shipResult.loadoutPorts;
        // Restore preserved ctm_url values
        const savedCtmUrls: Array<{ className: string; ctmUrl: string }> = (this as any)._savedCtmUrls ?? [];
        if (savedCtmUrls.length > 0) {
          for (const { className, ctmUrl } of savedCtmUrls) {
            await conn.query('UPDATE game.ships SET ctm_url = $1 WHERE class_name = $2 AND env = $3', [ctmUrl, className, env]);
          }
          onProgress?.(`CTM: restored ${savedCtmUrls.length} cached URLs`);
          delete (this as any)._savedCtmUrls;
        }
      }

      // 5b. Extract & save paints/liveries (always when ships are re-extracted, since CASCADE clears them)
      if (run('paints') || run('ships')) {
        onProgress?.('Extracting paints…');
        await this.savePaints(conn, env, onProgress);
      }

      // 5c. Extract & save mining data (elements + compositions)
      if (run('mining')) {
        onProgress?.('Extracting mining data…');
        const miningResult = await this.saveMiningData(conn, env, onProgress);
        stats.miningElements = miningResult.elements;
        stats.miningCompositions = miningResult.compositions;
      }

      // 5d. Extract & save missions (ContractTemplate)
      if (run('missions')) {
        onProgress?.('Extracting missions (ContractTemplate)…');
        stats.missions = await this.saveMissions(conn, env, onProgress);
      }

      // 5e. Extract & save crafting recipes
      if (run('crafting')) {
        onProgress?.('Extracting crafting recipes…');
        stats.craftingRecipes = await this.saveCraftingRecipes(conn, env, onProgress);
      }

      // 5f. Link missions → blueprint rewards (ContractGenerator)
      if (run('missions') || run('crafting')) {
        onProgress?.('Linking missions → blueprint rewards (ContractGenerator)…');
        await this.saveMissionBlueprintLinks(conn, env, onProgress);
      }

      // 5g. Extract & save locations (StarMapObject)
      if (run('locations')) {
        onProgress?.('Extracting locations (StarMapObject)…');
        stats.locations = await this.saveLocations(conn, env, onProgress);
        onProgress?.('Cross-referencing locations with RSI Starmap…');
        stats.starmapLocationsLinked = await crossReferenceStarmapLocations(conn, env);
      }

      // 5g2. Extract & save shops/vendors (AFTER locations — needs loc_key from locations table)
      if (run('shops')) {
        onProgress?.('Extracting shops & prices…');
        const shopResult = await this.saveShopsData(conn, env, onProgress);
        stats.shops = shopResult.shops;
      }

      // 6. Cross-reference with ship_matrix (only when ships were extracted)
      if (run('ships')) {
        onProgress?.('Cross-referencing with Ship Matrix…');
        stats.shipMatrixLinked = await crossReferenceShipMatrix(conn, env);
        await populateChassisId(conn, env);
        await applyDimensionsFallback(conn, env);
        await tagVariantTypes(conn, env);
        const pruned = await pruneExcludedVariants(conn, env);
        if (pruned > 0) onProgress?.(`Pruned ${pruned} excluded variant ships`);
        await applyHullSeriesCargoFallback(conn, env);
      }

      // 6b. Scrape CTM (3D model) URLs — after cross-reference so ship_matrix_id is populated
      if (run('ctm')) {
        const force = options.ctmForce ?? false;
        const concurrency = options.ctmConcurrency ?? 1;
        onProgress?.(`Scraping 3D model URLs (CTM) from RSI… [${force ? 'force-all' : 'incremental'}, concurrency=${concurrency}]`);
        await this.saveShipCtmModels(conn, env, { force, concurrency }, onProgress);
      }

      // 6c. Log extraction to extraction_log
      stats.durationMs = Date.now() - startTime;
      let extractionId: number | null = null;
      try {
        const logResult = await conn.query<any>(
          `INSERT INTO meta.extraction_log (extraction_hash, game_version, game_env, ships_count, components_count, items_count, commodities_count, manufacturers_count, loadout_ports_count, shops_count, duration_ms, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id`,
          [
            extractionHash,
            this.dfService?.getVersion?.() || null,
            env,
            stats.ships,
            stats.components,
            stats.items,
            stats.commodities,
            stats.manufacturers,
            stats.loadoutPorts,
            stats.shops,
            stats.durationMs,
            'success',
          ],
        );
        extractionId = logResult.rows[0]?.id ?? null;
      } catch {
        /* extraction_log is non-critical */
      }

      // 7. Generate changelog by comparing old snapshot with new data
      if (extractionId) {
        try {
          onProgress?.('Generating changelog…');
          await this.generateChangelog(conn, env, extractionId, oldShips, oldComps, oldItems, oldCommodities);
        } catch (e) {
          logger.warn('Changelog generation failed', { error: String(e) });
        }
      }

      onProgress?.(
        `✅ Extraction complete: ${stats.ships} ships, ${stats.components} components, ${stats.items} items, ${stats.commodities} commodities, ${stats.manufacturers} manufacturers, ${stats.loadoutPorts} loadout ports, ${stats.shops} shops, ${stats.shipMatrixLinked} linked to Ship Matrix, ${stats.starmapLocationsLinked} linked to RSI Starmap, ${stats.miningElements} mining elements, ${stats.miningCompositions} compositions`,
      );

      // ── Sanity check — abort if data dropped by >50% (only for extracted modules) ──
      const oldCounts = { ships: oldShipsRaw.length, components: oldCompsRaw.length };
      const threshold = 0.5;
      const sanityErrors: string[] = [];
      if (run('ships') && oldCounts.ships > 20 && stats.ships < oldCounts.ships * threshold) {
        sanityErrors.push(`Ships dropped from ${oldCounts.ships} to ${stats.ships}`);
      }
      if (run('components') && oldCounts.components > 50 && stats.components < oldCounts.components * threshold) {
        sanityErrors.push(`Components dropped from ${oldCounts.components} to ${stats.components}`);
      }
      if (sanityErrors.length > 0) {
        const msg = `Sanity check failed: ${sanityErrors.join('; ')}`;
        logger.error(msg);
        onProgress?.(`⚠️ ${msg} — rolling back`);
        throw new Error(msg);
      }

      // Commit the transaction — all data is now atomically visible
      await conn.query('COMMIT');
      onProgress?.('Transaction committed successfully');
    } catch (e) {
      // Rollback on any error — old data remains intact
      try {
        await conn.query('ROLLBACK');
      } catch {
        /* rollback best-effort */
      }
      onProgress?.('❌ Extraction failed — transaction rolled back, old data preserved');
      throw e;
    } finally {
      clearInterval(keepaliveTimer);
      conn.release();
    }

    // ── RSI/SC Wiki sync modules (outside main transaction — separate rsi_website DB) ──
    const rsiModules: ExtractionModule[] = ['galactapedia', 'comm-links', 'starmap', 'ship-matrix', 'organizations'];
    const hasRsiModules = rsiModules.some((m) => run(m));

    if (hasRsiModules) {
      if (!options.rsiPool) {
        logger.warn('RSI sync modules requested but no rsiPool provided — skipping');
      } else {
        const rsiSync = new RsiSyncService(options.rsiPool);

        if (run('galactapedia')) {
          onProgress?.('Syncing galactapedia from SC Wiki…');
          try {
            const s = await rsiSync.syncGalactapedia(onProgress);
            onProgress?.(`✅ Galactapedia: inserted=${s.inserted}, updated=${s.updated}, errors=${s.errors}`);
            if (s.errors) stats.errors.push(`Galactapedia: ${s.errors} errors`);
          } catch (e) {
            stats.errors.push(`Galactapedia sync failed: ${(e as Error).message}`);
          }
        }

        if (run('comm-links')) {
          onProgress?.('Syncing comm-links from SC Wiki…');
          try {
            const s = await rsiSync.syncCommLinks(onProgress);
            onProgress?.(`✅ Comm-links: inserted=${s.inserted}, updated=${s.updated}, errors=${s.errors}`);
            if (s.errors) stats.errors.push(`Comm-links: ${s.errors} errors`);
          } catch (e) {
            stats.errors.push(`Comm-links sync failed: ${(e as Error).message}`);
          }
        }

        if (run('starmap') && !starmapPreSynced) {
          onProgress?.('Syncing starmap from SC Wiki…');
          try {
            const s = await rsiSync.syncStarmap(onProgress);
            onProgress?.(`✅ Starmap: upserted=${s.upserted}, errors=${s.errors}`);
            if (s.errors) stats.errors.push(`Starmap: ${s.errors} errors`);
          } catch (e) {
            stats.errors.push(`Starmap sync failed: ${(e as Error).message}`);
          }
        } else if (run('starmap')) {
          onProgress?.('Starmap sync skipped after extraction (already pre-synced for location cross-reference)');
        }

        if (run('organizations')) {
          onProgress?.('Syncing RSI organizations for cached corporations...');
          try {
            const s = await rsiSync.syncOrganizations(onProgress);
            onProgress?.(`Organizations: updated=${s.updated}, errors=${s.errors}, skipped=${s.skipped}`);
            if (s.errors) stats.errors.push(`Organizations: ${s.errors} errors`);
          } catch (e) {
            stats.errors.push(`Organizations sync failed: ${(e as Error).message}`);
          }
        }
      }
    }

    return stats;
  }

  // ======================================================
  //  COMPONENTS → components table
  // ======================================================

  private async saveComponents(conn: PoolClient, env: GameEnv, onProgress?: (msg: string) => void): Promise<number> {
    const components = this.df.extractAllComponents();
    if (!components.length) return 0;

    if (this.locService.isLoaded) {
      for (const c of components) {
        const resolved = this.locService.resolveOrFallback(c.className, c.name);
        if (resolved) c.name = resolved;
      }
      onProgress?.(`Localized ${components.length} component names`);
    }

    const COMP_COLS = `env, uuid, class_name, name, normalized_name, canonical_component_key,
          type, game_component_category, sub_type, size, grade, manufacturer_code,
            mass, hp,
            power_draw, power_base, power_output,
            heat_generation, cooling_rate,
            em_signature, ir_signature,
            weapon_damage, weapon_damage_type, weapon_fire_rate, weapon_range, weapon_speed,
            weapon_ammo_count, weapon_pellets_per_shot, weapon_burst_size,
            weapon_alpha_damage, weapon_dps,
            weapon_damage_physical, weapon_damage_energy, weapon_damage_distortion,
            weapon_damage_thermal, weapon_damage_biochemical, weapon_damage_stun,
            weapon_burst_dps, weapon_sustained_dps,
            weapon_full_damage_range, weapon_zero_damage_range, weapon_heat_per_second,
            weapon_beam_capacity, weapon_beam_regen_cooldown, weapon_beam_dps,
            shield_hp, shield_regen, shield_regen_delay, shield_hardening, shield_faces,
            qd_speed, qd_spool_time, qd_cooldown, qd_fuel_rate, qd_range,
            qd_stage1_accel, qd_stage2_accel,
            qd_tuning_rate, qd_alignment_rate, qd_disconnect_range,
            missile_damage, missile_signal_type, missile_lock_time, missile_speed,
            missile_range, missile_lock_range,
            missile_damage_physical, missile_damage_energy, missile_damage_distortion,
            missile_damage_thermal, missile_damage_biochemical, missile_damage_stun,
            missile_explosion_radius, missile_guidance_mode,
            thruster_max_thrust, thruster_type,
            radar_range, radar_detection_lifetime, radar_tracking_signal,
            radar_ping_range, radar_ping_cooldown,
            cm_ammo_count, cm_type,
            fuel_capacity, fuel_intake_rate,
            emp_damage, emp_radius, emp_charge_time, emp_cooldown,
            qig_jammer_range, qig_snare_radius, qig_charge_time, qig_cooldown,
            mining_speed, mining_range, mining_resistance, mining_instability,
            tractor_max_force, tractor_max_range,
            salvage_speed, salvage_radius, salvage_range,
            gimbal_type, gimbal_max_angle, gimbal_pitch_speed, gimbal_yaw_speed,
            turret_min_pitch, turret_max_pitch, turret_min_yaw, turret_max_yaw,
            rack_count, rack_missile_size,
            shield_downed_regen_delay,
            weapon_heat_per_shot, weapon_charge_time,
            qd_calibration_rate, qd_calibration_delay, qd_calibration_max_angle,
            p4k_path, raw_json`;

    const COMP_CONFLICT = `(uuid, env) DO UPDATE SET
            class_name=EXCLUDED.class_name, name=EXCLUDED.name,
            normalized_name=EXCLUDED.normalized_name,
            canonical_component_key=EXCLUDED.canonical_component_key,
            type=EXCLUDED.type,
            game_component_category=EXCLUDED.game_component_category,
            sub_type=EXCLUDED.sub_type, size=EXCLUDED.size, grade=EXCLUDED.grade,
            manufacturer_code=EXCLUDED.manufacturer_code,
            mass=EXCLUDED.mass, hp=EXCLUDED.hp,
            power_draw=EXCLUDED.power_draw, power_base=EXCLUDED.power_base, power_output=EXCLUDED.power_output,
            heat_generation=EXCLUDED.heat_generation, cooling_rate=EXCLUDED.cooling_rate,
            weapon_damage=EXCLUDED.weapon_damage, weapon_damage_type=EXCLUDED.weapon_damage_type,
            weapon_fire_rate=EXCLUDED.weapon_fire_rate, weapon_range=EXCLUDED.weapon_range,
            weapon_speed=EXCLUDED.weapon_speed, weapon_ammo_count=EXCLUDED.weapon_ammo_count,
            weapon_pellets_per_shot=EXCLUDED.weapon_pellets_per_shot, weapon_burst_size=EXCLUDED.weapon_burst_size,
            weapon_alpha_damage=EXCLUDED.weapon_alpha_damage, weapon_dps=EXCLUDED.weapon_dps,
            weapon_damage_physical=EXCLUDED.weapon_damage_physical, weapon_damage_energy=EXCLUDED.weapon_damage_energy,
            weapon_damage_distortion=EXCLUDED.weapon_damage_distortion,
            weapon_damage_thermal=EXCLUDED.weapon_damage_thermal, weapon_damage_biochemical=EXCLUDED.weapon_damage_biochemical,
            weapon_damage_stun=EXCLUDED.weapon_damage_stun,
            weapon_burst_dps=EXCLUDED.weapon_burst_dps, weapon_sustained_dps=EXCLUDED.weapon_sustained_dps,
            weapon_full_damage_range=EXCLUDED.weapon_full_damage_range, weapon_zero_damage_range=EXCLUDED.weapon_zero_damage_range,
            weapon_heat_per_second=EXCLUDED.weapon_heat_per_second,
            weapon_beam_capacity=EXCLUDED.weapon_beam_capacity, weapon_beam_regen_cooldown=EXCLUDED.weapon_beam_regen_cooldown,
            weapon_beam_dps=EXCLUDED.weapon_beam_dps,
            shield_hp=EXCLUDED.shield_hp, shield_regen=EXCLUDED.shield_regen,
            shield_regen_delay=EXCLUDED.shield_regen_delay, shield_hardening=EXCLUDED.shield_hardening,
            shield_faces=EXCLUDED.shield_faces,
            qd_speed=EXCLUDED.qd_speed, qd_spool_time=EXCLUDED.qd_spool_time,
            qd_cooldown=EXCLUDED.qd_cooldown, qd_fuel_rate=EXCLUDED.qd_fuel_rate,
            qd_range=EXCLUDED.qd_range, qd_stage1_accel=EXCLUDED.qd_stage1_accel,
            qd_stage2_accel=EXCLUDED.qd_stage2_accel,
            qd_tuning_rate=EXCLUDED.qd_tuning_rate, qd_alignment_rate=EXCLUDED.qd_alignment_rate,
            qd_disconnect_range=EXCLUDED.qd_disconnect_range,
            missile_damage=EXCLUDED.missile_damage, missile_signal_type=EXCLUDED.missile_signal_type,
            missile_lock_time=EXCLUDED.missile_lock_time, missile_speed=EXCLUDED.missile_speed,
            missile_range=EXCLUDED.missile_range, missile_lock_range=EXCLUDED.missile_lock_range,
            missile_damage_physical=EXCLUDED.missile_damage_physical, missile_damage_energy=EXCLUDED.missile_damage_energy,
            missile_damage_distortion=EXCLUDED.missile_damage_distortion,
            missile_damage_thermal=EXCLUDED.missile_damage_thermal, missile_damage_biochemical=EXCLUDED.missile_damage_biochemical,
            missile_damage_stun=EXCLUDED.missile_damage_stun,
            missile_explosion_radius=EXCLUDED.missile_explosion_radius,
            missile_guidance_mode=EXCLUDED.missile_guidance_mode,
            thruster_max_thrust=EXCLUDED.thruster_max_thrust, thruster_type=EXCLUDED.thruster_type,
            radar_range=EXCLUDED.radar_range,
            radar_detection_lifetime=EXCLUDED.radar_detection_lifetime,
            radar_tracking_signal=EXCLUDED.radar_tracking_signal,
            radar_ping_range=EXCLUDED.radar_ping_range,
            radar_ping_cooldown=EXCLUDED.radar_ping_cooldown,
            cm_ammo_count=EXCLUDED.cm_ammo_count, cm_type=EXCLUDED.cm_type,
            fuel_capacity=EXCLUDED.fuel_capacity, fuel_intake_rate=EXCLUDED.fuel_intake_rate,
            emp_damage=EXCLUDED.emp_damage, emp_radius=EXCLUDED.emp_radius,
            emp_charge_time=EXCLUDED.emp_charge_time, emp_cooldown=EXCLUDED.emp_cooldown,
            qig_jammer_range=EXCLUDED.qig_jammer_range, qig_snare_radius=EXCLUDED.qig_snare_radius,
            qig_charge_time=EXCLUDED.qig_charge_time, qig_cooldown=EXCLUDED.qig_cooldown,
            mining_speed=EXCLUDED.mining_speed, mining_range=EXCLUDED.mining_range,
            mining_resistance=EXCLUDED.mining_resistance, mining_instability=EXCLUDED.mining_instability,
            tractor_max_force=EXCLUDED.tractor_max_force, tractor_max_range=EXCLUDED.tractor_max_range,
            salvage_speed=EXCLUDED.salvage_speed, salvage_radius=EXCLUDED.salvage_radius, salvage_range=EXCLUDED.salvage_range,
            gimbal_type=EXCLUDED.gimbal_type,
            gimbal_max_angle=EXCLUDED.gimbal_max_angle,
            gimbal_pitch_speed=EXCLUDED.gimbal_pitch_speed, gimbal_yaw_speed=EXCLUDED.gimbal_yaw_speed,
            turret_min_pitch=EXCLUDED.turret_min_pitch, turret_max_pitch=EXCLUDED.turret_max_pitch,
            turret_min_yaw=EXCLUDED.turret_min_yaw, turret_max_yaw=EXCLUDED.turret_max_yaw,
            rack_count=EXCLUDED.rack_count, rack_missile_size=EXCLUDED.rack_missile_size,
            shield_downed_regen_delay=EXCLUDED.shield_downed_regen_delay,
            weapon_heat_per_shot=EXCLUDED.weapon_heat_per_shot,
            weapon_charge_time=EXCLUDED.weapon_charge_time,
            qd_calibration_rate=EXCLUDED.qd_calibration_rate,
            qd_calibration_delay=EXCLUDED.qd_calibration_delay,
            qd_calibration_max_angle=EXCLUDED.qd_calibration_max_angle,
            p4k_path=EXCLUDED.p4k_path,
            raw_json=EXCLUDED.raw_json,
            updated_at=CURRENT_TIMESTAMP`;

    const COL_COUNT = 120; // number of columns above (stats + source metadata + env)

    /** Map a component object to a flat array of values */
    const toCanonicalRow = (c: any): (string | number | null)[] => {
      const canonical = canonicalizeComponentRecord({
        name: c.name,
        className: c.className,
        type: c.type,
        subType: c.subType,
        grade: c.grade,
        size: c.size,
      });

      return [
        env,
        c.uuid,
        c.className,
        c.name,
        canonical.normalizedName,
        canonical.canonicalComponentKey,
        c.type,
        getGameComponentCategory(c.type),
        c.subType || null,
        c.size ?? null,
        c.grade || null,
        c.manufacturerCode || null,
        c.mass ?? null,
        c.hp ?? null,
        c.powerDraw ?? null,
        c.powerBase ?? null,
        c.powerOutput ?? null,
        c.heatGeneration ?? null,
        c.coolingRate ?? null,
        c.emSignature ?? null,
        c.irSignature ?? null,
        c.weaponDamage ?? null,
        c.weaponDamageType || null,
        c.weaponFireRate ?? null,
        c.weaponRange ?? null,
        c.weaponSpeed ?? null,
        c.weaponAmmoCount ?? null,
        c.weaponPelletsPerShot ?? 1,
        c.weaponBurstSize ?? null,
        c.weaponAlphaDamage ?? null,
        c.weaponDps ?? null,
        c.weaponDamagePhysical ?? null,
        c.weaponDamageEnergy ?? null,
        c.weaponDamageDistortion ?? null,
        c.weaponDamageThermal ?? null,
        c.weaponDamageBiochemical ?? null,
        c.weaponDamageStun ?? null,
        c.weaponBurstDps ?? null,
        c.weaponSustainedDps ?? null,
        c.weaponFullDamageRange ?? null,
        c.weaponZeroDamageRange ?? null,
        c.weaponHeatPerSecond ?? null,
        c.weaponBeamCapacity ?? null,
        c.weaponBeamRegenCooldown ?? null,
        c.weaponBeamDps ?? null,
        c.shieldHp ?? null,
        c.shieldRegen ?? null,
        c.shieldRegenDelay ?? null,
        c.shieldHardening ?? null,
        c.shieldFaces ?? null,
        c.qdSpeed ?? null,
        c.qdSpoolTime ?? null,
        c.qdCooldown ?? null,
        c.qdFuelRate ?? null,
        c.qdRange ?? null,
        c.qdStage1Accel ?? null,
        c.qdStage2Accel ?? null,
        c.qdTuningRate ?? null,
        c.qdAlignmentRate ?? null,
        c.qdDisconnectRange ?? null,
        c.missileDamage ?? null,
        c.missileSignalType || null,
        c.missileLockTime ?? null,
        c.missileSpeed ?? null,
        c.missileRange ?? null,
        c.missileLockRange ?? null,
        c.missileDamagePhysical ?? null,
        c.missileDamageEnergy ?? null,
        c.missileDamageDistortion ?? null,
        c.missileDamageThermal ?? null,
        c.missileDamageBiochemical ?? null,
        c.missileDamageStun ?? null,
        c.missileExplosionRadius ?? null,
        c.missileGuidanceMode || null,
        c.thrusterMaxThrust ?? null,
        c.thrusterType || null,
        c.radarRange ?? null,
        c.radarDetectionLifetime ?? null,
        c.radarTrackingSignal ?? null,
        c.radarPingRange ?? null,
        c.radarPingCooldown ?? null,
        c.cmAmmoCount ?? null,
        c.cmType || null,
        c.fuelCapacity ?? null,
        c.fuelIntakeRate ?? null,
        c.empDamage ?? null,
        c.empRadius ?? null,
        c.empChargeTime ?? null,
        c.empCooldown ?? null,
        c.qigJammerRange ?? null,
        c.qigSnareRadius ?? null,
        c.qigChargeTime ?? null,
        c.qigCooldown ?? null,
        c.miningSpeed ?? null,
        c.miningRange ?? null,
        c.miningResistance ?? null,
        c.miningInstability ?? null,
        c.tractorMaxForce ?? null,
        c.tractorMaxRange ?? null,
        c.salvageSpeed ?? null,
        c.salvageRadius ?? null,
        c.salvageRange ?? null,
        c.gimbalType || null,
        c.gimbalMaxAngle ?? null,
        c.gimbalPitchSpeed ?? null,
        c.gimbalYawSpeed ?? null,
        c.turretMinPitch ?? null,
        c.turretMaxPitch ?? null,
        c.turretMinYaw ?? null,
        c.turretMaxYaw ?? null,
        c.rackCount ?? null,
        c.rackMissileSize ?? null,
        c.shieldDownedRegenDelay ?? null,
        c.weaponHeatPerShot ?? null,
        c.weaponChargeTime ?? null,
        c.qdCalibrationRate ?? null,
        c.qdCalibrationDelay ?? null,
        c.qdCalibrationMaxAngle ?? null,
        c.p4kPath ?? null,
        c.rawJson ? JSON.stringify(c.rawJson) : null,
      ];
    };

    const rows = components.map(toCanonicalRow);
    const saved = await ExtractionService.batchUpsert(conn, `INSERT INTO game.components (${COMP_COLS})`, COMP_CONFLICT, COL_COUNT, rows);

    onProgress?.(`Components: ${saved}/${components.length} (batch INSERT)`);
    return components.length; // all attempted
  }

  // ======================================================
  //  SHIPS → ships + ship_loadouts tables
  // ======================================================

  private async saveShips(
    conn: PoolClient,
    env: GameEnv,
    onProgress?: (msg: string) => void,
  ): Promise<{ ships: number; loadoutPorts: number }> {
    const vehicles = this.df.getVehicleDefinitions();
    let savedShips = 0;
    let totalPorts = 0;
    let skippedNonPlayable = 0;

    // Pre-load all component class_name → uuid mappings to avoid N+1 queries in saveLoadout
    const { rows: compRows } = await conn.query<any>('SELECT class_name, uuid FROM game.components WHERE env = $1', [env]);
    const componentUuidCache = new Map<string, string>();
    for (const row of compRows) componentUuidCache.set(row.class_name, row.uuid);
    onProgress?.(`Component UUID cache loaded: ${componentUuidCache.size} entries`);

    for (const [, veh] of vehicles) {
      try {
        const fullData = await this.df.extractFullShipData(veh.className);
        if (!fullData) continue;

        // === FILTER: only keep playable/flyable ships ===
        const lcName = veh.className.toLowerCase();
        if (
          lcName.startsWith('ambx_') ||
          lcName.includes('_test') ||
          lcName.includes('_debug') ||
          lcName.includes('_template') ||
          lcName.includes('_indestructible') ||
          lcName.includes('_unmanned') ||
          lcName.includes('_npc_only') ||
          lcName.includes('_prison') ||
          lcName.includes('_hijacked') ||
          lcName.includes('_drug') ||
          lcName.includes('_ai_only') ||
          lcName.includes('_derelict') ||
          lcName.includes('_wreck')
        ) {
          skippedNonPlayable++;
          continue;
        }
        if (/_PU($|_)/i.test(veh.className) || /_AI_/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }
        if (/_Tier_\d+$/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }
        if (/_Swarm($|_)/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }
        if (/(?:_CIG_|_Event_|_Reward_|_Prize_|_Trophy)/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }

        // Classify vehicle category
        let vehicleCategory = 'ship';
        const GROUND_PATTERNS =
          /(?:^|\b|_)(cyclone|ursa|rover|spartan|ballista|tonk|nova|centurion|storm|lynx|roc|mule|ptv|greycat|buggy|tumbril|cart|utv)(?:_|\b|$)/i;
        const GRAVLEV_PATTERNS = /(?:^|\b|_)(dragonfly|nox|x1|ranger|hex|pulse|hoverquad)(?:_|\b|$)/i;
        if (GROUND_PATTERNS.test(veh.className)) vehicleCategory = 'ground';
        else if (GRAVLEV_PATTERNS.test(veh.className)) vehicleCategory = 'gravlev';

        // Manufacturer code from className prefix
        const mfgMatch = veh.className.match(/^([A-Z]{3,5})_/);
        let mfgCode = mfgMatch?.[1] || null;

        // Override Esperia-manufactured Vanduul replicas
        const ESPERIA_OVERRIDES: Record<string, string> = {
          VNCL_Glaive: 'ESPR',
          VNCL_Blade: 'ESPR',
          VNCL_Blade_Swarm: 'ESPR',
          VNCL_Stinger: 'ESPR',
        };
        if (ESPERIA_OVERRIDES[veh.className]) {
          mfgCode = ESPERIA_OVERRIDES[veh.className];
        }

        // Resolve ship display name via localization
        let shipDisplayName = fullData.name || veh.name;
        if (this.locService.isLoaded) {
          const locName = this.locService.resolveShipName(veh.className);
          if (locName) shipDisplayName = locName;
        }

        await conn.query(
          `INSERT INTO game.ships (
            env, uuid, class_name, name, manufacturer_code,
            role, career, crew_size,
            size_x, size_y, size_z,
            mass, scm_speed, max_speed,
            boost_speed_forward, boost_speed_backward,
            pitch_max, yaw_max, roll_max,
            total_hp,
            hydrogen_fuel_capacity, quantum_fuel_capacity,
            shield_hp, shield_regen, shield_regen_delay, shield_down_delay,
            armor_physical, armor_energy, armor_distortion,
            armor_thermal,
            armor_signal_ir, armor_signal_em, armor_signal_cs,
            armor_hp, armor_phys_resist, armor_energy_resist,
            fuse_penetration, component_penetration,
            boost_ramp_up, boost_ramp_down,
            cross_section_x, cross_section_y, cross_section_z,
            short_name, cargo_capacity,
            insurance_claim_time, insurance_expedite_cost,
            vehicle_category,
            game_data
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49)
          ON CONFLICT (uuid, env) DO UPDATE SET
            class_name=EXCLUDED.class_name, name=EXCLUDED.name,
            manufacturer_code=EXCLUDED.manufacturer_code,
            role=EXCLUDED.role, career=EXCLUDED.career,
            crew_size=EXCLUDED.crew_size,
            size_x=EXCLUDED.size_x, size_y=EXCLUDED.size_y, size_z=EXCLUDED.size_z,
            mass=EXCLUDED.mass, scm_speed=EXCLUDED.scm_speed, max_speed=EXCLUDED.max_speed,
            boost_speed_forward=EXCLUDED.boost_speed_forward,
            boost_speed_backward=EXCLUDED.boost_speed_backward,
            pitch_max=EXCLUDED.pitch_max, yaw_max=EXCLUDED.yaw_max, roll_max=EXCLUDED.roll_max,
            total_hp=EXCLUDED.total_hp,
            hydrogen_fuel_capacity=EXCLUDED.hydrogen_fuel_capacity,
            quantum_fuel_capacity=EXCLUDED.quantum_fuel_capacity,
            shield_hp=EXCLUDED.shield_hp, shield_regen=EXCLUDED.shield_regen,
            shield_regen_delay=EXCLUDED.shield_regen_delay, shield_down_delay=EXCLUDED.shield_down_delay,
            armor_physical=EXCLUDED.armor_physical, armor_energy=EXCLUDED.armor_energy,
            armor_distortion=EXCLUDED.armor_distortion, armor_thermal=EXCLUDED.armor_thermal,
            armor_signal_ir=EXCLUDED.armor_signal_ir, armor_signal_em=EXCLUDED.armor_signal_em,
            armor_signal_cs=EXCLUDED.armor_signal_cs,
            armor_hp=EXCLUDED.armor_hp, armor_phys_resist=EXCLUDED.armor_phys_resist,
            armor_energy_resist=EXCLUDED.armor_energy_resist,
            fuse_penetration=EXCLUDED.fuse_penetration, component_penetration=EXCLUDED.component_penetration,
            boost_ramp_up=EXCLUDED.boost_ramp_up, boost_ramp_down=EXCLUDED.boost_ramp_down,
            cross_section_x=EXCLUDED.cross_section_x, cross_section_y=EXCLUDED.cross_section_y,
            cross_section_z=EXCLUDED.cross_section_z,
            short_name=EXCLUDED.short_name, cargo_capacity=EXCLUDED.cargo_capacity,
            insurance_claim_time=EXCLUDED.insurance_claim_time,
            insurance_expedite_cost=EXCLUDED.insurance_expedite_cost,
            vehicle_category=EXCLUDED.vehicle_category,
            game_data=EXCLUDED.game_data,
            extracted_at=CURRENT_TIMESTAMP`,
          [
            env,
            fullData.ref,
            veh.className,
            shipDisplayName,
            mfgCode,
            fullData.vehicle?.role || null,
            fullData.vehicle?.career || null,
            fullData.vehicle?.crewSize || 1,
            fullData.vehicle?.size?.x || null,
            fullData.vehicle?.size?.y || null,
            fullData.vehicle?.size?.z || null,
            fullData.hull?.mass || null,
            fullData.ifcs?.scmSpeed != null ? Math.round(fullData.ifcs.scmSpeed) : null,
            fullData.ifcs?.maxSpeed != null ? Math.round(fullData.ifcs.maxSpeed) : null,
            fullData.ifcs?.boostSpeedForward != null ? Math.round(fullData.ifcs.boostSpeedForward) : null,
            fullData.ifcs?.boostSpeedBackward != null ? Math.round(fullData.ifcs.boostSpeedBackward) : null,
            fullData.ifcs?.angularVelocity?.x || null,
            fullData.ifcs?.angularVelocity?.z || null,
            fullData.ifcs?.angularVelocity?.y || null,
            fullData.hull?.totalHp != null ? Math.round(fullData.hull.totalHp) : null,
            fullData.fuelCapacity || null,
            fullData.qtFuelCapacity || null,
            (fullData.shield?.maxShieldHealth ?? fullData.shield?.maxHp) != null
              ? Math.round(fullData.shield!.maxShieldHealth ?? fullData.shield!.maxHp!)
              : null,
            fullData.shield?.maxShieldRegen ?? null,
            fullData.shield?.damagedRegenDelay ?? null,
            fullData.shield?.downedRegenDelay ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damagePhysical ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageEnergy ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageDistortion ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageThermal ?? null,
            fullData.armor?.data?.armor?.signalIR ?? null,
            fullData.armor?.data?.armor?.signalEM ?? null,
            fullData.armor?.data?.armor?.signalCS ?? null,
            fullData.armor?.data?.health?.hp ?? null,
            fullData.armor?.data?.health?.damageResistanceMultiplier?.physical ?? null,
            fullData.armor?.data?.health?.damageResistanceMultiplier?.energy ?? null,
            fullData.vehicle?.fusePenetrationDamageMultiplier ?? null,
            fullData.vehicle?.componentPenetrationDamageMultiplier ?? null,
            fullData.ifcs?.afterburner?.afterburnerRampUpTime ?? null,
            fullData.ifcs?.afterburner?.afterburnerRampDownTime ?? null,
            fullData.crossSection?.x || null,
            fullData.crossSection?.y || null,
            fullData.crossSection?.z || null,
            fullData.shortName || null,
            fullData.cargo ?? null,
            fullData.insurance?.baseWaitTimeMinutes || null,
            fullData.insurance?.baseExpeditingFee || null,
            vehicleCategory,
            JSON.stringify(fullData),
          ],
        );
        savedShips++;

        // Extract & save loadout
        const loadout = this.df.extractVehicleLoadout(veh.className);
        if (loadout && loadout.length > 0) {
          await conn.query('DELETE FROM game.ship_loadouts WHERE ship_uuid = $1 AND env = $2', [fullData.ref, env]);
          totalPorts += await this.saveLoadout(conn, env, fullData.ref, loadout, componentUuidCache);
          await this.computeAndStoreMissileDamage(conn, env, fullData.ref);
          await this.computeAndStoreWeaponDamage(conn, env, fullData.ref);
        }

        // Detect & save modules
        await this.detectAndSaveModules(conn, env, fullData, veh.className);

        if (savedShips % 20 === 0) onProgress?.(`Ships: ${savedShips}/${vehicles.size}…`);
      } catch (e: unknown) {
        logger.error(`Ship ${veh.className}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    onProgress?.(`Ships: ${savedShips}/${vehicles.size} (${skippedNonPlayable} non-playable skipped)`);
    return { ships: savedShips, loadoutPorts: totalPorts };
  }

  private async saveLoadout(
    conn: PoolClient,
    env: GameEnv,
    shipUuid: string,
    loadout: Array<{
      portName: string;
      portType?: string;
      componentClassName?: string | null;
      minSize?: number;
      maxSize?: number;
      children?: any[];
    }>,
    componentUuidCache: Map<string, string>,
  ): Promise<number> {
    let count = 0;

    // Recursive helper: inserts a port and all its children at any depth
    const insertPort = async (
      port: {
        portName: string;
        portType?: string;
        componentClassName?: string | null;
        minSize?: number;
        maxSize?: number;
        children?: any[];
      },
      parentId: number | null,
    ): Promise<void> => {
      const compUuid = port.componentClassName ? componentUuidCache.get(port.componentClassName) || null : null;
      let insertId: number;
      if (parentId === null) {
        // Root port — include size columns
        const result = await conn.query<any>(
          `INSERT INTO game.ship_loadouts
            (env, ship_uuid, port_name, port_type, component_class_name, component_uuid, port_min_size, port_max_size)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            env,
            shipUuid,
            port.portName,
            port.portType || null,
            port.componentClassName || null,
            compUuid,
            port.minSize ?? null,
            port.maxSize ?? null,
          ],
        );
        insertId = result.rows[0].id;
      } else {
        const result = await conn.query<any>(
          `INSERT INTO game.ship_loadouts
            (env, ship_uuid, port_name, port_type, component_class_name, component_uuid, parent_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            env,
            shipUuid,
            port.portName,
            port.portType || classifyPort(port.portName, port.componentClassName || ''),
            port.componentClassName || null,
            compUuid,
            parentId,
          ],
        );
        insertId = result.rows[0].id;
      }
      count++;
      if (port.children && port.children.length > 0) {
        for (const child of port.children) {
          await insertPort(child, insertId);
        }
      }
    };

    for (const port of loadout) {
      try {
        await insertPort(port, null);
      } catch (e: unknown) {
        logger.error(`Loadout port ${port.portName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return count;
  }

  private async computeAndStoreMissileDamage(conn: PoolClient, env: GameEnv, shipUuid: string): Promise<void> {
    try {
      const { rows } = await conn.query<any>(
        `SELECT COALESCE(SUM(c.missile_damage), 0) as total
         FROM game.ship_loadouts sl JOIN game.components c ON sl.component_uuid = c.uuid AND sl.env = c.env
         WHERE sl.ship_uuid = $1 AND sl.env = $2 AND c.type IN ('Missile','WeaponMissile')`,
        [shipUuid, env],
      );
      let total = parseFloat(rows[0]?.total) || 0;

      // Fallback for DataForge v8: some racks (e.g. MRCK_S09_AEGS_Eclipse) lost their
      // SEntityComponentDefaultLoadoutParams, so missiles don't appear in ship_loadouts.
      // Use rack_count × max(missile_damage for that size) as an approximation.
      if (total === 0) {
        const { rows: rackRows } = await conn.query<any>(
          `SELECT COALESCE(SUM(
             rack.rack_count * COALESCE((
               SELECT MAX(m.missile_damage)
               FROM game.components m
               WHERE m.env = rack.env
                 AND m.type IN ('Missile','WeaponMissile')
                 AND m.size = rack.rack_missile_size
                 AND m.missile_damage > 0
                 AND m.class_name NOT LIKE 'G%'
             ), 0)
           ), 0) AS total
           FROM game.ship_loadouts sl
           JOIN game.components rack ON sl.component_uuid = rack.uuid AND sl.env = rack.env
           WHERE sl.ship_uuid = $1 AND sl.env = $2
             AND rack.type = 'MissileRack'
             AND rack.rack_count > 0
             AND rack.rack_missile_size > 0`,
          [shipUuid, env],
        );
        total = parseFloat(rackRows[0]?.total) || 0;
      }

      await conn.query('UPDATE game.ships SET missile_damage_total = $1 WHERE uuid = $2 AND env = $3', [
        total > 0 ? total : null,
        shipUuid,
        env,
      ]);
    } catch {
      /* Non-critical */
    }
  }

  private async computeAndStoreWeaponDamage(conn: PoolClient, env: GameEnv, shipUuid: string): Promise<void> {
    try {
      const { rows } = await conn.query<any>(
        `SELECT COALESCE(SUM(c.weapon_dps), 0) as total_dps
         FROM game.ship_loadouts sl JOIN game.components c ON sl.component_uuid = c.uuid AND sl.env = c.env
         WHERE sl.ship_uuid = $1 AND sl.env = $2 AND c.type = 'WeaponGun'`,
        [shipUuid, env],
      );
      const totalDps = parseFloat(rows[0]?.total_dps) || 0;
      await conn.query('UPDATE game.ships SET weapon_damage_total = $1 WHERE uuid = $2 AND env = $3', [
        totalDps > 0 ? totalDps : null,
        shipUuid,
        env,
      ]);
    } catch {
      /* Non-critical */
    }
  }

  // Config-driven modular ship slot definitions.
  // Each key is the ship's DataForge class_name.
  // Each slot entry defines the port, display, prefix to search for all module options,
  // the substring identifying the default module, and optional tier extraction.
  private static readonly MODULAR_SHIP_CONFIGS: Record<
    string,
    Array<{
      slotName: string;
      slotType: string;
      modulePrefix?: string;
      moduleNames?: string[];
      defaultContains: string;
      tierExtract?: boolean;
    }>
  > = {
    AEGS_Retaliator: [
      { slotName: 'hardpoint_front_module', slotType: 'front', modulePrefix: 'AEGS_Retaliator_Module_Front_', defaultContains: 'Base' },
      { slotName: 'hardpoint_rear_module', slotType: 'rear', modulePrefix: 'AEGS_Retaliator_Module_Rear_', defaultContains: 'Base' },
    ],
    RSI_Aurora_Mk2: [
      {
        slotName: 'hardpoint_module',
        slotType: 'module',
        moduleNames: ['RSI_Aurora_Mk2_Module_Cargo', 'RSI_Aurora_Mk2_Module_Missile'],
        defaultContains: 'Cargo',
      },
    ],
    RSI_Apollo_Medivac: [
      {
        slotName: 'hardpoint_modular_room_left',
        slotType: 'left',
        modulePrefix: 'RSI_Apollo_Module_Left_Tier_',
        defaultContains: 'Tier_3',
        tierExtract: true,
      },
      {
        slotName: 'hardpoint_modular_room_right',
        slotType: 'right',
        modulePrefix: 'RSI_Apollo_Module_Right_Tier_',
        defaultContains: 'Tier_3',
        tierExtract: true,
      },
    ],
    RSI_Apollo_Triage: [
      {
        slotName: 'hardpoint_modular_room_left',
        slotType: 'left',
        modulePrefix: 'RSI_Apollo_Module_Left_Tier_',
        defaultContains: 'Tier_1',
        tierExtract: true,
      },
      {
        slotName: 'hardpoint_modular_room_right',
        slotType: 'right',
        modulePrefix: 'RSI_Apollo_Module_Right_Tier_',
        defaultContains: 'Tier_1',
        tierExtract: true,
      },
    ],
    // Caterpillar: front command module + 4 cargo/module bays
    DRAK_Caterpillar: [
      {
        slotName: 'hardpoint_module_command',
        slotType: 'command',
        modulePrefix: 'DRAK_Caterpillar_Module_Command_',
        defaultContains: 'Command',
      },
      { slotName: 'hardpoint_module_01', slotType: 'cargo', modulePrefix: 'DRAK_Caterpillar_Module_', defaultContains: 'Cargo' },
      { slotName: 'hardpoint_module_02', slotType: 'cargo', modulePrefix: 'DRAK_Caterpillar_Module_', defaultContains: 'Cargo' },
      { slotName: 'hardpoint_module_03', slotType: 'cargo', modulePrefix: 'DRAK_Caterpillar_Module_', defaultContains: 'Cargo' },
      { slotName: 'hardpoint_module_04', slotType: 'cargo', modulePrefix: 'DRAK_Caterpillar_Module_', defaultContains: 'Cargo' },
    ],
    // Galaxy: modular mission bay
    RSI_Galaxy: [{ slotName: 'hardpoint_module_bay', slotType: 'bay', modulePrefix: 'RSI_Galaxy_Module_', defaultContains: 'Cargo' }],
    // Ironclad: modular cargo bays
    CNOU_Ironclad: [
      { slotName: 'hardpoint_module_front', slotType: 'front', modulePrefix: 'CNOU_Ironclad_Module_', defaultContains: 'Cargo' },
      { slotName: 'hardpoint_module_mid', slotType: 'mid', modulePrefix: 'CNOU_Ironclad_Module_', defaultContains: 'Cargo' },
    ],
    CNOU_Ironclad_Assault: [
      { slotName: 'hardpoint_module_front', slotType: 'front', modulePrefix: 'CNOU_Ironclad_Module_', defaultContains: 'Cargo' },
      { slotName: 'hardpoint_module_mid', slotType: 'mid', modulePrefix: 'CNOU_Ironclad_Module_', defaultContains: 'Cargo' },
    ],
    // Hull C: detachable cargo pods
    MISC_Hull_C: [{ slotName: 'hardpoint_cargo_01', slotType: 'cargo', modulePrefix: 'MISC_HullC_Module_', defaultContains: 'Cargo' }],
    // Pioneer: modular fabrication bays
    MISC_Pioneer: [
      { slotName: 'hardpoint_module_01', slotType: 'fabrication', modulePrefix: 'MISC_Pioneer_Module_', defaultContains: 'Fabrication' },
    ],
    // 600i: cabin/exploration/touring modules
    ORIG_600i_Explorer: [
      { slotName: 'hardpoint_module_cabin', slotType: 'cabin', modulePrefix: 'ORIG_600i_Module_', defaultContains: 'Cabin' },
    ],
    ORIG_600i_Touring: [
      { slotName: 'hardpoint_module_cabin', slotType: 'cabin', modulePrefix: 'ORIG_600i_Module_', defaultContains: 'Cabin' },
    ],
  };

  private static formatModuleName(className: string): string {
    // e.g. "AEGS_Retaliator_Module_Front_Base" → "Front Base"
    //      "RSI_Apollo_Module_Left_Tier_3" → "Left Tier 3"
    return className
      .replace(/^[A-Z]{2,5}_/, '') // Strip manufacturer prefix
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  private static extractTier(className: string): number | null {
    const m = className.match(/Tier_?(\d+)$/i);
    return m ? parseInt(m[1], 10) : null;
  }

  private async detectAndSaveModules(conn: PoolClient, env: GameEnv, fullData: any, shipClassName: string): Promise<void> {
    if (!fullData?.ref) return;

    const config = ExtractionService.MODULAR_SHIP_CONFIGS[shipClassName];

    if (config) {
      // Config-driven path: enumerate all module alternatives via DataForge prefix search
      await conn.query('DELETE FROM game.ship_modules WHERE ship_uuid = $1 AND env = $2', [fullData.ref, env]);

      for (const slotDef of config) {
        const allModuleNames =
          slotDef.moduleNames ?? (slotDef.modulePrefix ? this.df.findEntityClassNamesByPrefix(slotDef.modulePrefix) : []);
        if (allModuleNames.length === 0) {
          logger.warn(`No modules found for prefix "${slotDef.modulePrefix ?? '(explicit list)'}" on ${shipClassName}`);
          continue;
        }

        const slotDisplay = slotDef.slotName
          .replace(/hardpoint_/i, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim();

        for (const moduleName of allModuleNames) {
          const isDefault = moduleName.includes(slotDef.defaultContains);
          const moduleDisplayName = ExtractionService.formatModuleName(moduleName);
          const tier = slotDef.tierExtract ? ExtractionService.extractTier(moduleName) : null;

          // Extract the module's own internal ports (racks, weapons, missiles) for tier-correct display
          let loadoutJson: string | null = null;
          try {
            const modulePorts = this.df.extractVehicleLoadout(moduleName);
            if (modulePorts && modulePorts.length > 0) {
              loadoutJson = JSON.stringify(modulePorts);
            }
          } catch (_) {
            // Module may have no internal ports (e.g. medical, habitation) — that's fine
          }

          try {
            await conn.query(
              `INSERT INTO game.ship_modules
                 (env, ship_uuid, slot_name, slot_display_name, slot_type, module_class_name, module_name, module_tier, is_default, loadout_json)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                env,
                fullData.ref,
                slotDef.slotName,
                slotDisplay,
                slotDef.slotType,
                moduleName,
                moduleDisplayName,
                tier,
                isDefault ? 1 : 0,
                loadoutJson,
              ],
            );
          } catch (e: unknown) {
            logger.error(
              `Module ${moduleName} (slot ${slotDef.slotName}) on ${shipClassName}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }
      return;
    }

    // Generic fallback path: save only the default module from the current loadout
    const MODULE_PATTERNS = [/module/i, /modular/i, /compartment/i, /bay_section/i];
    const NOISE_SLOT_PATTERNS = [
      /cargogrid_module/i,
      /pdc_aimodule/i,
      /module_dashboard/i,
      /module_seat/i,
      /thruster_module/i,
      /power_plant_commandmodule/i,
      /cargo_module/i,
      /modular_bed/i,
    ];
    const loadout = this.df.extractVehicleLoadout(shipClassName);
    if (!loadout) return;

    const shipShort = shipClassName.replace(/^[A-Z]{2,5}_/, '').replace(/_/g, ' ');

    for (const port of loadout) {
      const isModulePort = MODULE_PATTERNS.some((rx) => rx.test(port.portName));
      if (!isModulePort || !port.componentClassName) continue;
      const isNoise = NOISE_SLOT_PATTERNS.some((rx) => rx.test(port.portName));
      if (isNoise) continue;

      const slotDisplay = port.portName
        .replace(/hardpoint_/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();

      let moduleName = port.componentClassName
        .replace(/^[A-Z]{2,5}_/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
      const shipShortTitle = shipShort.replace(/\b\w/g, (c) => c.toUpperCase());
      if (moduleName.startsWith(shipShortTitle)) {
        moduleName = moduleName.slice(shipShortTitle.length).trim();
      }
      moduleName = moduleName || port.componentClassName;

      try {
        await conn.query(
          `INSERT INTO game.ship_modules (env, ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
          [env, fullData.ref, port.portName, slotDisplay, port.componentClassName, moduleName],
        );
      } catch (e: unknown) {
        logger.error(`Module ${port.portName} on ${shipClassName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ======================================================
  //  PAINTS → ship_paints table
  //  Includes fix for Starfighter/Starlancer (contains-match)
  // ======================================================

  private async savePaints(conn: PoolClient, env: GameEnv, onProgress?: (msg: string) => void): Promise<void> {
    const paints = this.df.extractPaints();
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
    const inserted = await ExtractionService.batchUpsert(
      conn,
      'INSERT INTO game.ship_paints (env, ship_uuid, paint_class_name, paint_name, paint_uuid)',
      '',
      5,
      paintRows,
      ExtractionService.BATCH_SIZE,
    );
    const unmatched = paints.length - matched;
    onProgress?.(
      `Paints: ${inserted} rows saved (${paintRows.length} prepared, ${matched}/${paints.length} matched${unmatched ? `, ${unmatched} unmatched` : ''})`,
    );
  }

  // ======================================================
  //  MANUFACTURERS
  // ======================================================

  private async saveManufacturersFromData(conn: PoolClient): Promise<number> {
    // Source: Manufacturer records extracted directly from the DataForge (SCItemManufacturer struct).
    const manufacturers = this.df.extractAllManufacturers();

    if (manufacturers.size === 0) {
      logger.warn('No manufacturer records found in DataForge — manufacturer table may be incomplete', { module: 'extraction' });
    }

    let saved = 0;
    for (const mfg of manufacturers.values()) {
      // Resolve loc key (e.g. "@manufacturer_NameAEGS") → human-readable name via global.ini
      let name = mfg.code;
      if (mfg.locKey && this.locService.isLoaded) {
        const resolved = this.locService.resolveKey(mfg.locKey);
        // Reject CIG placeholder strings (e.g. "<= PLACEHOLDER =>")
        if (resolved && !resolved.startsWith('<=')) name = resolved;
      }
      try {
        await conn.query(
          `INSERT INTO game.manufacturers (code, name) VALUES ($1, $2)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
          [mfg.code, name],
        );
        saved++;
      } catch (e: unknown) {
        logger.error(`Manufacturer ${mfg.code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return saved;
  }

  // ======================================================
  //  ITEMS + COMMODITIES → items + commodities tables
  // ======================================================

  private async saveItems(
    conn: PoolClient,
    env: GameEnv,
    onProgress?: (msg: string) => void,
  ): Promise<{ items: number; commodities: number }> {
    const { items, commodities } = this.df.extractItems();
    let savedItems = 0;
    let savedCommodities = 0;

    // Apply localization service to resolve human-readable names for items
    if (this.locService.isLoaded) {
      for (const it of items) {
        // Force LOC lookup first (don't rely on resolveOrFallback's "looks clean" bail-out)
        const locName = this.locService.resolveComponentName(it.className);
        if (locName) {
          it.name = locName;
        } else {
          // Fallback: title-case the existing lowercase name and expand manufacturer codes
          it.name = ExtractionService.titleCaseItemName(it.name, it.className);
        }
      }
      for (const cm of commodities) {
        const locName = this.locService.resolveComponentName(cm.className);
        if (locName) cm.name = locName;
        else cm.name = ExtractionService.titleCaseItemName(cm.name, cm.className);
      }
    } else {
      // No localization — still apply title case
      for (const it of items) it.name = ExtractionService.titleCaseItemName(it.name, it.className);
      for (const cm of commodities) cm.name = ExtractionService.titleCaseItemName(cm.name, cm.className);
    }

    // ── Batch upsert items ──
    if (items.length > 0) {
      const ITEM_COLS = [
        'env',
        'uuid',
        'class_name',
        'name',
        'normalized_name',
        'canonical_item_key',
        'type',
        'sub_type',
        'size',
        'grade',
        'manufacturer_code',
        'mass',
        'hp',
        'weapon_damage',
        'weapon_damage_type',
        'weapon_fire_rate',
        'weapon_range',
        'weapon_speed',
        'weapon_ammo_count',
        'weapon_dps',
        'armor_damage_reduction',
        'armor_temp_min',
        'armor_temp_max',
        'data_json',
      ];
      const ITEM_UPDATE = ITEM_COLS.filter((c) => c !== 'uuid' && c !== 'env')
        .map((c) => `${c}=EXCLUDED.${c}`)
        .join(', ');
      const colCount = ITEM_COLS.length;

      const batchSize = 200;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const values: any[] = [];
        let paramIdx = 0;
        const valuePlaceholders = batch.map(() => {
          const cols = Array.from({ length: colCount }, () => `$${++paramIdx}`);
          return `(${cols.join(',')})`;
        });

        for (const it of batch) {
          const canonical = canonicalizeItemRecord({
            name: it.name,
            className: it.className,
            type: it.type,
            subType: it.subType,
          });

          values.push(
            env,
            it.uuid,
            it.className,
            it.name,
            canonical.normalizedName,
            canonical.canonicalItemKey,
            it.type,
            it.subType,
            it.size,
            it.grade,
            it.manufacturerCode,
            it.mass,
            it.hp,
            it.weaponDamage,
            it.weaponDamageType,
            it.weaponFireRate,
            it.weaponRange,
            it.weaponSpeed,
            it.weaponAmmoCount,
            it.weaponDps,
            it.armorDamageReduction,
            it.armorTempMin,
            it.armorTempMax,
            it.dataJson ? JSON.stringify(it.dataJson) : null,
          );
        }

        await conn.query(
          `INSERT INTO game.items (${ITEM_COLS.join(', ')}) VALUES ${valuePlaceholders.join(', ')}
           ON CONFLICT (uuid, env) DO UPDATE SET ${ITEM_UPDATE}, updated_at=CURRENT_TIMESTAMP`,
          values,
        );
        savedItems += batch.length;
      }
    }

    // ── Batch upsert commodities ──
    if (commodities.length > 0) {
      const COMM_COLS = [
        'env',
        'uuid',
        'class_name',
        'name',
        'normalized_name',
        'canonical_commodity_key',
        'type',
        'sub_type',
        'symbol',
        'occupancy_scu',
        'data_json',
      ];
      const COMM_UPDATE = COMM_COLS.filter((c) => c !== 'uuid' && c !== 'env')
        .map((c) => `${c}=EXCLUDED.${c}`)
        .join(', ');
      const colCount = COMM_COLS.length;

      const batchSize = 200;
      for (let i = 0; i < commodities.length; i += batchSize) {
        const batch = commodities.slice(i, i + batchSize);
        const values: any[] = [];
        let paramIdx = 0;
        const valuePlaceholders = batch.map(() => {
          const cols = Array.from({ length: colCount }, () => `$${++paramIdx}`);
          return `(${cols.join(',')})`;
        });

        for (const cm of batch) {
          const canonical = canonicalizeCommodityRecord({
            name: cm.name,
            className: cm.className,
            type: cm.type,
            subType: cm.subType,
            symbol: cm.symbol,
          });

          values.push(
            env,
            cm.uuid,
            cm.className,
            cm.name,
            canonical.normalizedName,
            canonical.canonicalCommodityKey,
            cm.type,
            cm.subType,
            cm.symbol,
            cm.occupancyScu,
            cm.dataJson ? JSON.stringify(cm.dataJson) : null,
          );
        }

        await conn.query(
          `INSERT INTO game.commodities (${COMM_COLS.join(', ')}) VALUES ${valuePlaceholders.join(', ')}
           ON CONFLICT (uuid, env) DO UPDATE SET ${COMM_UPDATE}, updated_at=CURRENT_TIMESTAMP`,
          values,
        );
        savedCommodities += batch.length;
      }
    }

    onProgress?.(`Items: ${savedItems}, Commodities: ${savedCommodities}`);
    return { items: savedItems, commodities: savedCommodities };
  }

  // ======================================================
  //  SHOPS → shops + shop_inventory tables
  // ======================================================

  private async saveShopsData(
    conn: PoolClient,
    env: GameEnv,
    onProgress?: (msg: string) => void,
  ): Promise<{ shops: number; inventory: number }> {
    const provider = this.df.getProvider();
    if (!provider) {
      onProgress?.('Shops: P4K provider not available, skipping');
      return { shops: 0, inventory: 0 };
    }

    // 1. Extract shop instances from Prefab XMLs + ShopFranchise DataForge records
    onProgress?.('Shops: extracting from Prefab XMLs…');
    const shops = await extractShopsFromPrefabs(this.df, provider, this.locService);
    onProgress?.(`Shops: ${shops.length} instances extracted from Prefab XMLs`);

    // 2. Build location slug → loc_key index from the locations table (already populated)
    //    loc_key here = the game localization key, e.g. "@ui_pregame_port_Area18_name"
    //    We store this directly in canonical_location_key so the IHM can join shops ↔ locations.
    const { rows: locRows } = await conn.query<any>(
      `SELECT class_name, name, loc_key, type FROM game.locations WHERE env = $1 AND loc_key IS NOT NULL AND loc_key != ''`,
      [env],
    );
    const slugIndex = buildLocationSlugIndex(
      (locRows as any[]).map((r: any) => ({
        class_name: String(r.class_name ?? ''),
        name: String(r.name ?? ''),
        loc_key: r.loc_key ? String(r.loc_key) : null,
        type: String(r.type ?? ''),
      })),
    );
    onProgress?.(`Shops: built location index with ${slugIndex.size} slug entries from ${locRows.length} locations`);

    // Also build loc_key → location metadata (system, planet_moon, city, location)
    // Walk the parent chain: landing_zone → moon/planet → system
    // For simplicity we look up the direct location name + its parent's name
    const locMetaByLocKey = new Map<string, { location: string; system: string | null; planet_moon: string | null; city: string | null }>();

    // Build parent map
    const { rows: allLocRows } = await conn.query<any>(
      `SELECT uuid, class_name, name, loc_key, type, system_code, parent_uuid FROM game.locations WHERE env = $1`,
      [env],
    );
    const locByUuid = new Map<string, any>((allLocRows as any[]).map((r: any) => [r.uuid, r]));

    for (const row of allLocRows as any[]) {
      if (!row.loc_key) continue;
      const type = (row.type || '').toLowerCase();

      let system: string | null = row.system_code || null;
      let planet_moon: string | null = null;
      let city: string | null = null;
      const location = row.name || row.class_name;

      // Resolve human-readable system name from system_code
      if (system) {
        // Try to find system row by class_name matching system_code
        const sysRow = (allLocRows as any[]).find(
          (r: any) => r.type === 'system' && (r.class_name || '').toLowerCase().includes(system!.toLowerCase()),
        );
        if (sysRow) system = sysRow.name || system;
      }

      if (['landing_zone', 'outpost', 'station', 'rest_stop'].includes(type)) {
        city = row.name;
        // Walk up to find planet/moon
        const parent = row.parent_uuid ? locByUuid.get(row.parent_uuid) : null;
        if (parent) {
          const pType = (parent.type || '').toLowerCase();
          if (['planet', 'moon', 'asteroid'].includes(pType)) {
            planet_moon = parent.name;
          }
        }
      } else if (['planet', 'moon'].includes(type)) {
        planet_moon = row.name;
      }

      locMetaByLocKey.set(row.loc_key, { location, system, planet_moon, city });
    }

    // 3. Build shop rows
    const shopRows: (string | number | null)[][] = [];
    for (const shop of shops) {
      // Resolve loc_key from location slug
      const slug = shop.locationSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
      const locKey = slugIndex.get(slug) ?? null;

      const meta = locKey ? locMetaByLocKey.get(locKey) : null;

      // Normalize shop name
      const normalizedName = shop.name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const canonicalShopKey = locKey ? `${locKey}::${normalizedName}` : normalizedName;

      shopRows.push([
        env,
        shop.name,
        normalizedName,
        canonicalShopKey,
        locKey, // canonical_location_key = game loc_key (e.g. "@ui_pregame_port_Area18_name")
        meta?.location ?? null,
        meta?.system ?? null,
        meta?.planet_moon ?? null,
        meta?.city ?? null,
        shop.shopType,
        shop.className,
        shop.franchiseSlug,
        shop.locationSlug,
        shop.franchiseLocKey,
        shop.p4kPath,
        shop.rawJson ? JSON.stringify(shop.rawJson) : null,
      ]);
    }

    const SHOP_CONFLICT = `(class_name, env) DO UPDATE SET
      name=EXCLUDED.name, normalized_name=EXCLUDED.normalized_name,
      canonical_shop_key=EXCLUDED.canonical_shop_key, canonical_location_key=EXCLUDED.canonical_location_key,
      location=EXCLUDED.location, system=EXCLUDED.system, planet_moon=EXCLUDED.planet_moon, city=EXCLUDED.city,
      shop_type=EXCLUDED.shop_type, franchise_slug=EXCLUDED.franchise_slug, location_slug=EXCLUDED.location_slug,
      franchise_loc_key=EXCLUDED.franchise_loc_key, p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json,
      updated_at=CURRENT_TIMESTAMP`;

    let savedShops = 0;
    if (shopRows.length > 0) {
      savedShops = await ExtractionService.batchUpsert(
        conn,
        `INSERT INTO game.shops (env, name, normalized_name, canonical_shop_key, canonical_location_key, location, system, planet_moon, city, shop_type, class_name, franchise_slug, location_slug, franchise_loc_key, p4k_path, raw_json)`,
        SHOP_CONFLICT,
        16,
        shopRows,
      );
    }

    // shop_inventory is not populated from P4K (server-managed data)
    // Preserve existing community-contributed inventory data (no DELETE here)

    onProgress?.(`Shops: ${savedShops}/${shops.length} saved (inventory is community-sourced, not wiped)`);
    return { shops: savedShops, inventory: 0 };
  }

  // ======================================================
  //  CHANGELOG
  // ======================================================

  private async generateChangelog(
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
      'SELECT uuid, class_name, name, type, sub_type, size, grade, manufacturer_code FROM game.components WHERE env = $1',
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

    const compDetailFields = ['type', 'sub_type', 'size', 'grade', 'manufacturer_code'];

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

  // ======================================================
  //  MINING DATA
  // ======================================================

  private async saveMiningData(
    conn: PoolClient,
    env: GameEnv,
    onProgress?: (msg: string) => void,
  ): Promise<{ elements: number; compositions: number }> {
    const locAdapter = this.locService.isLoaded ? { resolve: (k: string) => this.locService.resolveKey(k) ?? null } : undefined;

    const allElements = extractMiningElements(this.df, locAdapter);
    // Filter out test/template entries
    const elements = allElements.filter((e) => !e.className.toLowerCase().includes('test') && !e.name?.toLowerCase().includes('template'));

    const allCompositions = extractMiningCompositions(this.df, elements, locAdapter);
    // Filter out test/template compositions
    const compositions = allCompositions.filter(
      (c) => !c.className.toLowerCase().includes('test') && !c.depositName?.toLowerCase().includes('test'),
    );

    if (!elements.length && !compositions.length) {
      onProgress?.('Mining: no data found in DataForge');
      return { elements: 0, compositions: 0 };
    }

    // ── Save elements ──
    const elemRows = elements.map((e) => [
      env,
      e.uuid,
      e.className,
      e.name,
      e.commodityUuid,
      e.instability,
      e.resistance,
      e.optimalWindowMidpoint,
      e.optimalWindowMidpointRand,
      e.optimalWindowThinness,
      e.explosionMultiplier,
      e.clusterFactor,
      e.p4kPath,
      e.rawJson ? JSON.stringify(e.rawJson) : null,
    ]);
    const savedElements = await ExtractionService.batchUpsert(
      conn,
      `INSERT INTO game.mining_elements
         (env, uuid, class_name, name, commodity_uuid,
          instability, resistance,
          optimal_window_midpoint, optimal_window_midpoint_rand,
          optimal_window_thinness, explosion_multiplier, cluster_factor,
          p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, name=EXCLUDED.name, commodity_uuid=EXCLUDED.commodity_uuid,
         instability=EXCLUDED.instability, resistance=EXCLUDED.resistance,
         optimal_window_midpoint=EXCLUDED.optimal_window_midpoint,
         optimal_window_midpoint_rand=EXCLUDED.optimal_window_midpoint_rand,
         optimal_window_thinness=EXCLUDED.optimal_window_thinness,
         explosion_multiplier=EXCLUDED.explosion_multiplier, cluster_factor=EXCLUDED.cluster_factor,
         p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json`,
      14,
      elemRows,
    );

    // ── Save compositions (parent rows first) ──
    const compRows = compositions.map((c) => [
      env,
      c.uuid,
      c.className,
      c.depositName,
      c.minDistinctElements,
      c.p4kPath,
      c.rawJson ? JSON.stringify(c.rawJson) : null,
    ]);
    await ExtractionService.batchUpsert(
      conn,
      `INSERT INTO game.mining_compositions (env, uuid, class_name, deposit_name, min_distinct_elements, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET class_name=EXCLUDED.class_name, deposit_name=EXCLUDED.deposit_name, min_distinct_elements=EXCLUDED.min_distinct_elements, p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json`,
      7,
      compRows,
    );

    // ── Save composition parts ──
    const elementUuidSet = new Set(elements.map((e) => e.uuid));
    const partRows: (string | number | null)[][] = [];
    for (const comp of compositions) {
      for (const part of comp.parts) {
        if (elementUuidSet.has(part.elementUuid)) {
          partRows.push([
            env,
            env,
            comp.uuid,
            part.elementUuid,
            part.minPercentage,
            part.maxPercentage,
            part.probability,
            part.curveExponent,
          ]);
        }
      }
    }
    if (partRows.length > 0) {
      await ExtractionService.batchUpsert(
        conn,
        `INSERT INTO game.mining_composition_parts
           (composition_env, element_env, composition_uuid, element_uuid, min_percentage, max_percentage, probability, curve_exponent)`,
        '',
        8,
        partRows,
      );
    }

    onProgress?.(`Mining: ${savedElements} elements, ${compositions.length} compositions, ${partRows.length} parts`);
    return { elements: savedElements, compositions: compositions.length };
  }

  // ======================================================
  //  MISSIONS → missions table
  // ======================================================

  private async saveMissions(conn: PoolClient, env: GameEnv, onProgress?: (msg: string) => void): Promise<number> {
    const locAdapter = this.locService.isLoaded
      ? {
          resolveKey: (k: string) => this.locService.resolveKey(k) ?? null,
          resolveComponentName: (className: string) => this.locService.resolveComponentName(className),
        }
      : undefined;

    const missions = extractMissions(this.df, locAdapter);
    if (!missions.length) {
      onProgress?.('Missions: no ContractTemplate records found');
      return 0;
    }

    // Only store missions not flagged as dev-only
    const filtered = missions.filter((m) => !m.notForRelease && !m.workInProgress);
    onProgress?.(`Missions: ${filtered.length} usable out of ${missions.length} total`);

    const rows = filtered.map((m) => [
      env,
      m.uuid,
      m.className,
      m.title,
      m.description,
      m.missionType,
      m.canBeShared ? 1 : 0,
      m.onlyOwnerComplete ? 1 : 0,
      m.isLegal ? 1 : 0,
      m.completionTimeSecs != null ? Math.round(m.completionTimeSecs) : null,
      m.notForRelease ? 1 : 0,
      m.workInProgress ? 1 : 0,
      m.rewardMin != null ? Math.round(m.rewardMin) : null,
      m.rewardMax != null ? Math.round(m.rewardMax) : null,
      m.rewardCurrency,
      m.faction,
      m.missionGiver,
      m.locationSystem,
      m.locationPlanet,
      m.locationName,
      m.dangerLevel != null ? Math.round(m.dangerLevel) : null,
      m.requiredReputation != null ? Math.round(m.requiredReputation) : null,
      m.reputationReward != null ? Math.round(m.reputationReward) : null,
      m.baseXp != null ? Math.round(m.baseXp) : null,
      m.category,
      m.isUnique ? 1 : 0,
      m.hasBlueprintReward ? 1 : 0,
      m.blueprintRewardUuid,
      m.buyInAmount != null ? Math.round(m.buyInAmount) : null,
      m.p4kPath,
      m.rawJson ? JSON.stringify(m.rawJson) : null,
    ]);

    const saved = await ExtractionService.batchUpsert(
      conn,
      `INSERT INTO game.missions
         (env, uuid, class_name, title, description, mission_type,
          can_be_shared, only_owner_complete, is_legal,
          completion_time_s, not_for_release, work_in_progress,
          reward_min, reward_max, reward_currency,
          faction, mission_giver,
          location_system, location_planet, location_name,
          danger_level, required_reputation, reputation_reward,
          base_xp, category, is_unique, has_blueprint_reward, blueprint_reward_uuid,
          buy_in_amount, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, title=EXCLUDED.title, description=EXCLUDED.description,
         mission_type=EXCLUDED.mission_type, can_be_shared=EXCLUDED.can_be_shared,
         only_owner_complete=EXCLUDED.only_owner_complete, is_legal=EXCLUDED.is_legal,
         completion_time_s=EXCLUDED.completion_time_s, not_for_release=EXCLUDED.not_for_release,
         work_in_progress=EXCLUDED.work_in_progress,
         reward_min=EXCLUDED.reward_min, reward_max=EXCLUDED.reward_max,
         reward_currency=EXCLUDED.reward_currency, faction=EXCLUDED.faction,
         mission_giver=EXCLUDED.mission_giver, location_system=EXCLUDED.location_system,
         location_planet=EXCLUDED.location_planet, location_name=EXCLUDED.location_name,
         danger_level=EXCLUDED.danger_level, required_reputation=EXCLUDED.required_reputation,
         reputation_reward=EXCLUDED.reputation_reward,
         base_xp=EXCLUDED.base_xp, category=EXCLUDED.category,
         is_unique=EXCLUDED.is_unique, has_blueprint_reward=EXCLUDED.has_blueprint_reward,
         blueprint_reward_uuid=EXCLUDED.blueprint_reward_uuid,
         buy_in_amount=EXCLUDED.buy_in_amount,
         p4k_path=EXCLUDED.p4k_path,
         raw_json=EXCLUDED.raw_json`,
      31,
      rows,
    );

    onProgress?.(`Missions: ${saved} records saved [${env}]`);

    // Enrich faction/missionGiver from ContractGenerator
    if (locAdapter) {
      onProgress?.('Missions: enriching faction/giver from ContractGenerator…');
      const factionData = extractMissionFactionData(this.df, locAdapter);
      if (factionData.size > 0) {
        let enriched = 0;
        for (const [uuid, d] of factionData.entries()) {
          if (!d.faction) continue;
          await conn.query('UPDATE game.missions SET faction=$1, mission_giver=$2 WHERE uuid=$3 AND env=$4', [
            d.faction,
            d.missionGiver,
            uuid,
            env,
          ]);
          enriched++;
        }
        if (enriched > 0) {
          onProgress?.(`Missions: faction enriched for ${enriched} missions`);
        }
      }
    }

    // Enrich rewards/difficulty/buy-in/reputation from MissionBrokerEntry matching
    onProgress?.('Missions: enriching rewards/difficulty/buy-in/reputation from MissionBrokerEntry…');
    const mbeData = extractMissionMbeEnrichment(this.df, locAdapter);
    if (mbeData.size > 0) {
      let mbeEnriched = 0;
      for (const [uuid, d] of mbeData.entries()) {
        await conn.query(
          `UPDATE game.missions SET
             reward_min        = COALESCE(reward_min, $1),
             reward_max        = COALESCE(reward_max, $2),
             reward_currency   = COALESCE(reward_currency, 'aUEC'),
             danger_level      = COALESCE(danger_level, $3),
             buy_in_amount     = COALESCE(buy_in_amount, $4),
             reputation_reward = COALESCE(reputation_reward, $5),
             mission_giver     = COALESCE(mission_giver, $6)
           WHERE uuid = $7 AND env = $8`,
          [d.rewardMin, d.rewardMax, d.dangerLevel, d.buyInAmount, d.reputationReward, d.missionGiver, uuid, env],
        );
        mbeEnriched++;
      }
      onProgress?.(`Missions: MBE enrichment applied to ${mbeEnriched} missions`);
    }

    // Type-level fallback: fill missing reward_min/max with median of enriched missions of same type,
    // and missing danger_level with mode of enriched missions of same type.
    // Only applies to mission types with at least 3 enriched missions to ensure reliable estimates.
    onProgress?.('Missions: applying type-level median fallback for missing rewards/danger…');
    {
      const { rows: enrichedRows } = await conn.query<any>(
        'SELECT mission_type, reward_min, reward_max, danger_level FROM game.missions WHERE env = $1 AND (reward_min IS NOT NULL OR danger_level IS NOT NULL)',
        [env],
      );
      const byType = new Map<string, { rewardMins: number[]; rewardMaxs: number[]; dangers: number[] }>();
      for (const row of enrichedRows as {
        mission_type: string;
        reward_min: number | null;
        reward_max: number | null;
        danger_level: number | null;
      }[]) {
        if (!row.mission_type) continue;
        if (!byType.has(row.mission_type)) byType.set(row.mission_type, { rewardMins: [], rewardMaxs: [], dangers: [] });
        const entry = byType.get(row.mission_type)!;
        if (row.reward_min != null) entry.rewardMins.push(row.reward_min);
        if (row.reward_max != null) entry.rewardMaxs.push(row.reward_max);
        if (row.danger_level != null) entry.dangers.push(row.danger_level);
      }

      const median = (arr: number[]): number => {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
      };
      const mode = (arr: number[]): number => {
        const freq = new Map<number, number>();
        for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
        return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
      };

      let typeFallbackCount = 0;
      for (const [missionType, { rewardMins, rewardMaxs, dangers }] of byType.entries()) {
        if (rewardMins.length >= 3) {
          const medMin = median(rewardMins);
          const medMax = rewardMaxs.length >= 3 ? median(rewardMaxs) : medMin;
          const r = await conn.query<any>(
            `UPDATE game.missions SET reward_min=$1, reward_max=$2, reward_currency=COALESCE(reward_currency,'aUEC')
               WHERE mission_type=$3 AND reward_min IS NULL AND env=$4`,
            [medMin, medMax, missionType, env],
          );
          typeFallbackCount += r.rowCount ?? 0;
        }
        if (dangers.length >= 3) {
          const modeVal = mode(dangers);
          await conn.query('UPDATE game.missions SET danger_level=$1 WHERE mission_type=$2 AND danger_level IS NULL AND env=$3', [
            modeVal,
            missionType,
            env,
          ]);
        }
      }
      if (typeFallbackCount > 0) {
        onProgress?.(`Missions: type-level fallback applied to ${typeFallbackCount} missions without reward`);
      }
    }

    // Ensure all missions have reward_currency set (aUEC is universal in SC)
    await conn.query("UPDATE game.missions SET reward_currency='aUEC' WHERE reward_currency IS NULL AND env=$1", [env]);

    return saved;
  }

  private async saveMissionBlueprintLinks(conn: PoolClient, env: GameEnv, onProgress?: (msg: string) => void): Promise<void> {
    const links = extractMissionBlueprintLinks(this.df);

    // Fetch UUIDs that actually exist in DB to avoid FK violations
    const { rows: missionRows } = await conn.query<any>('SELECT uuid, class_name FROM game.missions WHERE env = $1', [env]);
    const { rows: blueprintRows } = await conn.query<any>('SELECT uuid, class_name FROM game.crafting_recipes WHERE env = $1', [env]);
    const missionSet = new Set((missionRows as { uuid: string }[]).map((r) => r.uuid));
    const blueprintSet = new Set((blueprintRows as { uuid: string }[]).map((r) => r.uuid));

    const validRows = links
      .filter((l) => missionSet.has(l.missionUuid) && blueprintSet.has(l.blueprintUuid))
      .map((l) => [l.missionUuid, l.blueprintUuid] as [string, string]);

    // ── Manual overrides: loot-based links not present in DataForge ──────────
    // ADP (cds_legacy_armor) blueprints are dropped as loot in UGF Unlawful missions.
    // These links are not encoded in ContractGenerator/BlueprintPoolRecord.
    const UGF_UNLAWFUL_CLASS_NAMES = ['EliminateAll_Unlawful_UGF', 'EliminateBoss_Unlawful_UGF', 'EliminateSpecific_Unlawful_UGF'];
    const ugfMissionUuids = (missionRows as { uuid: string; class_name: string }[])
      .filter((r) => UGF_UNLAWFUL_CLASS_NAMES.includes(r.class_name))
      .map((r) => r.uuid);
    const adpBlueprintUuids = (blueprintRows as { uuid: string; class_name: string }[])
      .filter((r) => r.class_name.includes('cds_legacy_armor'))
      .map((r) => r.uuid);

    const seenKeys = new Set(validRows.map(([m, b]) => `${m}:${b}`));
    for (const missionUuid of ugfMissionUuids) {
      for (const blueprintUuid of adpBlueprintUuids) {
        const key = `${missionUuid}:${blueprintUuid}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          validRows.push([missionUuid, blueprintUuid]);
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!validRows.length) {
      onProgress?.('Mission blueprint links: none matched existing missions/blueprints');
      return;
    }

    const mbrRows = validRows.map(([m, b]) => [env, env, m, b]);
    await ExtractionService.batchUpsert(
      conn,
      `INSERT INTO game.mission_blueprint_rewards (mission_env, blueprint_env, mission_uuid, blueprint_uuid)`,
      '(mission_uuid, blueprint_uuid) DO NOTHING',
      4,
      mbrRows,
    );

    const dfCount = links.filter((l) => missionSet.has(l.missionUuid) && blueprintSet.has(l.blueprintUuid)).length;
    const manualCount = ugfMissionUuids.length * adpBlueprintUuids.length;
    onProgress?.(`Mission blueprint links: ${validRows.length} pairs saved (${dfCount} DataForge + ${manualCount} manual UGF/ADP)`);
  }

  private async saveLocations(conn: PoolClient, env: GameEnv, onProgress?: (msg: string) => void): Promise<number> {
    const locAdapter = this.locService.isLoaded
      ? { resolveKey: (k: string) => this.locService.resolveKey(k) ?? null }
      : { resolveKey: () => null };

    const records = extractLocations(this.df, locAdapter, onProgress);
    if (!records.length) {
      onProgress?.('Locations: 0 found');
      return 0;
    }

    const rows: (string | number | null)[][] = records.map((r) => [
      env,
      r.uuid,
      r.className.substring(0, 255),
      r.name.substring(0, 255),
      r.type.substring(0, 50),
      r.systemCode,
      r.parentUuid,
      r.locKey,
      r.description,
      r.coordinates ? JSON.stringify(r.coordinates) : null,
      r.p4kPath,
      r.rawJson ? JSON.stringify(r.rawJson) : null,
      r.isScannable ? 1 : 0,
      r.hideInStarmap ? 1 : 0,
    ]);

    const affected = await ExtractionService.batchUpsert(
      conn,
      'INSERT INTO game.locations (env, uuid, class_name, name, type, system_code, parent_uuid, loc_key, description, coordinates, p4k_path, raw_json, is_scannable, hide_in_starmap)',
      '(uuid, env) DO UPDATE SET class_name=EXCLUDED.class_name, name=EXCLUDED.name, type=EXCLUDED.type, system_code=EXCLUDED.system_code, parent_uuid=EXCLUDED.parent_uuid, loc_key=EXCLUDED.loc_key, description=EXCLUDED.description, coordinates=EXCLUDED.coordinates, p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json, is_scannable=EXCLUDED.is_scannable, hide_in_starmap=EXCLUDED.hide_in_starmap',
      14,
      rows,
    );

    onProgress?.(`Locations: ${affected} upserted`);
    return records.length;
  }

  private async saveCraftingRecipes(conn: PoolClient, env: GameEnv, onProgress?: (msg: string) => void): Promise<number> {
    const locAdapter = this.locService.isLoaded
      ? {
          resolveKey: (k: string) => this.locService.resolveKey(k) ?? null,
          resolveComponentName: (className: string) => this.locService.resolveComponentName(className),
        }
      : undefined;

    const recipes = extractCraftingRecipes(this.df, locAdapter);
    if (!recipes.length) {
      onProgress?.('Crafting: no recipe records found in this build');
      return 0;
    }

    onProgress?.(`Crafting: ${recipes.length} recipes found`);

    // Save recipes
    const recipeRows = recipes.map((r) => [
      env,
      r.uuid,
      r.className,
      r.name,
      r.category,
      r.outputItemName,
      r.outputItemUuid,
      r.outputQuantity,
      r.craftingTime,
      r.stationType,
      r.skillLevel,
      r.p4kPath,
      r.rawJson ? JSON.stringify(r.rawJson) : null,
    ]);

    const savedRecipes = await ExtractionService.batchUpsert(
      conn,
      `INSERT INTO game.crafting_recipes
         (env, uuid, class_name, name, category, output_item_name, output_item_uuid,
          output_quantity, crafting_time_s, station_type, skill_level, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, name=EXCLUDED.name, category=EXCLUDED.category,
         output_item_name=EXCLUDED.output_item_name, output_item_uuid=EXCLUDED.output_item_uuid,
         output_quantity=EXCLUDED.output_quantity, crafting_time_s=EXCLUDED.crafting_time_s,
         station_type=EXCLUDED.station_type, skill_level=EXCLUDED.skill_level,
         p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json`,
      13,
      recipeRows,
    );

    // Save ingredients
    let savedIngredients = 0;
    const ingredientRows: (string | number | null)[][] = [];
    for (const r of recipes) {
      for (const ing of r.ingredients) {
        ingredientRows.push([
          r.uuid,
          ing.itemName,
          ing.itemUuid,
          ing.quantity,
          ing.isOptional ? 1 : 0,
          ing.scu,
          ing.minQuality,
          ing.slotName,
        ]);
      }
    }

    if (ingredientRows.length > 0) {
      // Add env to each ingredient row
      const ingredientRowsWithEnv = ingredientRows.map(([rUuid, ...rest]) => [env, rUuid, ...rest]);
      savedIngredients = await ExtractionService.batchUpsert(
        conn,
        `INSERT INTO game.crafting_ingredients
           (recipe_env, recipe_uuid, item_name, item_uuid, quantity, is_optional, scu, min_quality, slot_name)`,
        '',
        9,
        ingredientRowsWithEnv,
      );
    }

    // Save slot modifiers
    let savedModifiers = 0;
    const modifierRows: (string | number | null)[][] = [];
    for (const r of recipes) {
      for (const mod of r.modifiers) {
        modifierRows.push([
          r.uuid,
          mod.slotName,
          mod.propertyName,
          mod.propertyUuid,
          mod.unitFormat,
          mod.startQuality,
          mod.endQuality,
          mod.modifierAtStart,
          mod.modifierAtEnd,
          mod.modifierType ?? null,
        ]);
      }
    }

    if (modifierRows.length > 0) {
      // Add env to each modifier row
      const modifierRowsWithEnv = modifierRows.map(([rUuid, ...rest]) => [env, rUuid, ...rest]);
      savedModifiers = await ExtractionService.batchUpsert(
        conn,
        `INSERT INTO game.crafting_slot_modifiers
           (recipe_env, recipe_uuid, slot_name, property_name, property_uuid, unit_format, start_quality, end_quality, modifier_at_start, modifier_at_end, modifier_type)`,
        '',
        11,
        modifierRowsWithEnv,
      );
    }

    onProgress?.(`Crafting: ${savedRecipes} recipes, ${savedIngredients} ingredients, ${savedModifiers} modifiers saved [${env}]`);
    return savedRecipes;
  }

  // ======================================================
  //  CTM SCRAPER → ships.ctm_url
  // ======================================================

  /**
   * Scrape 3D model (.ctm) URLs from the RSI website and persist them to ships.ctm_url.
   *
   * Only processes ships that have a ship_matrix URL (RSI page known).
   * Skip nothing in the DB: previously scraped URLs are kept unless overwritten.
   */
  private async saveShipCtmModels(
    conn: PoolClient,
    _env: GameEnv,
    ctmOpts: { force?: boolean; concurrency?: number },
    onProgress?: (msg: string) => void,
  ): Promise<void> {
    const { force = false, concurrency = 1 } = ctmOpts;
    await conn.query('ALTER TABLE rsi.ship_matrix ADD COLUMN IF NOT EXISTS ctm_url VARCHAR(500)');

    // Incremental mode: query ALL envs so PTU-only ships also get a CTM URL.
    // The UPDATE below is already env-agnostic (WHERE class_name = ?) so a single
    // scrape covers every env at once.
    const { rows: gameRows } = await conn.query<any>(
      `SELECT DISTINCT ON (s.class_name) s.class_name, s.name, sm.url as rsi_url
       FROM game.ships s
       INNER JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
       WHERE s.vehicle_category = 'ship'
         AND sm.url IS NOT NULL
         ${force ? '' : 'AND s.ctm_url IS NULL'}
       ORDER BY s.class_name, s.env`,
    );

    const { rows: conceptRows } = await conn.query<any>(
      `SELECT 'concept-' || sm.id::text as class_name, sm.name, sm.url as rsi_url
       FROM rsi.ship_matrix sm
       WHERE sm.url IS NOT NULL
         AND sm.production_status IN ('in-concept', 'in-production', 'in-development')
         AND sm.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL)
         ${force ? '' : 'AND sm.ctm_url IS NULL'}
       ORDER BY sm.name`,
    );

    if (!gameRows.length && !conceptRows.length) {
      onProgress?.(force ? 'CTM: no ships with RSI URL found, skipping' : 'CTM: all ships already have a CTM URL — nothing to scrape');
      return;
    }

    const ships: ShipToScrape[] = gameRows.map((r: any) => ({
      className: r.class_name as string,
      name: r.name as string,
      rsiUrl: r.rsi_url as string,
    }));
    const conceptShips: ShipToScrape[] = conceptRows.map((r: any) => ({
      className: r.class_name as string,
      name: r.name as string,
      rsiUrl: r.rsi_url as string,
    }));
    const allShips = [...ships, ...conceptShips];

    onProgress?.(`CTM: scraping ${ships.length} ship${ships.length !== 1 ? 's' : ''}…`);
    const ctmMap = await scrapeShipCtmUrls(allShips, { concurrency, onProgress });
    onProgress?.(`CTM: found ${ctmMap.size}/${allShips.length} CTM URLs`);

    if (!ctmMap.size) return;

    let updatedGame = 0;
    let updatedConcept = 0;
    for (const [className, ctmUrl] of ctmMap) {
      if (className.startsWith('concept-')) {
        const shipMatrixId = Number(className.replace('concept-', ''));
        if (Number.isInteger(shipMatrixId)) {
          await conn.query('UPDATE rsi.ship_matrix SET ctm_url = $1 WHERE id = $2', [ctmUrl, shipMatrixId]);
          updatedConcept++;
        }
        continue;
      }
      // Update across all envs — CTM URLs come from RSI website (env-agnostic)
      await conn.query('UPDATE game.ships SET ctm_url = $1 WHERE class_name = $2', [ctmUrl, className]);
      updatedGame++;
    }
    onProgress?.(`CTM: ${updatedGame} game ships updated (all envs), ${updatedConcept} concept ships updated`);
  }
}
