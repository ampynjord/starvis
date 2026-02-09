/**
 * STARAPI v1 - Routes with pagination, filters, auth, and rate limiting
 */
import { Request, Response, Router } from "express";
import type { Pool } from "mysql2/promise";
import { adminLimiter, authMiddleware, publicLimiter } from "./middleware/index.js";
import type { P4KEnrichmentService, P4KService, ShipService } from "./services.js";
import { getPagination, logger } from "./utils/index.js";

export interface RouteDependencies {
  pool: Pool;
  shipService: ShipService;
  p4kService?: P4KService;
  p4kEnrichmentService?: P4KEnrichmentService;
}

interface ShipFilters {
  manufacturer?: string;
  size?: string;
  status?: string;
  role?: string;
  type?: string;
  min_crew?: string;
  max_crew?: string;
  min_cargo?: string;
  max_cargo?: string;
  min_price?: string;
  max_price?: string;
  search?: string;
  sort?: string;
  order?: string;
}

export function createRoutes(deps: RouteDependencies): Router {
  const router = Router();
  const { pool, shipService, p4kEnrichmentService, p4kService } = deps;

  // =============== API v1 - PUBLIC ENDPOINTS ===============
  
  // Apply rate limiting to all /api/v1 routes
  router.use("/api/v1", publicLimiter);

  // GET /api/v1/ships - List all ships with pagination and filters
  router.get("/api/v1/ships", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const { page, limit, offset } = getPagination(req.query);
      const filters = req.query as ShipFilters;
      
      let ships = await shipService.getAllShips();
      
      // Apply filters
      if (filters.manufacturer) ships = ships.filter(s => s.manufacturer?.toLowerCase().includes(filters.manufacturer!.toLowerCase()));
      if (filters.size) ships = ships.filter(s => s.size?.toLowerCase() === filters.size!.toLowerCase());
      if (filters.status) ships = ships.filter(s => s.productionStatus?.toLowerCase() === filters.status!.toLowerCase());
      if (filters.role) ships = ships.filter(s => s.role?.toLowerCase().includes(filters.role!.toLowerCase()));
      if (filters.search) {
        const q = filters.search.toLowerCase();
        ships = ships.filter(s => 
          s.name.toLowerCase().includes(q) || 
          s.manufacturer?.toLowerCase().includes(q)
        );
      }
      
      // Sort
      const sortField = filters.sort || "name";
      const sortOrder = filters.order?.toLowerCase() === "desc" ? -1 : 1;
      ships.sort((a, b) => {
        const aVal = (a as any)[sortField] || "";
        const bVal = (b as any)[sortField] || "";
        return aVal < bVal ? -sortOrder : sortOrder;
      });
      
      const total = ships.length;
      const paginatedShips = ships.slice(offset, offset + limit);
      
      logger.info(`GET /api/v1/ships - ${total} ships, page ${page}, ${Date.now() - startTime}ms`);
      
      res.json({
        success: true,
        data: paginatedShips,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1
        },
        meta: {
          responseTime: `${Date.now() - startTime}ms`
        }
      });
    } catch (e) {
      logger.error("GET /api/v1/ships error", { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/v1/ships/:id - Get single ship
  router.get("/api/v1/ships/:id", async (req: Request, res: Response) => {
    try {
      const ship = await shipService.getShipById(req.params.id);
      if (!ship) {
        logger.warn(`Ship not found: ${req.params.id}`);
        return res.status(404).json({ success: false, error: "Ship not found" });
      }
      res.json({ success: true, data: ship });
    } catch (e) {
      logger.error(`GET /api/v1/ships/${req.params.id} error`, { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/v1/manufacturers - List all manufacturers
  router.get("/api/v1/manufacturers", async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query(`
        SELECT m.code, m.name, m.description, m.country,
               COUNT(s.uuid) as total_ships,
               SUM(s.is_flight_ready) as flight_ready_count
        FROM manufacturers m
        LEFT JOIN ships s ON m.code = s.manufacturer_code
        GROUP BY m.code, m.name, m.description, m.country
        HAVING total_ships > 0
        ORDER BY m.name
      `);
      res.json({ success: true, count: (rows as any[]).length, data: rows });
    } catch (e) {
      logger.error("GET /api/v1/manufacturers error", { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/v1/manufacturers/:code - Get manufacturer details
  router.get("/api/v1/manufacturers/:code", async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT m.code, m.name, m.description, m.country,
                COUNT(s.uuid) as total_ships,
                SUM(s.is_flight_ready) as flight_ready_count
         FROM manufacturers m
         LEFT JOIN ships s ON m.code = s.manufacturer_code
         WHERE m.code = ?
         GROUP BY m.code, m.name, m.description, m.country`,
        [req.params.code.toUpperCase()]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: "Manufacturer not found" });
      }
      res.json({ success: true, data: rows[0] });
    } catch (e) {
      logger.error(`GET /api/v1/manufacturers/${req.params.code} error`, { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/v1/manufacturers/:code/ships - Get ships by manufacturer
  router.get("/api/v1/manufacturers/:code/ships", async (req: Request, res: Response) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const [rows] = await pool.query<any[]>(
        `SELECT s.uuid, s.name, s.size, s.production_status, s.role, s.thumbnail_url
         FROM ships s WHERE s.manufacturer_code = ? ORDER BY s.name LIMIT ? OFFSET ?`,
        [req.params.code.toUpperCase(), limit, offset]
      );
      const [countRows] = await pool.query<any[]>(
        "SELECT COUNT(*) as total FROM ships WHERE manufacturer_code = ?",
        [req.params.code.toUpperCase()]
      );
      const total = (countRows[0] as any).total;
      
      res.json({
        success: true,
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1
        }
      });
    } catch (e) {
      logger.error(`GET /api/v1/manufacturers/${req.params.code}/ships error`, { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/v1/stats - Global statistics
  router.get("/api/v1/stats", async (req: Request, res: Response) => {
    try {
      // Global stats
      const [globalStats] = await pool.query(`
        SELECT COUNT(*) as total_ships,
               SUM(is_flight_ready) as flight_ready_count,
               SUM(production_status = 'in-concept') as in_concept_count,
               COUNT(DISTINCT manufacturer_code) as manufacturer_count
        FROM ships
      `);
      
      // Manufacturer stats
      const [manufacturerStats] = await pool.query(`
        SELECT m.code, m.name, COUNT(s.uuid) as total_ships, SUM(s.is_flight_ready) as flight_ready_count
        FROM manufacturers m
        JOIN ships s ON m.code = s.manufacturer_code
        GROUP BY m.code, m.name
        HAVING total_ships > 0
        ORDER BY total_ships DESC
      `);
      const [roleStats] = await pool.query(`
        SELECT role, COUNT(*) as count, SUM(is_flight_ready) as flight_ready 
        FROM ships WHERE role IS NOT NULL GROUP BY role ORDER BY count DESC
      `);
      const [sizeStats] = await pool.query(`
        SELECT size, COUNT(*) as count, SUM(is_flight_ready) as flight_ready
        FROM ships WHERE size IS NOT NULL GROUP BY size ORDER BY count DESC
      `);
      
      res.json({
        success: true,
        data: {
          global: (globalStats as any[])[0],
          byManufacturer: manufacturerStats,
          byRole: roleStats,
          bySize: sizeStats
        }
      });
    } catch (e) {
      logger.error("GET /api/v1/stats error", { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/v1/ships/compare - Compare multiple ships
  router.get("/api/v1/ships/compare", async (req: Request, res: Response) => {
    try {
      const uuids = (req.query.uuids as string)?.split(",") || [];
      if (uuids.length === 0 || uuids.length > 10) {
        return res.status(400).json({ 
          success: false, 
          error: "Provide 1-10 ship UUIDs separated by commas (?uuids=uuid1,uuid2,uuid3)" 
        });
      }
      
      const ships = await Promise.all(uuids.map(uuid => shipService.getShipById(uuid.trim())));
      const validShips = ships.filter(s => s !== null);
      
      if (validShips.length === 0) {
        return res.status(404).json({ success: false, error: "No ships found" });
      }
      
      res.json({ success: true, count: validShips.length, data: validShips });
    } catch (e) {
      logger.error("GET /api/v1/ships/compare error", { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // Health check
  router.get("/health", async (req: Request, res: Response) => {
    try {
      const [dbCheck] = await pool.query("SELECT COUNT(*) as ship_count FROM ships");
      const [manufacturerCheck] = await pool.query("SELECT COUNT(*) as manufacturer_count FROM manufacturers");
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          ships: (dbCheck as any[])[0].ship_count,
          manufacturers: (manufacturerCheck as any[])[0].manufacturer_count
        },
        uptime: process.uptime(),
        version: "1.0.0"
      });
    } catch (e) {
      res.status(503).json({
        status: "unhealthy",
        error: (e as Error).message
      });
    }
  });

  // =============== LEGACY API (backward compatibility) ===============
  
  router.get("/api/ships", async (req: Request, res: Response) => {
    try {
      let ships = await shipService.getAllShips();
      const { manufacturer, size, status, type } = req.query;
      if (manufacturer) ships = ships.filter(s => s.manufacturer?.toLowerCase().includes((manufacturer as string).toLowerCase()));
      if (size) ships = ships.filter(s => s.size?.toLowerCase() === (size as string).toLowerCase());
      if (status) ships = ships.filter(s => s.productionStatus?.toLowerCase() === (status as string).toLowerCase());
      if (type) ships = ships.filter(s => (s as any).type?.toLowerCase() === (type as string).toLowerCase());
      res.json(ships);
    } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
  });

  router.get("/api/ships/:id", async (req: Request, res: Response) => {
    try {
      const ship = await shipService.getShipById(req.params.id);
      if (!ship) return res.status(404).json({ success: false, error: "Ship not found" });
      res.json(ship);
    } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
  });

  // =============== ADMIN API (protected with auth & rate limiting) ===============
  
  router.use("/admin", authMiddleware, adminLimiter);

  router.post("/admin/sync", async (req: Request, res: Response) => {
    try {
      logger.info("🔄 Full sync starting...");
      const shipStats = await shipService.syncFromShipMatrix();
      let p4kStats: { status: string } | null = null;
      if (p4kEnrichmentService) {
        try {
          await p4kEnrichmentService.enrichAllShips((m) => logger.info(`[P4K] ${m}`));
          p4kStats = { status: "enriched" };
        } catch (e) { logger.warn("⚠️ P4K skipped:", (e as Error).message); }
      }
      logger.info(`✅ Sync completed: ${shipStats.synced} ships synced`);
      res.json({ success: true, message: "Sync completed", stats: { ships: shipStats, p4k: p4kStats, timestamp: new Date().toISOString() } });
    } catch (e) {
      logger.error("Admin sync error", { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  router.post("/admin/sync/rsi", async (req: Request, res: Response) => {
    try {
      logger.info("🔄 RSI sync starting...");
      const stats = await shipService.syncFromShipMatrix();
      logger.info(`✅ RSI sync completed: ${stats.synced} ships`);
      res.json({ success: true, message: "RSI sync completed", stats: { ...stats, timestamp: new Date().toISOString() } });
    } catch (e) {
      logger.error("Admin RSI sync error", { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  router.post("/admin/sync/p4k", async (req: Request, res: Response) => {
    try {
      if (!p4kEnrichmentService) return res.status(400).json({ success: false, error: "P4K not available" });
      logger.info("🔄 P4K enrichment starting...");
      await p4kEnrichmentService.enrichAllShips((m) => logger.info(`[P4K] ${m}`));
      logger.info("✅ P4K enrichment completed");
      
      res.json({ 
        success: true, 
        message: "P4K sync completed",
        timestamp: new Date().toISOString() 
      });
    } catch (e) {
      logger.error("Admin P4K sync error", { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  router.get("/admin/health", async (req: Request, res: Response) => {
    try {
      const [ships] = await pool.query<any[]>("SELECT COUNT(*) as total, SUM(is_flight_ready) as flight_ready FROM ships");
      const [specs] = await pool.query<any[]>("SELECT COUNT(*) as total FROM ship_specs");
      const [manufacturers] = await pool.query<any[]>("SELECT COUNT(*) as total FROM manufacturers");
      
      res.json({
        success: true,
        data: {
          database: {
            ships: ships[0],
            specs: specs[0],
            manufacturers: manufacturers[0]
          },
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      });
    } catch (e) {
      logger.error("Admin health error", { error: (e as Error).message });
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // DataForge & P4K admin endpoints (unchanged from original)
  router.get("/admin/dataforge/search", async (req: Request, res: Response) => {
    try {
      if (!p4kService) return res.status(400).json({ success: false, error: "P4K not available" });
      const pattern = (req.query.pattern as string) || (req.query.q as string) || "vehicle";
      const limit = parseInt(req.query.limit as string) || 50;
      const records = p4kService.searchRecords(pattern, limit);
      res.json({ success: true, count: records.length, data: records });
    } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
  });

  router.get("/admin/p4k/files", async (req: Request, res: Response) => {
    try {
      if (!p4kService) return res.status(400).json({ success: false, error: "P4K not available" });
      const pattern = (req.query.pattern as string) || "vehicle";
      const limit = parseInt(req.query.limit as string) || 100;
      const files = await p4kService.findFiles(pattern, limit);
      res.json({ success: true, count: files.length, data: files.map(f => ({ name: f.fileName, size: f.uncompressedSize, compressed: f.compressedSize, method: f.compressionMethod })) });
    } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
  });

  return router;
}
