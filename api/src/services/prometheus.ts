import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

// Create a Registry to register the metrics
export const register = new Registry();

// Collect default metrics (memory, CPU, etc.)
collectDefaultMetrics({
  register,
  prefix: 'starvis_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// HTTP Request Duration
export const httpRequestDuration = new Histogram({
  name: 'starvis_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// HTTP Request Counter
export const httpRequestCounter = new Counter({
  name: 'starvis_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Cache Hit/Miss Counter
export const cacheCounter = new Counter({
  name: 'starvis_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result'],
  registers: [register],
});

// Cache Hit Rate Gauge
export const cacheHitRateGauge = new Gauge({
  name: 'starvis_cache_hit_rate',
  help: 'Cache hit rate (0-1)',
  registers: [register],
});

// API Response Size
export const apiResponseSize = new Histogram({
  name: 'starvis_api_response_size_bytes',
  help: 'Size of API responses in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
  registers: [register],
});
