import { createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { ZodError } from 'zod';
import { arrayToCsv } from '../schemas.js';
import type { GameDataService } from '../services/game-data-service.js';
import type { ShipQueryService } from '../services/ship-query-service.js';
import { logger } from '../utils/index.js';

/** Wrap async route handler — catches errors (including ZodErrors → 400) */
export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, _next: NextFunction) => {
    fn(req, res).catch((e: unknown) => {
      if (e instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: e.issues.map((err) => ({ path: err.path.join('.'), message: err.message })),
        });
      }
      const err = e instanceof Error ? e : new Error(String(e));
      logger.error(`${req.method} ${req.path} error`, err);
      const isProduction = process.env.NODE_ENV === 'production';
      res.status(500).json({ success: false, error: isProduction ? 'Internal server error' : err.message });
    });
  };
}

export function setETag(res: Response, jsonStr: string): string {
  const hash = createHash('md5').update(jsonStr).digest('hex').slice(0, 16);
  const etag = `"${hash}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return etag;
}

/** Serialize once, check ETag, and send — avoids double JSON.stringify.
 *  ETag is computed without volatile fields (meta.responseTime). */
export function sendWithETag(req: Request, res: Response, payload: Record<string, unknown>): void {
  const { meta, ...stable } = payload;
  const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? Number(value) : value);
  const stableStr = JSON.stringify(stable, replacer);
  const etag = setETag(res, stableStr);
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  const fullStr = JSON.stringify(payload, replacer);
  res.setHeader('Content-Type', 'application/json');
  res.send(fullStr);
}

export interface PaginatedData<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/** Send standard paginated payload with ETag and response time metadata. */
export function sendPaginatedWithETag<T>(req: Request, res: Response, result: PaginatedData<T>, startedAtMs: number): void {
  sendWithETag(req, res, {
    success: true,
    count: result.data.length,
    total: result.total,
    page: result.page,
    limit: result.limit,
    pages: result.pages,
    data: result.data,
    meta: { responseTime: `${Date.now() - startedAtMs}ms` },
  });
}

/** Send standard success payload with data and optional count. */
export function sendDataWithETag<T>(req: Request, res: Response, data: T, count?: number): void {
  const payload: Record<string, unknown> = { success: true, data };
  if (count != null) payload.count = count;
  sendWithETag(req, res, payload);
}

export function sendCsvOrJson(req: Request, res: Response, data: Record<string, unknown>[], jsonPayload: unknown): void {
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
    return void res.send(arrayToCsv(data));
  }
  res.json(jsonPayload);
}

/** Factory: returns a middleware that rejects requests when game data is unavailable */
export function makeGameDataGuard(gameDataService: GameDataService | undefined) {
  return function requireGameData(_req: Request, res: Response, next: NextFunction) {
    if (!gameDataService) return res.status(503).json({ success: false, error: 'Game data not available' });
    next();
  };
}

/** Factory: returns helpers for resolving ship identifiers (UUID or class_name) */
export function makeShipResolver(ships: ShipQueryService) {
  return {
    async resolveShipUuid(id: string, env = 'live'): Promise<string | null> {
      if (id.length === 36) return id;
      const ship = await ships.getShipByClassName(id, env);
      return (ship?.uuid as string) || null;
    },
    async resolveShip(id: string, env = 'live'): Promise<Record<string, unknown> | null> {
      return (await ships.getShipByUuid(id, env)) || (await ships.getShipByClassName(id, env));
    },
  };
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

/** Read an optional string query parameter. */
export function getQueryString(req: Request, key: string): string | undefined {
  const raw = firstQueryValue(req.query[key]);
  return raw && raw.trim() !== '' ? raw : undefined;
}

/** Read an optional number query parameter (undefined when missing/invalid). */
export function getQueryNumber(req: Request, key: string): number | undefined {
  const raw = firstQueryValue(req.query[key]);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Mount a GET route that only depends on the optional `env` query parameter
 * and returns `{ success: true, data }` with ETag support.
 */
export function mountEnvDataRoute<T>(
  router: Router,
  path: string,
  requireGameData: RequestHandler,
  fetcher: (env: string) => Promise<T>,
): void {
  router.get(
    path,
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const data = await fetcher(env);
      sendDataWithETag(req, res, data);
    }),
  );
}
