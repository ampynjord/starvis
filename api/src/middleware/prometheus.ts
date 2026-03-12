import type { NextFunction, Request, Response } from 'express';
import { apiResponseSize, httpRequestCounter, httpRequestDuration } from '../services/prometheus.js';

/**
 * Middleware pour tracer les métriques Prometheus de chaque requête HTTP
 */
export function prometheusMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Normaliser le path pour éviter la cardinalité excessive
  const route = normalizeRoute(req.path);

  // Hook sur la fin de la réponse
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // en secondes
    const statusCode = res.statusCode.toString();

    // Enregistrer la durée de la requête
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      duration,
    );

    // Incrémenter le compteur de requêtes
    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });

    // Taille de la réponse
    const contentLength = res.get('Content-Length');
    if (contentLength) {
      apiResponseSize.observe(
        {
          method: req.method,
          route,
        },
        Number.parseInt(contentLength, 10),
      );
    }
  });

  next();
}

/**
 * Normalise une route pour éviter la cardinalité excessive dans Prometheus
 * Remplace les UUIDs, IDs numériques, etc. par des placeholders
 */
function normalizeRoute(path: string): string {
  return (
    path
      // Remplacer les UUIDs (8-4-4-4-12)
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
      // Remplacer les IDs numériques
      .replace(/\/\d+/g, '/:id')
      // Remplacer les codes (3-4 lettres majuscules)
      .replace(/\/[A-Z]{3,4}(?=\/|$)/g, '/:code')
      // Limiter la longueur du path
      .substring(0, 100)
  );
}
