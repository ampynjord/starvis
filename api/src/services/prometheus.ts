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

// Database Query Duration
export const dbQueryDuration = new Histogram({
  name: 'starvis_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

// Database Query Counter
export const dbQueryCounter = new Counter({
  name: 'starvis_db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['query_type', 'table', 'status'],
  registers: [register],
});

// Active Database Connections
export const dbConnectionsGauge = new Gauge({
  name: 'starvis_db_connections_active',
  help: 'Number of active database connections',
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
