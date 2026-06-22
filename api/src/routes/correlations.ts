import type { Router } from 'express';
import { CORRELATION_DOMAINS, type CorrelationSource, isCorrelationDomain } from '../services/correlation-service.js';
import { asyncHandler, getQueryNumber, getQueryString, makeGameDataGuard, sendDataWithETag, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

const CORRELATION_SOURCES = new Set(['rsi', 'p4k', 'uex']);

function getSource(value: string | undefined): CorrelationSource | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return CORRELATION_SOURCES.has(normalized) ? (normalized as CorrelationSource) : undefined;
}

export function mountCorrelationRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/correlations/domains',
    requireGameData,
    asyncHandler(async (_req, res) => {
      res.json({
        success: true,
        data: CORRELATION_DOMAINS,
        meta: {
          sources: ['rsi', 'p4k', 'uex'],
          purpose: 'Canonical source identity domains exposed by Starvis.',
        },
      });
    }),
  );

  router.get(
    '/api/v1/correlations/summary',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const summary = await gameDataService!.correlations.getSummary(env);
      sendDataWithETag(req, res, summary);
    }),
  );

  router.get(
    '/api/v1/correlations/:domain',
    requireGameData,
    asyncHandler(async (req, res) => {
      const domain = req.params.domain.toLowerCase();
      if (!isCorrelationDomain(domain)) {
        return void res.status(400).json({
          success: false,
          error: `Invalid correlation domain. Expected one of: ${CORRELATION_DOMAINS.join(', ')}`,
        });
      }

      const data = await gameDataService!.correlations.getCorrelations({
        domain,
        env: getQueryString(req, 'env') ?? 'live',
        search: getQueryString(req, 'search'),
        source: getSource(getQueryString(req, 'source')),
        limit: getQueryNumber(req, 'limit'),
      });
      sendWithETag(req, res, {
        success: true,
        count: data.length,
        data,
        meta: {
          sources: ['rsi', 'p4k', 'uex'],
          sourcePriority: data[0]?.sourcePriority ?? [],
          compatibility: 'Existing resource IDs remain stable; use sources[] to link canonical Starvis entities to source records.',
        },
      });
    }),
  );
}
