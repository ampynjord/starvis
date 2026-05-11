import { getPrisma } from '@starvis/db';
import express, { type Request, type Response } from 'express';
import { register } from '../services/prometheus.js';
import { getCacheStats, redis } from '../services/redis.js';
import logger from '../utils/logger.js';

export const healthRouter = express.Router();

/**
 * Health check - Liveness probe (is the service responding?)
 * Used by Kubernetes/Docker to restart the container if necessary
 */
healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Health check - Readiness probe (is the service ready?)
 * Checks that DB and Redis are accessible
 */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    // Check DB connection
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    logger.error('Database health check failed', { error });
  }

  try {
    // Check Redis connection
    await redis.ping();
    checks.redis = true;
  } catch (error) {
    logger.error('Redis health check failed', { error });
  }

  const isReady = checks.database && checks.redis;
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Endpoint for Prometheus metrics
 */
healthRouter.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Error generating metrics', { error });
    res.status(500).end('Error generating metrics');
  }
});

/**
 * Endpoint for cache stats (debug)
 */
healthRouter.get('/cache/stats', (_req: Request, res: Response) => {
  const stats = getCacheStats();
  res.json({
    ...stats,
    connected: redis.status === 'ready',
  });
});
