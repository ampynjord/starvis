import { Router, Request, Response } from 'express';
import { ShipService } from '../services/shipService';

export function createShipRouter(shipService: ShipService): Router {
  const router = Router();

  /**
   * GET /api/ships
   * Récupère tous les vaisseaux en cache
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const ships = await shipService.getAllCachedShips();
      res.json({
        success: true,
        count: ships.length,
        data: ships,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/ships/:manufacturer/:slug
   * Récupère un vaisseau spécifique
   * Query params:
   * - refresh: force le re-scraping
   */
  router.get('/:manufacturer/:slug', async (req: Request, res: Response) => {
    try {
      const { manufacturer, slug } = req.params;
      const forceRefresh = req.query.refresh === 'true';

      const result = await shipService.getShipBySlug(manufacturer, slug, forceRefresh);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          cached: !forceRefresh,
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error || 'Ship not found',
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/ships/scrape
   * Scrappe un vaisseau à partir d'une URL
   * Body: { url: string, forceRefresh?: boolean }
   */
  router.post('/scrape', async (req: Request, res: Response) => {
    try {
      const { url, forceRefresh } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required',
        });
      }

      const result = await shipService.getShipByUrl(url, forceRefresh);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to scrape ship',
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/ships/:manufacturer/:slug/cache
   * Supprime le cache d'un vaisseau spécifique
   */
  router.delete('/:manufacturer/:slug/cache', async (req: Request, res: Response) => {
    try {
      const { manufacturer, slug } = req.params;
      await shipService.deleteShipCache(manufacturer, slug);

      res.json({
        success: true,
        message: 'Cache deleted successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/ships/cache
   * Supprime tout le cache
   */
  router.delete('/cache', async (req: Request, res: Response) => {
    try {
      await shipService.clearCache();

      res.json({
        success: true,
        message: 'All cache cleared successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
