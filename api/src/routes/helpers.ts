import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { arrayToCsv } from '../schemas.js';
import type { GameDataService } from '../services/game-data-service.js';
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
  const stableStr = JSON.stringify(stable);
  const etag = setETag(res, stableStr);
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  const fullStr = JSON.stringify(payload);
  res.setHeader('Content-Type', 'application/json');
  res.send(fullStr);
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
export function makeShipResolver(gameDataService: GameDataService) {
  return {
    async resolveShipUuid(id: string): Promise<string | null> {
      if (id.length === 36) return id;
      const ship = await gameDataService.getShipByClassName(id);
      return ship?.uuid || null;
    },
    async resolveShip(id: string): Promise<Record<string, unknown> | null> {
      return (await gameDataService.getShipByUuid(id)) || (await gameDataService.getShipByClassName(id));
    },
  };
}
