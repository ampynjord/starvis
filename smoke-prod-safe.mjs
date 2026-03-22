const DEFAULT_BASE = 'https://starvis-api.ampynjord.bzh';

const config = {
  baseUrl: process.env.SMOKE_BASE_URL || DEFAULT_BASE,
  paceMs: Number(process.env.SMOKE_PACE_MS || 1200),
  maxRetries: Number(process.env.SMOKE_MAX_RETRIES || 4),
  backoffBaseMs: Number(process.env.SMOKE_BACKOFF_BASE_MS || 1500),
  timeoutMs: Number(process.env.SMOKE_TIMEOUT_MS || 12000),
};

const endpoints = [
  '/health/ready',
  '/api/v1/search?search=gladius&limit=3',
  '/api/v1/ships?limit=3',
  '/api/v1/components?limit=3',
  '/api/v1/components/filters',
  '/api/v1/components/types',
  '/api/v1/items?limit=3',
  '/api/v1/items/filters',
  '/api/v1/items/types',
  '/api/v1/commodities?limit=3',
  '/api/v1/commodities/types',
  '/api/v1/paints?limit=3',
  '/api/v1/changelog?limit=5',
  '/api/v1/changelog/summary',
  '/api/v1/mining/stats',
  '/api/v1/missions?limit=5',
  '/api/v1/missions/types',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response) {
  const header = response.headers.get('retry-after');
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(header);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

async function fetchWithRetry(url) {
  let attempt = 0;

  while (attempt <= config.maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'starvis-safe-smoke/1.0' },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const body = await response.text();
        return {
          ok: true,
          status: response.status,
          bodyLength: body.length,
          attempt,
        };
      }

      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text();

      if (!retryable || attempt === config.maxRetries) {
        return {
          ok: false,
          status: response.status,
          bodyLength: body.length,
          attempt,
        };
      }

      const retryAfterMs = parseRetryAfterMs(response);
      const backoffMs = retryAfterMs ?? config.backoffBaseMs * (attempt + 1);
      await sleep(backoffMs);
      attempt += 1;
      continue;
    } catch (error) {
      clearTimeout(timeout);

      if (attempt === config.maxRetries) {
        return {
          ok: false,
          status: 0,
          bodyLength: 0,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      await sleep(config.backoffBaseMs * (attempt + 1));
      attempt += 1;
    }
  }

  return {
    ok: false,
    status: 0,
    bodyLength: 0,
    attempt: config.maxRetries,
    error: 'Unexpected retry loop exit',
  };
}

async function run() {
  console.log('Safe smoke test starting');
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Endpoints: ${endpoints.length}`);
  console.log(`Pace: ${config.paceMs}ms, retries: ${config.maxRetries}`);

  const results = [];

  for (const endpoint of endpoints) {
    const url = `${config.baseUrl}${endpoint}`;
    const result = await fetchWithRetry(url);
    results.push({ endpoint, ...result });

    const label = result.ok ? 'OK ' : 'KO ';
    const attemptInfo = result.attempt > 0 ? ` retries=${result.attempt}` : '';
    const errInfo = result.error ? ` err=${result.error}` : '';
    console.log(`${label} status=${result.status} bytes=${result.bodyLength}${attemptInfo} ${endpoint}${errInfo}`);

    await sleep(config.paceMs);
  }

  const ok = results.filter((r) => r.ok).length;
  const ko = results.length - ok;
  const failed = results.filter((r) => !r.ok);

  console.log('');
  console.log(`Summary: total=${results.length} ok=${ok} ko=${ko}`);

  if (failed.length > 0) {
    console.log('Failed endpoints:');
    for (const f of failed) {
      const suffix = f.error ? ` error=${f.error}` : '';
      console.log(`- ${f.endpoint} status=${f.status}${suffix}`);
    }
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
}

run().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
