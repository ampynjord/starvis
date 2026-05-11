import type { NextFunction, Request, Response } from 'express';
import { apiResponseSize, httpRequestCounter, httpRequestDuration } from '../services/prometheus.js';

/**
 * Middleware to record Prometheus metrics for each HTTP request
 */
export function prometheusMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Normalize the path to avoid excessive cardinality
  const route = normalizeRoute(req.path);

  // Hook on response end
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // in seconds
    const statusCode = res.statusCode.toString();

    // Record request duration
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      duration,
    );

    // Increment request counter
    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });

    // Response size
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
 * Normalizes a route to avoid excessive cardinality in Prometheus.
 * Replaces UUIDs, numeric IDs, etc. with placeholders.
 */
function normalizeRoute(path: string): string {
  return (
    path
      // Replace UUIDs (8-4-4-4-12)
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
      // Replace numeric IDs
      .replace(/\/\d+/g, '/:id')
      // Replace codes (3-4 uppercase letters)
      .replace(/\/[A-Z]{3,4}(?=\/|$)/g, '/:code')
      // Limit path length
      .substring(0, 100)
  );
}
