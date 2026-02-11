/**
 * STARVIS v1.0 - Routes
 *
 * Public endpoints:
 *   GET /api/v1/ship-matrix           - RSI Ship Matrix data
 *   GET /api/v1/ships                 - Game data ships (paginated)
 *   GET /api/v1/ships/:uuid           - Single ship with full game_data
 *   GET /api/v1/ships/:uuid/loadout   - Default loadout for a ship
 *   GET /api/v1/ships/:uuid/modules   - Ship modules (Retaliator, Apollo…)
 *   GET /api/v1/ships/:id/compare/:id2 - Compare two ships
 *   GET /api/v1/components            - All DataForge components (paginated)
 *   GET /api/v1/components/:uuid      - Single component
 *   GET /api/v1/components/:uuid/buy-locations - Where to buy a component
 *   GET /api/v1/manufacturers         - All manufacturers
 *   GET /api/v1/ships/filters          - Distinct roles, careers for filter dropdowns
 *   GET /api/v1/ships/manufacturers    - Manufacturers that produce ships (with count)
 *   GET /api/v1/shops                 - All shops/vendors (paginated)
 *   GET /api/v1/shops/:id/inventory   - Shop inventory & prices
 *   POST /api/v1/loadout/calculate    - Loadout simulator (aggregate stats)
 *   GET /api/v1/changelog             - Changelog between extractions
 *   GET /api/v1/version               - Latest extraction version info
 *
 * Admin endpoints (require X-API-Key):
 *   POST /admin/sync-ship-matrix    - Sync from RSI Ship Matrix API
 *   POST /admin/extract-game-data   - Extract all P4K/DataForge data
 *   GET  /admin/stats               - Database stats
 *   GET  /admin/extraction-log      - Extraction history
 *
 * Features: Pagination, ETag caching, CSV export (?format=csv)
 */
import { createHash } from "crypto";
import { Request, Response, Router } from "express";
import type { Pool } from "mysql2/promise";
import { authMiddleware } from "./middleware/index.js";
import type { GameDataService } from "./services/game-data-service.js";
import type { ShipMatrixService } from "./services/ship-matrix-service.js";
import { logger } from "./utils/index.js";

// ============================================================
//  CSV Export Helper
// ============================================================

function arrayToCsv(data: any[]): string {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const lines = [headers.join(",")];
  for (const row of data) {
    lines.push(headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(","));
  }
  return lines.join("\n");
}

function sendCsvOrJson(req: Request, res: Response, data: any[], jsonPayload: any): void {
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=export.csv");
    return void res.send(arrayToCsv(data));
  }
  res.json(jsonPayload);
}

// ============================================================
//  ETag / Cache Helper
// ============================================================

function setETag(res: Response, data: any): string {
  const hash = createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 16);
  const etag = `"${hash}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return etag;
}

function checkNotModified(req: Request, res: Response, etag: string): boolean {
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

// ============================================================
//  Routes factory
// ============================================================

export interface RouteDependencies {
  pool: Pool;
  shipMatrixService: ShipMatrixService;
  gameDataService?: GameDataService;
}

export function createRoutes(deps: RouteDependencies): Router {
  const router = Router();
  const { pool, shipMatrixService, gameDataService } = deps;

  // =========================================
  //  PUBLIC - SHIP MATRIX
  // =========================================

  /** @openapi
   * /api/v1/ship-matrix/stats:
   *   get:
   *     tags: [Ship Matrix]
   *     summary: Ship Matrix statistics
   */
  router.get("/api/v1/ship-matrix/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await shipMatrixService.getStats();
      const etag = setETag(res, stats);
      if (checkNotModified(_req, res, etag)) return;
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/ship-matrix:
   *   get:
   *     tags: [Ship Matrix]
   *     summary: All RSI Ship Matrix entries
   *     parameters:
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *       - in: query
   *         name: format
   *         schema: { type: string, enum: [json, csv] }
   */
  router.get("/api/v1/ship-matrix", async (req: Request, res: Response) => {
    const t = Date.now();
    try {
      const q = (req.query.search as string) || "";
      const data = q ? await shipMatrixService.search(q) : await shipMatrixService.getAll();
      const etag = setETag(res, data);
      if (checkNotModified(req, res, etag)) return;
      const payload = {
        success: true, count: data.length, data,
        meta: { source: "RSI Ship Matrix", responseTime: `${Date.now() - t}ms` },
      };
      sendCsvOrJson(req, res, data, payload);
    } catch (e) {
      logger.error("GET /api/v1/ship-matrix error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/ship-matrix/{id}:
   *   get:
   *     tags: [Ship Matrix]
   *     summary: Single Ship Matrix entry by ID or name
   */
  router.get("/api/v1/ship-matrix/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const ship = Number.isNaN(id)
        ? await shipMatrixService.getByName(req.params.id)
        : await shipMatrixService.getById(id);
      if (!ship) return res.status(404).json({ success: false, error: "Not found" });
      const etag = setETag(res, ship);
      if (checkNotModified(req, res, etag)) return;
      res.json({ success: true, data: ship });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  PUBLIC - SHIPS (P4K / DataForge)
  // =========================================

  /** @openapi
   * /api/v1/ships:
   *   get:
   *     tags: [Ships]
   *     summary: All game data ships (paginated)
   *     parameters:
   *       - { in: query, name: page, schema: { type: integer, default: 1 } }
   *       - { in: query, name: limit, schema: { type: integer, default: 50, maximum: 200 } }
   *       - { in: query, name: manufacturer, schema: { type: string } }
   *       - { in: query, name: role, schema: { type: string } }
   *       - { in: query, name: search, schema: { type: string } }
   *       - { in: query, name: sort, schema: { type: string } }
   *       - { in: query, name: order, schema: { type: string, enum: [asc, desc] } }
   *       - { in: query, name: format, schema: { type: string, enum: [json, csv] } }
   */
  router.get("/api/v1/ships", async (req: Request, res: Response) => {
    const t = Date.now();
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const filters = {
        manufacturer: req.query.manufacturer as string,
        role: req.query.role as string,
        career: req.query.career as string,
        status: req.query.status as string,
        search: req.query.search as string,
        sort: req.query.sort as string,
        order: req.query.order as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };
      const result = await gameDataService.getAllShips(filters);
      // Strip game_data JSON from list view for perf
      const data = result.data.map((s: any) => { const { game_data, ...rest } = s; return rest; });
      const etag = setETag(res, data);
      if (checkNotModified(req, res, etag)) return;
      const payload = {
        success: true, count: data.length, total: result.total,
        page: result.page, limit: result.limit, pages: result.pages, data,
        meta: { source: "P4K/DataForge", responseTime: `${Date.now() - t}ms` },
      };
      sendCsvOrJson(req, res, data, payload);
    } catch (e) {
      logger.error("GET /api/v1/ships error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  PUBLIC - SHIPS FILTERS & SHIP-MANUFACTURERS
  // =========================================

  /** @openapi
   * /api/v1/ships/filters:
   *   get:
   *     tags: [Ships]
   *     summary: Distinct roles, careers and statuses for filter dropdowns
   */
  router.get("/api/v1/ships/filters", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const data = await gameDataService.getShipFilters();
      const etag = setETag(res, data);
      if (checkNotModified(req, res, etag)) return;
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/ships/manufacturers:
   *   get:
   *     tags: [Ships]
   *     summary: Manufacturers that produce ships (with ship count)
   */
  router.get("/api/v1/ships/manufacturers", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const data = await gameDataService.getShipManufacturers();
      const etag = setETag(res, data);
      if (checkNotModified(req, res, etag)) return;
      sendCsvOrJson(req, res, data, { success: true, count: data.length, data });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/ships/{uuid}:
   *   get:
   *     tags: [Ships]
   *     summary: Single ship (full game_data)
   */
  router.get("/api/v1/ships/:uuid", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      let ship = await gameDataService.getShipByUuid(req.params.uuid);
      if (!ship) ship = await gameDataService.getShipByClassName(req.params.uuid);
      if (!ship) return res.status(404).json({ success: false, error: "Ship not found" });
      if (ship.game_data && typeof ship.game_data === "string") {
        try { ship.game_data = JSON.parse(ship.game_data); } catch { /* keep */ }
      }
      const etag = setETag(res, ship);
      if (checkNotModified(req, res, etag)) return;
      res.json({ success: true, data: ship });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/ships/{uuid}/loadout:
   *   get:
   *     tags: [Ships]
   *     summary: Default loadout (hierarchical)
   */
  router.get("/api/v1/ships/:uuid/loadout", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      let uuid = req.params.uuid;
      if (uuid.length !== 36) {
        const ship = await gameDataService.getShipByClassName(uuid);
        if (!ship) return res.status(404).json({ success: false, error: "Ship not found" });
        uuid = ship.uuid;
      }
      const loadout = await gameDataService.getShipLoadout(uuid);
      if (!loadout.length) return res.status(404).json({ success: false, error: "No loadout found" });
      const rootPorts = loadout.filter((p: any) => !p.parent_id);
      const childMap = new Map<number, any[]>();
      for (const p of loadout) {
        if (p.parent_id) {
          if (!childMap.has(p.parent_id)) childMap.set(p.parent_id, []);
          childMap.get(p.parent_id)!.push(p);
        }
      }
      const hierarchical = rootPorts.map((p: any) => ({ ...p, children: childMap.get(p.id) || [] }));
      const etag = setETag(res, hierarchical);
      if (checkNotModified(req, res, etag)) return;
      res.json({ success: true, data: hierarchical });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/ships/{uuid}/modules:
   *   get:
   *     tags: [Ships]
   *     summary: Get modular compartments for a ship (Retaliator, Apollo…)
   */
  router.get("/api/v1/ships/:uuid/modules", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      let uuid = req.params.uuid;
      if (uuid.length !== 36) {
        const ship = await gameDataService.getShipByClassName(uuid);
        if (!ship) return res.status(404).json({ success: false, error: "Ship not found" });
        uuid = ship.uuid;
      }
      const modules = await gameDataService.getShipModules(uuid);
      const etag = setETag(res, modules);
      if (checkNotModified(req, res, etag)) return;
      sendCsvOrJson(req, res, modules, { success: true, data: modules });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/ships/{uuid}/compare/{uuid2}:
   *   get:
   *     tags: [Ships]
   *     summary: Compare two ships side by side
   */
  router.get("/api/v1/ships/:uuid/compare/:uuid2", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const resolve = async (id: string) => {
        let s = await gameDataService!.getShipByUuid(id);
        if (!s) s = await gameDataService!.getShipByClassName(id);
        return s;
      };
      const [ship1, ship2] = await Promise.all([resolve(req.params.uuid), resolve(req.params.uuid2)]);
      if (!ship1) return res.status(404).json({ success: false, error: `Ship '${req.params.uuid}' not found` });
      if (!ship2) return res.status(404).json({ success: false, error: `Ship '${req.params.uuid2}' not found` });
      for (const s of [ship1, ship2]) {
        if (s.game_data && typeof s.game_data === "string") try { s.game_data = JSON.parse(s.game_data); } catch {}
      }
      const numericFields = [
        "mass", "scm_speed", "max_speed", "boost_speed_forward", "boost_speed_backward",
        "pitch_max", "yaw_max", "roll_max", "total_hp", "shield_hp",
        "hydrogen_fuel_capacity", "quantum_fuel_capacity", "crew_size",
        "armor_physical", "armor_energy", "armor_distortion",
        "cross_section_x", "cross_section_y", "cross_section_z", "cargo_capacity",
        "insurance_claim_time", "insurance_expedite_cost",
      ];
      const deltas: Record<string, any> = {};
      for (const f of numericFields) {
        const v1 = parseFloat(ship1[f]) || 0;
        const v2 = parseFloat(ship2[f]) || 0;
        if (v1 !== 0 || v2 !== 0) {
          const diff = v2 - v1;
          const pct = v1 !== 0 ? `${diff >= 0 ? "+" : ""}${((diff / v1) * 100).toFixed(1)}%` : (v2 !== 0 ? "+inf" : "0%");
          deltas[f] = { ship1: v1, ship2: v2, diff: Math.round(diff * 100) / 100, pct };
        }
      }
      res.json({
        success: true,
        data: {
          ship1: { uuid: ship1.uuid, name: ship1.name, class_name: ship1.class_name, manufacturer_code: ship1.manufacturer_code },
          ship2: { uuid: ship2.uuid, name: ship2.name, class_name: ship2.class_name, manufacturer_code: ship2.manufacturer_code },
          comparison: deltas,
          full: { ship1, ship2 },
        },
      });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  PUBLIC - COMPONENTS
  // =========================================

  /** @openapi
   * /api/v1/components:
   *   get:
   *     tags: [Components]
   *     summary: All components (paginated)
   *     parameters:
   *       - { in: query, name: page, schema: { type: integer, default: 1 } }
   *       - { in: query, name: limit, schema: { type: integer, default: 50, maximum: 200 } }
   *       - { in: query, name: type, schema: { type: string } }
   *       - { in: query, name: size, schema: { type: integer } }
   *       - { in: query, name: manufacturer, schema: { type: string } }
   *       - { in: query, name: search, schema: { type: string } }
   *       - { in: query, name: sort, schema: { type: string } }
   *       - { in: query, name: order, schema: { type: string, enum: [asc, desc] } }
   *       - { in: query, name: format, schema: { type: string, enum: [json, csv] } }
   */
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
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };
      const result = await gameDataService.getAllComponents(filters);
      const etag = setETag(res, result.data);
      if (checkNotModified(req, res, etag)) return;
      const payload = {
        success: true, count: result.data.length, total: result.total,
        page: result.page, limit: result.limit, pages: result.pages, data: result.data,
        meta: { source: "P4K/DataForge", responseTime: `${Date.now() - t}ms` },
      };
      sendCsvOrJson(req, res, result.data, payload);
    } catch (e) {
      logger.error("GET /api/v1/components error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/components/{uuid}:
   *   get:
   *     tags: [Components]
   *     summary: Single component by UUID
   */
  router.get("/api/v1/components/:uuid", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const comp = await gameDataService.getComponentByUuid(req.params.uuid);
      if (!comp) return res.status(404).json({ success: false, error: "Component not found" });
      const etag = setETag(res, comp);
      if (checkNotModified(req, res, etag)) return;
      res.json({ success: true, data: comp });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  PUBLIC - MANUFACTURERS
  // =========================================

  /** @openapi
   * /api/v1/manufacturers:
   *   get:
   *     tags: [Manufacturers]
   *     summary: All manufacturers
   */
  router.get("/api/v1/manufacturers", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const data = await gameDataService.getAllManufacturers();
      const etag = setETag(res, data);
      if (checkNotModified(req, res, etag)) return;
      sendCsvOrJson(req, res, data, { success: true, count: data.length, data });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  PUBLIC - SHOPS & PRICES
  // =========================================

  /** @openapi
   * /api/v1/shops:
   *   get:
   *     tags: [Shops]
   *     summary: All shops/vendors (paginated)
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 20 }
   *       - in: query
   *         name: location
   *         schema: { type: string }
   *       - in: query
   *         name: type
   *         schema: { type: string }
   */
  router.get("/api/v1/shops", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const result = await gameDataService.getShops({
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        location: req.query.location as string,
        type: req.query.type as string,
      });
      const etag = setETag(res, result.data);
      if (checkNotModified(req, res, etag)) return;
      sendCsvOrJson(req, res, result.data, { success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/shops/{id}/inventory:
   *   get:
   *     tags: [Shops]
   *     summary: Inventory of a specific shop
   */
  router.get("/api/v1/shops/:id/inventory", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const shopId = parseInt(req.params.id);
      if (isNaN(shopId)) return res.status(400).json({ success: false, error: "Invalid shop ID" });
      const data = await gameDataService.getShopInventory(shopId);
      const etag = setETag(res, data);
      if (checkNotModified(req, res, etag)) return;
      sendCsvOrJson(req, res, data, { success: true, count: data.length, data });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** @openapi
   * /api/v1/components/{uuid}/buy-locations:
   *   get:
   *     tags: [Components]
   *     summary: Where to buy a component (shops & prices)
   */
  router.get("/api/v1/components/:uuid/buy-locations", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      // Resolve class_name to uuid if needed
      let uuid = req.params.uuid;
      if (uuid.length !== 36) {
        const comp = await gameDataService.getComponentByUuid(uuid);
        if (!comp) return res.status(404).json({ success: false, error: "Component not found" });
        uuid = comp.uuid;
      }
      const data = await gameDataService.getComponentBuyLocations(uuid);
      const etag = setETag(res, data);
      if (checkNotModified(req, res, etag)) return;
      sendCsvOrJson(req, res, data, { success: true, count: data.length, data });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  PUBLIC - LOADOUT SIMULATOR
  // =========================================

  /** @openapi
   * /api/v1/loadout/calculate:
   *   post:
   *     tags: [Loadout]
   *     summary: Calculate aggregated stats for a ship loadout with component swaps
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [shipUuid]
   *             properties:
   *               shipUuid: { type: string, description: "Ship UUID" }
   *               swaps:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     portName: { type: string }
   *                     componentUuid: { type: string }
   */
  router.post("/api/v1/loadout/calculate", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const { shipUuid, swaps } = req.body;
      if (!shipUuid) return res.status(400).json({ success: false, error: "shipUuid is required" });
      const result = await gameDataService.calculateLoadout(shipUuid, swaps || []);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  PUBLIC - CHANGELOG
  // =========================================

  /** @openapi
   * /api/v1/changelog:
   *   get:
   *     tags: [Changelog]
   *     summary: Changes between extractions (added/removed/modified entities)
   *     parameters:
   *       - name: entity_type
   *         in: query
   *         schema: { type: string, enum: [ship, component, shop, module] }
   *       - name: change_type
   *         in: query
   *         schema: { type: string, enum: [added, removed, modified] }
   *       - name: limit
   *         in: query
   *         schema: { type: integer, default: 50 }
   *       - name: offset
   *         in: query
   *         schema: { type: integer, default: 0 }
   */
  router.get("/api/v1/changelog", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const result = await gameDataService.getChangelog({
        limit: req.query.limit as string,
        offset: req.query.offset as string,
        entityType: req.query.entity_type as string,
        changeType: req.query.change_type as string,
      });
      const etag = setETag(res, result.data);
      if (checkNotModified(req, res, etag)) return;
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  PUBLIC - VERSION
  // =========================================

  /** @openapi
   * /api/v1/version:
   *   get:
   *     tags: [Version]
   *     summary: Latest extraction version info
   */
  router.get("/api/v1/version", async (_req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const latest = await gameDataService.getLatestExtraction();
      res.json({ success: true, data: latest || { message: "No extraction yet" } });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // =========================================
  //  ADMIN ENDPOINTS (require X-API-Key)
  // =========================================
  router.use("/admin", authMiddleware);

  router.post("/admin/sync-ship-matrix", async (_req: Request, res: Response) => {
    try {
      const result = await shipMatrixService.sync();
      res.json({ success: true, data: result });
    } catch (e) {
      logger.error("POST /admin/sync-ship-matrix error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  router.post("/admin/extract-game-data", async (_req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data service not available (no P4K)" });
      const logs: string[] = [];
      const result = await gameDataService.extractAll((msg) => { logs.push(msg); logger.info(msg, { module: "Admin" }); });
      res.json({ success: true, data: { ...result, logs } });
    } catch (e) {
      logger.error("POST /admin/extract-game-data error", e);
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  router.get("/admin/stats", async (_req: Request, res: Response) => {
    try {
      const smStats = await shipMatrixService.getStats();
      const gdStats = gameDataService ? await gameDataService.getStats() : null;
      res.json({ success: true, data: { shipMatrix: smStats, gameData: gdStats } });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  router.get("/admin/extraction-log", async (_req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
      const log = await gameDataService.getExtractionLog();
      res.json({ success: true, data: log });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  router.get("/admin/debug-vehicle/:className", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ error: "Game data not available" });
      const dfService = (gameDataService as any).dfService;
      if (!dfService) return res.status(503).json({ error: "DataForge not loaded" });
      res.json({ className: req.params.className, vehicleData: dfService.debugVehicleParams(req.params.className), structProps: dfService.debugStructProperties('VehicleComponentParams') });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/admin/debug-component/:className", async (req: Request, res: Response) => {
    try {
      if (!gameDataService) return res.status(503).json({ error: "Game data not available" });
      const dfService = (gameDataService as any).dfService;
      if (!dfService) return res.status(503).json({ error: "DataForge not loaded" });
      res.json(dfService.debugComponent(req.params.className));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // =========================================
  //  HEALTH
  // =========================================
  router.get("/health", async (_req: Request, res: Response) => {
    try {
      await pool.execute("SELECT 1");
      res.json({ status: "ok", database: "connected", gameData: gameDataService ? "available" : "unavailable" });
    } catch {
      res.status(503).json({ status: "error", database: "disconnected" });
    }
  });

  return router;
}
