/**
 * ShipMatrixService — READ-ONLY access to rsi_website.ship_matrix
 *
 * Data is populated by the extractor (`npx tsx extract.ts --modules ship-matrix`).
 * This service only serves cached reads — no external HTTP calls.
 */
import type { RsiPrismaClient } from '@starvis/db';
import { buildCacheKey, CACHE_TTL, cacheGet, cacheSet } from './redis.js';

export class ShipMatrixService {
  constructor(private prisma: RsiPrismaClient) {}

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
