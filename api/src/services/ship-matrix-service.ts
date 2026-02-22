/**
 * ShipMatrixService - Synchronizes RSI Ship Matrix API → ship_matrix table
 *
 * This service ONLY handles external RSI data. No game data here.
 * All 246 ships are stored as-is from the Ship Matrix API.
 */
import type { Pool } from 'mysql2/promise';
import { logger } from '../utils/index.js';

const RSI_SHIP_MATRIX_URL = 'https://robertsspaceindustries.com/ship-matrix/index';

export class ShipMatrixService {
  constructor(private pool: Pool) {}

  /**
   * Check if a sync is needed (no data or last sync > 24h ago).
   */
  async isSyncNeeded(): Promise<boolean> {
    try {
      const [rows] = await this.pool.execute<any[]>('SELECT MAX(synced_at) as last_sync FROM ship_matrix');
      if (!rows[0]?.last_sync) return true;
      const lastSync = new Date(rows[0].last_sync).getTime();
      const hoursSince = (Date.now() - lastSync) / (1000 * 60 * 60);
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

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

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

            placeholders.push('(' + Array(34).fill('?').join(',') + ')');
            values.push(
              ship.id,
              ship.name,
              ship.chassis_id || null,
              mfg.id || null,
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
              ship.time_modified || null,
              ship['time_modified.unfiltered'] ? new Date(ship['time_modified.unfiltered']) : null,
            );
            stats.synced++;
          } catch (e: unknown) {
            logger.error(`[ShipMatrix] ❌ ${ship.name}: ${e instanceof Error ? e.message : String(e)}`);
            stats.errors++;
          }
        }

        if (placeholders.length > 0) {
          await conn.execute(
            `INSERT INTO ship_matrix (
              id, name, chassis_id,
              manufacturer_id, manufacturer_code, manufacturer_name,
              focus, type, description, production_status, production_note, size, url,
              length, beam, height, mass, cargocapacity, min_crew, max_crew,
              scm_speed, afterburner_speed, pitch_max, yaw_max, roll_max,
              xaxis_acceleration, yaxis_acceleration, zaxis_acceleration,
              media_source_url, media_store_small, media_store_large,
              compiled, time_modified, time_modified_unfiltered
            ) VALUES ${placeholders.join(',')} AS new
            ON DUPLICATE KEY UPDATE
              name=new.name, chassis_id=new.chassis_id,
              manufacturer_id=new.manufacturer_id, manufacturer_code=new.manufacturer_code,
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
              compiled=new.compiled, time_modified=new.time_modified,
              time_modified_unfiltered=new.time_modified_unfiltered,
              synced_at=CURRENT_TIMESTAMP`,
            values,
          );
        }
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    logger.info(`[ShipMatrix] ✅ Sync: ${stats.synced}/${stats.total} (${stats.errors} errors)`);
    return stats;
  }

  /** Get all ship_matrix entries */
  async getAll(): Promise<any[]> {
    const [rows] = await this.pool.execute('SELECT * FROM ship_matrix ORDER BY name');
    return rows as any[];
  }

  /** Get a single ship_matrix entry by RSI id */
  async getById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>('SELECT * FROM ship_matrix WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /** Get a single ship_matrix entry by name (collation is case-insensitive) */
  async getByName(name: string): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>('SELECT * FROM ship_matrix WHERE name = ?', [name]);
    return rows[0] || null;
  }

  /** Search ship_matrix by name or manufacturer */
  async search(q: string): Promise<any[]> {
    const pattern = `%${q}%`;
    const [rows] = await this.pool.execute(
      `SELECT * FROM ship_matrix 
       WHERE name LIKE ? OR manufacturer_name LIKE ? OR focus LIKE ?
       ORDER BY name`,
      [pattern, pattern, pattern],
    );
    return rows as any[];
  }

  /** Get stats about the ship_matrix table */
  async getStats(): Promise<any> {
    const [rows] = await this.pool.execute<any[]>(`
      SELECT 
        COUNT(*) as total,
        SUM(production_status = 'flight-ready') as flight_ready,
        SUM(production_status = 'in-concept') as in_concept,
        SUM(production_status = 'in-production') as in_production,
        COUNT(DISTINCT manufacturer_code) as manufacturers
      FROM ship_matrix
    `);
    return rows[0];
  }
}
