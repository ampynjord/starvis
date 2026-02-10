/**
 * STARAPI v1.0 - Routes
 *
 * Public endpoints:
 *   /api/v1/ship-matrix       → RSI Ship Matrix data
 *   /api/v1/ships             → Game data ships (P4K/DataForge)
 *   /api/v1/components        → All DataForge components
 *   /api/v1/manufacturers     → All manufacturers
 *   /api/v1/ships/:uuid/loadout → Default loadout for a ship
 *
 * Admin endpoints (require X-API-Key):
 *   POST /admin/sync-ship-matrix  → Sync from RSI Ship Matrix API
 *   POST /admin/extract-game-data → Extract all P4K/DataForge data
 *   GET  /admin/stats             → Database stats
 */
import { Request, Response, Router } from "express";
import type { Pool } from "mysql2/promise";
import { authMiddleware } from "./middleware/index.js";
import type { GameDataService } from "./services/game-data-service.js";
import type { ShipMatrixService } from "./services/ship-matrix-service.js";
import { logger } from "./utils/index.js";

export interface RouteDependencies {
  pool: Pool;
  shipMatrixService: ShipMatrixService;
  gameDataService?: GameDataService;
}

export function createRoutes(deps: RouteDependencies): Router {
  const router = Router();
  const { pool, shipMatrixService, gameDataService } = deps;

  // =========================================
  //  PUBLIC ENDPOINTS
  // =========================================

  // ---------- SHIP MATRIX (RSI data) ----------

  /** GET /api/v1/ship-matrix/stats */
  router.get("/api/v1/ship-matrix/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await shipMatrixService.getStats();
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** GET /api/v1/ship-matrix - All RSI Ship Matrix entries */
  router.get("/api/v1/ship-matrix", async (req: Request, res: Response) => {
    const t = Date.now();
    try {
      const q = (req.query.search as string) || "";
      const data = q ? await shipMatrixService.search(q) : await shipMatrixService.getAll();

      res.json({
        success: true,
        count: data.length,
        data,
        meta: { source: "RSI Ship Matrix", responseTime: `${Date.now() - t}ms` },
      });
    } catch (e) {
      logger.error("GET /api/v1/ship-matrix error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** GET /api/v1/ship-matrix/:id - Single RSI Ship Matrix entry */
  router.get("/api/v1/ship-matrix/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const ship = Number.isNaN(id)
        ? await shipMatrixService.getByName(req.params.id)
        : await shipMatrixService.getById(id);
      if (!ship) return res.status(404).json({ success: false, error: "Not found" });
      res.json({ success: true, data: ship });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // ---------- SHIPS (game data from P4K/DataForge) ----------

  /** GET /api/v1/ships - All game data ships */
  router.get("/api/v1/ships", async (req: Request, res: Response) => {
    const t = Date.now();
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });

      const filters = {
        manufacturer: req.query.manufacturer as string,
        role: req.query.role as string,
        search: req.query.search as string,
        sort: req.query.sort as string,
        order: req.query.order as string,
      };

      const allShips = await gameDataService.getAllShips(filters);

      // Strip game_data JSON from list view for performance
      const data = allShips.map((s: any) => {
        const { game_data, ...rest } = s;
        return rest;
      });

      res.json({
        success: true,
        count: data.length,
        data,
        meta: { source: "P4K/DataForge", responseTime: `${Date.now() - t}ms` },
      });
    } catch (e) {
      logger.error("GET /api/v1/ships error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** GET /api/v1/ships/:uuid - Single ship (full game_data included) */
  router.get("/api/v1/ships/:uuid", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });

      // Try UUID first, then class_name
      let ship = await gameDataService.getShipByUuid(req.params.uuid);
      if (!ship) ship = await gameDataService.getShipByClassName(req.params.uuid);
      if (!ship) return res.status(404).json({ success: false, error: "Ship not found" });

      // Parse game_data if stored as string
      if (ship.game_data && typeof ship.game_data === "string") {
        try { ship.game_data = JSON.parse(ship.game_data); } catch { /* keep as string */ }
      }

      res.json({ success: true, data: ship });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** GET /api/v1/ships/:uuid/loadout - Default loadout for a ship */
  router.get("/api/v1/ships/:uuid/loadout", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });

      // Resolve UUID from class_name if needed
      let uuid = req.params.uuid;
      if (uuid.length !== 36) {
        const ship = await gameDataService.getShipByClassName(uuid);
        if (!ship) return res.status(404).json({ success: false, error: "Ship not found" });
        uuid = ship.uuid;
      }

      const loadout = await gameDataService.getShipLoadout(uuid);
      if (!loadout.length) return res.status(404).json({ success: false, error: "No loadout found" });

      // Build hierarchical structure
      const rootPorts = loadout.filter((p: any) => !p.parent_id);
      const childMap = new Map<number, any[]>();
      for (const p of loadout) {
        if (p.parent_id) {
          if (!childMap.has(p.parent_id)) childMap.set(p.parent_id, []);
          childMap.get(p.parent_id)!.push(p);
        }
      }
      const hierarchical = rootPorts.map((p: any) => ({
        ...p,
        children: childMap.get(p.id) || [],
      }));

      res.json({ success: true, data: hierarchical });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // ---------- COMPONENTS ----------

  /** GET /api/v1/components - All components */
  router.get("/api/v1/components", async (req: Request, res: Response) => {
    const t = Date.now();
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });

      const filters = {
        type: req.query.type as string,
        size: req.query.size as string,
        manufacturer: req.query.manufacturer as string,
        search: req.query.search as string,
        sort: req.query.sort as string,
        order: req.query.order as string,
      };

      const data = await gameDataService.getAllComponents(filters);

      res.json({
        success: true,
        count: data.length,
        data,
        meta: { source: "P4K/DataForge", responseTime: `${Date.now() - t}ms` },
      });
    } catch (e) {
      logger.error("GET /api/v1/components error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** GET /api/v1/components/:uuid - Single component */
  router.get("/api/v1/components/:uuid", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const comp = await gameDataService.getComponentByUuid(req.params.uuid);
      if (!comp) return res.status(404).json({ success: false, error: "Component not found" });
      res.json({ success: true, data: comp });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // ---------- MANUFACTURERS ----------

  /** GET /api/v1/manufacturers */
  router.get("/api/v1/manufacturers", async (_req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const data = await gameDataService.getAllManufacturers();
      res.json({ success: true, count: data.length, data });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  ADMIN ENDPOINTS (require X-API-Key)
  // =========================================
  router.use("/admin", authMiddleware);

  /** POST /admin/sync-ship-matrix */
  router.post("/admin/sync-ship-matrix", async (_req: Request, res: Response) => {
    try {
      const result = await shipMatrixService.sync();
      res.json({ success: true, data: result });
    } catch (e) {
      logger.error("POST /admin/sync-ship-matrix error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** POST /admin/extract-game-data */
  router.post("/admin/extract-game-data", async (_req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data service not available (no P4K)" });
      const logs: string[] = [];
      const result = await gameDataService.extractAll((msg) => {
        logs.push(msg);
        logger.info(msg, { module: "Admin" });
      });
      res.json({ success: true, data: { ...result, logs } });
    } catch (e) {
      logger.error("POST /admin/extract-game-data error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** GET /admin/stats */
  router.get("/admin/stats", async (_req: Request, res: Response) => {
    try {
      const smStats = await shipMatrixService.getStats();
      const gdStats = gameDataService ? await gameDataService.getStats() : null;
      res.json({
        success: true,
        data: {
          shipMatrix: smStats,
          gameData: gdStats,
        },
      });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  HEALTH
  // =========================================
  router.get("/health", async (_req: Request, res: Response) => {
    try {
      await pool.execute("SELECT 1");
      res.json({
        status: "ok",
        database: "connected",
        gameData: gameDataService ? "available" : "unavailable",
      });
    } catch {
      res.status(503).json({ status: "error", database: "disconnected" });
    }
  });

  return router;
}
