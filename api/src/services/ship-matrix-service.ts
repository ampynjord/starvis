/**
 * ShipMatrixService - Synchronizes RSI Ship Matrix API → ship_matrix table
 *
 * This service ONLY handles external RSI data. No game data here.
 * All 246 ships are stored as-is from the Ship Matrix API.
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '../utils/index.js';
import { buildCacheKey, CACHE_TTL, cacheGet, cacheInvalidatePattern, cacheSet } from './redis.js';

const RSI_SHIP_MATRIX_URL = 'https://robertsspaceindustries.com/ship-matrix/index';

export class ShipMatrixService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Check if a sync is needed (no data or last sync > 24h ago).
   */
  async isSyncNeeded(): Promise<boolean> {
    try {
      const lastShip = await this.prisma.shipMatrix.findFirst({
        orderBy: { syncedAt: 'desc' },
        select: { syncedAt: true },
      });

      if (!lastShip?.syncedAt) return true;

      const hoursSince = (Date.now() - lastShip.syncedAt.getTime()) / (1000 * 60 * 60);
      return hoursSince > 24;
    } catch {
      return true;
    }
  }

  /**
   * Sync all ships from RSI Ship Matrix API into ship_matrix table.
   * Uses INSERT ... ON DUPLICATE KEY UPDATE to be idempotent.
   */
  async sync(): Promise<{ total: number; synced: number; errors: number }> {
    logger.info('[ShipMatrix] Syncing from RSI Ship Matrix...');
    const stats = { total: 0, synced: 0, errors: 0 };

    const res = await fetch(RSI_SHIP_MATRIX_URL, {
      headers: { 'User-Agent': 'StarVis/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`RSI API error: ${res.status}`);

    const body = (await res.json()) as { success: number; data: any[] };
    if (body.success !== 1 || !Array.isArray(body.data)) {
      throw new Error('Invalid RSI Ship Matrix response');
    }

    stats.total = body.data.length;
    logger.info(`[ShipMatrix] Retrieved ${stats.total} ships from RSI`);

    await this.prisma.$transaction(async (tx) => {
      // Batch insert — build multi-row VALUES for better performance
      const BATCH_SIZE = 50;
      for (let i = 0; i < body.data.length; i += BATCH_SIZE) {
        const batch = body.data.slice(i, i + BATCH_SIZE);
        const placeholders: string[] = [];
        const values: any[] = [];

        for (const ship of batch) {
          try {
            const mfg = ship.manufacturer || {};
            const media = ship.media?.[0] || {};
            const images = media.images || {};

            placeholders.push(`(${Array(31).fill('?').join(',')})`);
            values.push(
              ship.id,
              ship.name,
              ship.chassis_id || null,
              mfg.code || null,
              mfg.name || null,
              ship.focus || null,
              ship.type || null,
              ship.description || null,
              ship.production_status || null,
              ship.production_note || null,
              ship.size || null,
              ship.url || null,
              ship.length || null,
              ship.beam || null,
              ship.height || null,
              ship.mass || null,
              ship.cargocapacity || null,
              ship.min_crew || 1,
              ship.max_crew || 1,
              ship.scm_speed || null,
              ship.afterburner_speed || null,
              ship.pitch_max || null,
              ship.yaw_max || null,
              ship.roll_max || null,
              ship.xaxis_acceleration || null,
              ship.yaxis_acceleration || null,
              ship.zaxis_acceleration || null,
              media.source_url || null,
              images.store_small
                ? images.store_small.startsWith('http')
                  ? images.store_small
                  : `https://robertsspaceindustries.com${images.store_small}`
                : null,
              images.store_large
                ? images.store_large.startsWith('http')
                  ? images.store_large
                  : `https://robertsspaceindustries.com${images.store_large}`
                : null,
              ship.compiled ? JSON.stringify(ship.compiled) : null,
            );
            stats.synced++;
          } catch (e: unknown) {
            logger.error(`[ShipMatrix] ❌ ${ship.name}: ${e instanceof Error ? e.message : String(e)}`);
            stats.errors++;
          }
        }

        if (placeholders.length > 0) {
          await tx.$executeRawUnsafe(
            `INSERT INTO ship_matrix (
              id, name, chassis_id,
              manufacturer_code, manufacturer_name,
              focus, type, description, production_status, production_note, size, url,
              length, beam, height, mass, cargocapacity, min_crew, max_crew,
              scm_speed, afterburner_speed, pitch_max, yaw_max, roll_max,
              xaxis_acceleration, yaxis_acceleration, zaxis_acceleration,
              media_source_url, media_store_small, media_store_large,
              compiled
            ) VALUES ${placeholders.join(',')} AS new
            ON DUPLICATE KEY UPDATE
              name=new.name, chassis_id=new.chassis_id,
              manufacturer_code=new.manufacturer_code,
              manufacturer_name=new.manufacturer_name,
              focus=new.focus, type=new.type, description=new.description,
              production_status=new.production_status, production_note=new.production_note,
              size=new.size, url=new.url,
              length=new.length, beam=new.beam, height=new.height,
              mass=new.mass, cargocapacity=new.cargocapacity,
              min_crew=new.min_crew, max_crew=new.max_crew,
              scm_speed=new.scm_speed, afterburner_speed=new.afterburner_speed,
              pitch_max=new.pitch_max, yaw_max=new.yaw_max, roll_max=new.roll_max,
              xaxis_acceleration=new.xaxis_acceleration, yaxis_acceleration=new.yaxis_acceleration,
              zaxis_acceleration=new.zaxis_acceleration,
              media_source_url=new.media_source_url, media_store_small=new.media_store_small,
              media_store_large=new.media_store_large,
              compiled=new.compiled,
              synced_at=CURRENT_TIMESTAMP`,
            ...values,
          );
        }
      }
    });

    logger.info(`[ShipMatrix] ✅ Sync: ${stats.synced}/${stats.total} (${stats.errors} errors)`);

    // Invalider le cache après la synchronisation
    await cacheInvalidatePattern('starvis:ship-matrix:*');

    return stats;
  }

  /** Get all ship_matrix entries */
  async getAll(): Promise<any[]> {
    const cacheKey = buildCacheKey('ship-matrix', 'all');
    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) return cached;

    const ships = await this.prisma.shipMatrix.findMany({
      orderBy: { name: 'asc' },
    });

    await cacheSet(cacheKey, ships, CACHE_TTL.SHIP_MATRIX);
    return ships;
  }

  /** Get a single ship_matrix entry by RSI id */
  async getById(id: number): Promise<any | null> {
    const cacheKey = buildCacheKey('ship-matrix', 'id', id);
    const cached = await cacheGet<any>(cacheKey);
    if (cached) return cached;

    const ship = await this.prisma.shipMatrix.findUnique({
      where: { id },
    });

    if (ship) {
      await cacheSet(cacheKey, ship, CACHE_TTL.SHIP_MATRIX);
    }

    return ship;
  }

  /** Get a single ship_matrix entry by name (collation is case-insensitive) */
  async getByName(name: string): Promise<any | null> {
    const cacheKey = buildCacheKey('ship-matrix', 'name', name);
    const cached = await cacheGet<any>(cacheKey);
    if (cached) return cached;

    const ship = await this.prisma.shipMatrix.findFirst({
      where: { name },
    });

    if (ship) {
      await cacheSet(cacheKey, ship, CACHE_TTL.SHIP_MATRIX);
    }

    return ship;
  }

  /** Search ship_matrix by name or manufacturer */
  async search(q: string): Promise<any[]> {
    const cacheKey = buildCacheKey('ship-matrix', 'search', q);
    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) return cached;

    const ships = await this.prisma.shipMatrix.findMany({
      where: {
        OR: [{ name: { contains: q } }, { manufacturerName: { contains: q } }, { focus: { contains: q } }],
      },
      orderBy: { name: 'asc' },
    });

    await cacheSet(cacheKey, ships, CACHE_TTL.SHIP_MATRIX);
    return ships;
  }

  /** Get stats about the ship_matrix table */
  async getStats(): Promise<any> {
    const cacheKey = buildCacheKey('ship-matrix', 'stats');
    const cached = await cacheGet<any>(cacheKey);
    if (cached) return cached;

    // Keep raw SQL for complex aggregations with conditional SUM
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        COUNT(*) as total,
        SUM(production_status = 'flight-ready') as flight_ready,
        SUM(production_status = 'in-concept') as in_concept,
        SUM(production_status = 'in-production') as in_production,
        COUNT(DISTINCT manufacturer_code) as manufacturers
      FROM ship_matrix
    `);

    const raw = rows[0];
    if (!raw) return null;

    // Convert BigInt to Number for JSON serialization
    const stats = {
      total: Number(raw.total),
      flight_ready: Number(raw.flight_ready),
      in_concept: Number(raw.in_concept),
      in_production: Number(raw.in_production),
      manufacturers: Number(raw.manufacturers),
    };

    await cacheSet(cacheKey, stats, CACHE_TTL.SHIP_MATRIX);
    return stats;
  }
}
