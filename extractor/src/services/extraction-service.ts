/**
 * ExtractionService — Full extraction pipeline from P4K/DataForge to PostgreSQL
 *
 * This service runs locally on the user's PC with access to the P4K file.
 * It parses binary game data, extracts ships/components/paints/shops,
 * and writes everything to the remote PostgreSQL database (schemas: game, rsi, meta).
 *
 * Domain persistence logic lives in src/persisters/ — this file keeps the
 * orchestration: transaction management, module selection, sanity checks and
 * RSI sync calls.
 */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { DataForgeService } from '../dataforge/dataforge-service.js';
import { EXTRACTOR_DEFAULTS } from '../extractor-config.js';
import logger from '../logger.js';
import { type ExtractionModule, type GameEnv, NETWORK_MODULES } from '../module-registry.js';
import { generateChangelog } from '../persisters/changelog.js';
import { saveComponents } from '../persisters/components.js';
import type { PersistContext } from '../persisters/context.js';
import { saveCraftingRecipes } from '../persisters/crafting.js';
import { saveShipCtmModels } from '../persisters/ctm.js';
import { saveGameInsights } from '../persisters/game-insights.js';
import { saveItems } from '../persisters/items.js';
import { saveLocations } from '../persisters/locations.js';
import { saveManufacturersFromData } from '../persisters/manufacturers.js';
import { saveMiningData } from '../persisters/mining.js';
import { saveMissionBlueprintLinks, saveMissions } from '../persisters/missions.js';
import { savePaints } from '../persisters/paints.js';
import { saveOfficialShipGalleries } from '../persisters/ship-galleries.js';
import { updateShipMarketSummaries } from '../persisters/ship-market-summaries.js';
import { saveShips } from '../persisters/ships.js';
import { saveShopsData } from '../persisters/shops.js';
import { saveStarmapAssets } from '../persisters/starmap-assets.js';
import { saveUexMarket } from '../persisters/uex.js';
import {
  applyDimensionsFallback,
  applyHullSeriesCargoFallback,
  crossReferenceShipMatrix,
  crossReferenceStarmapLocations,
  populateChassisId,
  pruneExcludedVariants,
  tagVariantTypes,
} from './crossref.js';
import { captureExtractionSnapshot, cleanStaleGameData, restoreCtmUrls } from './extraction-state.js';
import { LocalizationService } from './localization-service.js';
import { RsiSyncService } from './rsi-sync-service.js';

export type { ExtractionModule, GameEnv };

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
  /** Delay between official RSI ship gallery pages. */
  shipGalleryDelayMs?: number;
  /** Network retries per official RSI ship gallery page. */
  shipGalleryRetries?: number;
  /** Base retry backoff delay for official RSI ship gallery scraping. */
  shipGalleryRetryBaseDelayMs?: number;
  /** When true, re-scrape all systems even if assets already captured. */
  starmapAssetsForce?: boolean;
  /** Number of systems to scrape concurrently for ARK Starmap assets (default: 1). */
  starmapAssetsConcurrency?: number;
  /** Milliseconds to wait for WebGL scene to stream assets per system (default: 6000). */
  starmapAssetsWaitMs?: number;
}

const DEFAULT_OPTIONS: ExtractionOptions = {
  modules: new Set([EXTRACTOR_DEFAULTS.modules]),
  env: EXTRACTOR_DEFAULTS.env,
};

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
  gameInsights: number;
  errors: string[];
  extractionHash?: string;
  durationMs?: number;
}

export class ExtractionService {
  private _extracting = false;
  public locService: LocalizationService;

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
      gameInsights: 0,
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
    // Also refresh when ships are extracted without the ship-matrix module: cross-referencing
    // against a stale matrix silently prunes newly released ships as 'special' variants.
    if ((run('ship-matrix') || run('ship-galleries') || run('ships')) && options.rsiPool) {
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
    // Keepalive: send a harmless SELECT periodically to prevent the server
    // (or an SSH tunnel in front of it) from closing the connection during the
    // CPU-intensive ship-extraction phase (which can run for 15+ minutes without
    // sending any SQL).
    const keepaliveTimer = setInterval(async () => {
      try {
        await conn.query('SELECT 1');
      } catch {
        /* ignore — if the connection is broken we'll find out on the next real query */
      }
    }, EXTRACTOR_DEFAULTS.keepaliveIntervalMs);
    // Shared context for all domain persisters (df is null-asserted — persisters
    // that use it only run for P4K modules, never for ctm-only runs)
    const ctx: PersistContext = { conn, env, df: this.dfService as DataForgeService, loc: this.locService, onProgress };
    try {
      // 1b. Snapshot current data BEFORE cleaning — for changelog comparison
      onProgress?.('Snapshotting current data for changelog…');
      const snapshot = await captureExtractionSnapshot(conn, env);

      // Wrap the entire extraction in a transaction — if anything fails,
      // the old data remains intact (no downtime with empty tables)
      await conn.query('BEGIN');

      // 1c. Clean stale data before fresh extraction (order matters for FK constraints)
      onProgress?.('Cleaning stale data...');
      const savedCtmUrls = await cleanStaleGameData(conn, env, run);
      // 2. Collect & save manufacturers FIRST (before ships, due to FK constraint)
      // Skip for P4K-free modules (e.g. ctm) that don't need DataForge data
      if (this.dfService) {
        onProgress?.('Saving manufacturers…');
        stats.manufacturers = await saveManufacturersFromData(ctx);
      }

      // 3. Extract & save components
      if (run('components')) {
        onProgress?.('Extracting components…');
        stats.components = await saveComponents(ctx);
      }

      // 3b. Extract & save items (FPS weapons, armor, clothing, gadgets)
      if (run('items') || run('commodities')) {
        onProgress?.('Extracting items (FPS, armor, clothing)…');
        const itemResult = await saveItems(ctx);
        stats.items = itemResult.items;
        stats.commodities = itemResult.commodities;
      }

      // 4. Extract & save ships + loadouts
      if (run('ships')) {
        onProgress?.('Extracting ships…');
        const shipResult = await saveShips(ctx);
        stats.ships = shipResult.ships;
        stats.loadoutPorts = shipResult.loadoutPorts;
        // Restore preserved ctm_url values
        const restoredCtmUrls = await restoreCtmUrls(conn, env, savedCtmUrls);
        if (restoredCtmUrls > 0) onProgress?.(`CTM: restored ${restoredCtmUrls} cached URLs`);
      }

      // 5b. Extract & save paints/liveries (always when ships are re-extracted, since CASCADE clears them)
      if (run('paints') || run('ships')) {
        onProgress?.('Extracting paints…');
        await savePaints(ctx);
      }

      // 5c. Extract & save mining data (elements + compositions)
      if (run('mining')) {
        onProgress?.('Extracting mining data…');
        const miningResult = await saveMiningData(ctx);
        stats.miningElements = miningResult.elements;
        stats.miningCompositions = miningResult.compositions;
      }

      // 5d. Extract & save missions (ContractTemplate)
      if (run('missions')) {
        onProgress?.('Extracting missions (ContractTemplate)…');
        stats.missions = await saveMissions(ctx);
      }

      // 5e. Extract & save crafting recipes
      if (run('crafting')) {
        onProgress?.('Extracting crafting recipes…');
        stats.craftingRecipes = await saveCraftingRecipes(ctx);
      }

      // 5f. Link missions → blueprint rewards (ContractGenerator)
      if (run('missions') || run('crafting')) {
        onProgress?.('Linking missions → blueprint rewards (ContractGenerator)…');
        await saveMissionBlueprintLinks(ctx);
      }

      // 5g. Extract & save locations (StarMapObject)
      if (run('locations')) {
        onProgress?.('Extracting locations (StarMapObject)…');
        stats.locations = await saveLocations(ctx);
        onProgress?.('Cross-referencing locations with RSI Starmap…');
        stats.starmapLocationsLinked = await crossReferenceStarmapLocations(conn, env);
      }

      // 5g2. Extract & save shops/vendors (AFTER locations — needs loc_key from locations table)
      if (run('shops')) {
        onProgress?.('Extracting shops & prices…');
        const shopResult = await saveShopsData(ctx);
        stats.shops = shopResult.shops;
      }

      if (run('game-insights')) {
        onProgress?.('Extracting extended game insights…');
        stats.gameInsights = await saveGameInsights(ctx);
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
        // Recompute ship market summaries from existing shop inventory data whenever
        // ships are re-extracted, even when the shops module is not in this run.
        if (!run('shops')) {
          const mkt = await updateShipMarketSummaries({ conn, env });
          onProgress?.(`Market summaries: ${mkt.purchasable} purchasable, ${mkt.rentable} rentable`);
        }
      }

      // 6b. Scrape CTM (3D model) URLs — after cross-reference so ship_matrix_id is populated
      if (run('ctm')) {
        const force = options.ctmForce ?? false;
        const concurrency = options.ctmConcurrency ?? EXTRACTOR_DEFAULTS.ctmConcurrency;
        onProgress?.(`Scraping 3D model URLs (CTM) from RSI… [${force ? 'force-all' : 'incremental'}, concurrency=${concurrency}]`);
        await saveShipCtmModels(conn, env, { force, concurrency }, onProgress);
      }

      // 6b-bis. Sync UEX market (vehicle buy/rent prices + dealer locations).
      // Runs inside the transaction so it shares the snapshot; maps to ships by UUID.
      if (run('uex')) {
        onProgress?.('Syncing UEX vehicle market (buy/rent prices)…');
        try {
          const s = await saveUexMarket(conn, env, onProgress);
          onProgress?.(
            `✅ UEX: ${s.terminals} terminals, ${s.buyPrices} buy + ${s.rentPrices} rent prices, ${s.unmapped} unmapped vehicles`,
          );
        } catch (e) {
          stats.errors.push(`UEX market sync failed: ${(e as Error).message}`);
          onProgress?.(`⚠️ UEX market sync failed: ${(e as Error).message}`);
        }
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
          await generateChangelog(
            conn,
            env,
            extractionId,
            snapshot.oldShips,
            snapshot.oldComps,
            snapshot.oldItems,
            snapshot.oldCommodities,
          );
        } catch (e) {
          logger.warn('Changelog generation failed', { error: String(e) });
        }
      }

      onProgress?.(
        `✅ Extraction complete: ${stats.ships} ships, ${stats.components} components, ${stats.items} items, ${stats.commodities} commodities, ${stats.manufacturers} manufacturers, ${stats.loadoutPorts} loadout ports, ${stats.shops} shops, ${stats.gameInsights} game insights, ${stats.shipMatrixLinked} linked to Ship Matrix, ${stats.starmapLocationsLinked} linked to RSI Starmap, ${stats.miningElements} mining elements, ${stats.miningCompositions} compositions`,
      );

      // ── Sanity check — abort if data dropped by >50% (only for extracted modules) ──
      const oldCounts = { ships: snapshot.oldShipsRaw.length, components: snapshot.oldCompsRaw.length };
      const threshold = EXTRACTOR_DEFAULTS.sanityDropThreshold;
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
    const rsiModules = [...NETWORK_MODULES].filter(
      (moduleName) => moduleName !== 'ctm' && moduleName !== 'ship-galleries' && moduleName !== 'uex',
    );
    const hasRsiModules = rsiModules.some((m) => run(m));

    if (hasRsiModules) {
      if (!options.rsiPool) {
        logger.warn('RSI sync modules requested but no rsiPool provided — skipping');
      } else {
        const rsiSync = new RsiSyncService(options.rsiPool);

        if (run('galactapedia')) {
          onProgress?.('Syncing galactapedia from RSI GraphQL API…');
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

        if (run('rsi-content')) {
          onProgress?.('Enriching comm-link content from RSI (scraping HTML)…');
          try {
            const s = await rsiSync.enrichCommLinksContent({ delayMs: 400 }, onProgress);
            onProgress?.(`✅ Comm-links HTML: enriched=${s.enriched}, skipped=${s.skipped}, errors=${s.errors}`);
            if (s.errors) stats.errors.push(`Comm-links HTML: ${s.errors} errors`);
          } catch (e) {
            stats.errors.push(`Comm-links content enrichment failed: ${(e as Error).message}`);
          }

          onProgress?.('Enriching galactapedia content from RSI (scraping HTML)…');
          try {
            const s = await rsiSync.enrichGalactapediaContent({ delayMs: 400 }, onProgress);
            onProgress?.(`✅ Galactapedia HTML: enriched=${s.enriched}, skipped=${s.skipped}, errors=${s.errors}`);
            if (s.errors) stats.errors.push(`Galactapedia HTML: ${s.errors} errors`);
          } catch (e) {
            stats.errors.push(`Galactapedia content enrichment failed: ${(e as Error).message}`);
          }
        }
      }
    }

    if (run('ship-galleries')) {
      const force = options.ctmForce ?? false;
      const concurrency = options.ctmConcurrency ?? EXTRACTOR_DEFAULTS.ctmConcurrency;
      const interShipDelayMs = options.shipGalleryDelayMs;
      const retries = options.shipGalleryRetries;
      const retryBaseDelayMs = options.shipGalleryRetryBaseDelayMs;
      const galleryPool = options.rsiPool ?? this.pool;
      const galleryConn = await galleryPool.connect();
      try {
        onProgress?.(
          `Scraping official RSI ship galleries… [${force ? 'force-all' : 'incremental'}, concurrency=${concurrency}, delay=${interShipDelayMs ?? 'default'}ms]`,
        );
        await saveOfficialShipGalleries(galleryConn, { force, concurrency, interShipDelayMs, retries, retryBaseDelayMs }, onProgress);
      } catch (e) {
        stats.errors.push(`Ship galleries failed: ${(e as Error).message}`);
        throw e;
      } finally {
        galleryConn.release();
      }
    }

    if (run('starmap-assets')) {
      const aForce = options.starmapAssetsForce ?? false;
      const aConcurrency = options.starmapAssetsConcurrency ?? 1;
      const aWaitMs = options.starmapAssetsWaitMs ?? 6000;
      const aPool = options.rsiPool ?? this.pool;
      const aConn = await aPool.connect();
      try {
        onProgress?.(`Scraping ARK Starmap 3D assets… [${aForce ? 'force-all' : 'incremental'}, concurrency=${aConcurrency}]`);
        await saveStarmapAssets(aConn, env, { force: aForce, concurrency: aConcurrency, waitMs: aWaitMs }, onProgress);
      } catch (e) {
        stats.errors.push(`Starmap assets failed: ${(e as Error).message}`);
      } finally {
        aConn.release();
      }
    }

    return stats;
  }
}
