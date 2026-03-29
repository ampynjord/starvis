import express, { type Request, type Response } from 'express';
import { getPrisma } from '../db/index.js';
import { register } from '../services/prometheus.js';
import { getCacheStats, redis } from '../services/redis.js';
import logger from '../utils/logger.js';

export const healthRouter = express.Router();

/**
 * Health check - Liveness probe (est-ce que le service répond ?)
 * Utilisé par Kubernetes/Docker pour redémarrer le container si nécessaire
 */
healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Health check - Readiness probe (est-ce que le service est prêt ?)
 * Vérifie que la DB et Redis sont accessibles
 */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    // Vérifier la connexion DB
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    logger.error('Database health check failed', { error });
  }

  try {
    // Vérifier la connexion Redis
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
 * Endpoint pour les métriques Prometheus
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
 * Endpoint pour les stats du cache (debug)
 */
healthRouter.get('/cache/stats', (_req: Request, res: Response) => {
  const stats = getCacheStats();
  res.json({
    ...stats,
    connected: redis.status === 'ready',
  });
});
