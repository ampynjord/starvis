/**
 * RSI Website routes — galactapedia, comm-links, starmap
 *
 * Data comes from the rsi_website database (scraped from RSI/SC Wiki).
 */
import type { Router } from 'express';
import { asyncHandler, getQueryNumber, getQueryString, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountRsiWebsiteRoutes(router: Router, deps: RouteDependencies): void {
  const { rsiWebsiteService } = deps;
  if (!rsiWebsiteService) return; // service not initialized (e.g. in tests)

  // ── Galactapedia ────────────────────────────────────────────────────────────

  router.get(
    '/api/v1/galactapedia',
    asyncHandler(async (req, res) => {
      const result = await rsiWebsiteService.getGalactapediaEntries({
        search: getQueryString(req, 'search'),
        category: getQueryString(req, 'category'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
      });
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/galactapedia/:id',
    asyncHandler(async (req, res) => {
      const entry = await rsiWebsiteService.getGalactapediaEntry(req.params.id);
      if (!entry) return void res.status(404).json({ success: false, error: 'Galactapedia entry not found' });
      sendWithETag(req, res, { success: true, data: entry });
    }),
  );

  // ── Comm-links ──────────────────────────────────────────────────────────────

  router.get(
    '/api/v1/comm-links/categories',
    asyncHandler(async (req, res) => {
      const data = await rsiWebsiteService.getCommLinkCategories();
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/comm-links',
    asyncHandler(async (req, res) => {
      const result = await rsiWebsiteService.getCommLinks({
        search: getQueryString(req, 'search'),
        category: getQueryString(req, 'category'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
      });
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/comm-links/:id',
    asyncHandler(async (req, res) => {
      const entry = await rsiWebsiteService.getCommLink(req.params.id);
      if (!entry) return void res.status(404).json({ success: false, error: 'Comm-link not found' });
      sendWithETag(req, res, { success: true, data: entry });
    }),
  );

  // ── Starmap (RSI web version) ───────────────────────────────────────────────

  router.get(
    '/api/v1/starmap/systems',
    asyncHandler(async (req, res) => {
      const result = await rsiWebsiteService.getStarmapSystems({
        search: getQueryString(req, 'search'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
      });
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/starmap/systems/:code',
    asyncHandler(async (req, res) => {
      const system = await rsiWebsiteService.getStarmapSystem(req.params.code);
      if (!system) return void res.status(404).json({ success: false, error: 'System not found' });
      sendWithETag(req, res, { success: true, data: system });
    }),
  );
}
