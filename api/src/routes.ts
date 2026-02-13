/**
 * STARVIS v1.0 - Routes
 *
 * Public (21): ship-matrix(3), ships(8), components(3), manufacturers(1),
 *              shops(2), loadout(1), changelog(1), version(1)
 * Admin (3):   sync(1), stats(1), extraction-log(1)
 * System (1):  health
 *
 * Features: Pagination, ETag caching, CSV export, Zod validation
 */
import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { z, ZodError } from "zod";
import { authMiddleware } from "./middleware/index.js";
import type { GameDataService } from "./services/game-data-service.js";
import type { ShipMatrixService } from "./services/ship-matrix-service.js";
import { logger } from "./utils/index.js";

// ── Zod schemas ───────────────────────────────────────────

/** Coerce Express query param (string | string[] | undefined) → string | undefined */
const qStr = z.preprocess(v => (Array.isArray(v) ? v[0] : v) || undefined, z.string().optional());
const qInt = (def: number, max?: number) =>
  z.preprocess(
    v => { const s = Array.isArray(v) ? v[0] : v; return s === undefined || s === "" ? undefined : s; },
    z.coerce.number().int().min(1).pipe(max ? z.number().max(max) : z.number()).catch(def),
  );

const ShipQuery = z.object({
  manufacturer: qStr, role: qStr, career: qStr, status: qStr,
  vehicle_category: qStr, search: qStr,
  sort: qStr, order: qStr,
  page: qInt(1), limit: qInt(50, 200),
  format: qStr,
}).passthrough();

const ComponentQuery = z.object({
  type: qStr, sub_type: qStr, size: qStr, grade: qStr,
  manufacturer: qStr, search: qStr,
  sort: qStr, order: qStr,
  page: qInt(1), limit: qInt(50, 200),
  format: qStr,
}).passthrough();

const ShopQuery = z.object({
  search: qStr, location: qStr, type: qStr,
  page: qInt(1), limit: qInt(20, 100),
  format: qStr,
}).passthrough();

const ChangelogQuery = z.object({
  limit: qStr, offset: qStr,
  entity_type: qStr, change_type: qStr,
}).passthrough();

const LoadoutBody = z.object({
  shipUuid: z.string().min(1, "shipUuid is required"),
  swaps: z.array(z.object({
    portName: z.string().min(1, "portName is required"),
    componentUuid: z.string().min(1, "componentUuid is required"),
  })).default([]),
});

const SearchQuery = z.object({ search: qStr, format: qStr }).passthrough();

// ── Helpers ───────────────────────────────────────────────

/** Wrap async route handler — catches errors (including ZodErrors → 400) */
function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, _next: NextFunction) => {
    fn(req, res).catch((e: unknown) => {
      if (e instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: e.issues.map(err => ({ path: err.path.join("."), message: err.message })),
        });
      }
      const err = e instanceof Error ? e : new Error(String(e));
      logger.error(`${req.method} ${req.path} error`, err);
      res.status(500).json({ success: false, error: err.message });
    });
  };
}

function setETag(res: Response, data: unknown): string {
  const hash = createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 16);
  const etag = `"${hash}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return etag;
}

/** Returns true if client cache is still valid (304 sent) */
function notModified(req: Request, res: Response, data: unknown): boolean {
  const etag = setETag(res, data);
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return true; }
  return false;
}

function arrayToCsv(data: Record<string, unknown>[]): string {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const lines = [headers.join(",")];
  for (const row of data) {
    lines.push(headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(","));
  }
  return lines.join("\n");
}

function sendCsvOrJson(req: Request, res: Response, data: Record<string, unknown>[], jsonPayload: unknown): void {
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=export.csv");
    return void res.send(arrayToCsv(data));
  }
  res.json(jsonPayload);
}

// ── Routes factory ────────────────────────────────────────

export interface RouteDependencies {
  pool: Pool;
  shipMatrixService: ShipMatrixService;
  gameDataService?: GameDataService;
}

export function createRoutes(deps: RouteDependencies): Router {
  const router = Router();
  const { pool, shipMatrixService, gameDataService } = deps;

  /** Middleware: reject if game data service not available */
  function requireGameData(_req: Request, res: Response, next: NextFunction) {
    if (!gameDataService) return res.status(503).json({ success: false, error: "Game data not available" });
    next();
  }

  /** Resolve UUID or class_name → ship UUID */
  async function resolveShipUuid(id: string): Promise<string | null> {
    if (id.length === 36) return id;
    const ship = await gameDataService!.getShipByClassName(id);
    return ship?.uuid || null;
  }

  /** Resolve UUID or class_name → full ship object */
  async function resolveShip(id: string): Promise<Record<string, unknown> | null> {
    return await gameDataService!.getShipByUuid(id) || await gameDataService!.getShipByClassName(id);
  }

  // ── SHIP MATRIX ─────────────────────────────────────────

  router.get("/api/v1/ship-matrix/stats", asyncHandler(async (req, res) => {
    const stats = await shipMatrixService.getStats();
    if (notModified(req, res, stats)) return;
    res.json({ success: true, data: stats });
  }));

  router.get("/api/v1/ship-matrix", asyncHandler(async (req, res) => {
    const t = Date.now();
    const { search } = SearchQuery.parse(req.query);
    const data = search ? await shipMatrixService.search(search) : await shipMatrixService.getAll();
    if (notModified(req, res, data)) return;
    sendCsvOrJson(req, res, data as Record<string, unknown>[], {
      success: true, count: data.length, data,
      meta: { source: "RSI Ship Matrix", responseTime: `${Date.now() - t}ms` },
    });
  }));

  router.get("/api/v1/ship-matrix/:id", asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const ship = Number.isNaN(id) ? await shipMatrixService.getByName(req.params.id) : await shipMatrixService.getById(id);
    if (!ship) return void res.status(404).json({ success: false, error: "Not found" });
    if (notModified(req, res, ship)) return;
    res.json({ success: true, data: ship });
  }));

  // ── SHIPS ───────────────────────────────────────────────

  router.get("/api/v1/ships", requireGameData, asyncHandler(async (req, res) => {
    const t = Date.now();
    const filters = ShipQuery.parse(req.query);
    const result = await gameDataService!.getAllShips(filters);
    if (notModified(req, res, result.data)) return;
    sendCsvOrJson(req, res, result.data as Record<string, unknown>[], {
      success: true, count: result.data.length, total: result.total,
      page: result.page, limit: result.limit, pages: result.pages, data: result.data,
      meta: { source: "Game Data", responseTime: `${Date.now() - t}ms` },
    });
  }));

  router.get("/api/v1/ships/filters", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getShipFilters();
    if (notModified(req, res, data)) return;
    res.json({ success: true, data });
  }));

  router.get("/api/v1/ships/manufacturers", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getShipManufacturers();
    if (notModified(req, res, data)) return;
    sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
  }));

  router.get("/api/v1/ships/:uuid", requireGameData, asyncHandler(async (req, res) => {
    const ship = await resolveShip(req.params.uuid);
    if (!ship) return void res.status(404).json({ success: false, error: "Ship not found" });
    if (ship.game_data && typeof ship.game_data === "string") try { ship.game_data = JSON.parse(ship.game_data as string); } catch { /* keep raw */ }
    if (notModified(req, res, ship)) return;
    res.json({ success: true, data: ship });
  }));

  router.get("/api/v1/ships/:uuid/loadout", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const loadout = await gameDataService!.getShipLoadout(uuid);
    if (!loadout.length) return void res.status(404).json({ success: false, error: "No loadout found" });
    // Build hierarchical tree
    const rootPorts = loadout.filter((p: Record<string, unknown>) => !p.parent_id);
    const childMap = new Map<number, Record<string, unknown>[]>();
    for (const p of loadout) {
      const parentId = p.parent_id as number | null;
      if (parentId) {
        if (!childMap.has(parentId)) childMap.set(parentId, []);
        childMap.get(parentId)!.push(p);
      }
    }
    const hierarchical = rootPorts.map((p: Record<string, unknown>) => ({ ...p, children: childMap.get(p.id as number) || [] }));
    if (notModified(req, res, hierarchical)) return;
    res.json({ success: true, data: hierarchical });
  }));

  router.get("/api/v1/ships/:uuid/modules", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const modules = await gameDataService!.getShipModules(uuid);
    if (notModified(req, res, modules)) return;
    sendCsvOrJson(req, res, modules as Record<string, unknown>[], { success: true, data: modules });
  }));

  router.get("/api/v1/ships/:uuid/paints", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const paints = await gameDataService!.getShipPaints(uuid);
    if (notModified(req, res, paints)) return;
    sendCsvOrJson(req, res, paints as Record<string, unknown>[], { success: true, data: paints });
  }));

  router.get("/api/v1/ships/:uuid/compare/:uuid2", requireGameData, asyncHandler(async (req, res) => {
    const [ship1, ship2] = await Promise.all([resolveShip(req.params.uuid), resolveShip(req.params.uuid2)]);
    if (!ship1) return void res.status(404).json({ success: false, error: `Ship '${req.params.uuid}' not found` });
    if (!ship2) return void res.status(404).json({ success: false, error: `Ship '${req.params.uuid2}' not found` });
    for (const s of [ship1, ship2]) {
      if (s.game_data && typeof s.game_data === "string") try { s.game_data = JSON.parse(s.game_data as string); } catch { /* keep */ }
    }
    const numericFields = [
      "mass", "scm_speed", "max_speed", "boost_speed_forward", "boost_speed_backward",
      "pitch_max", "yaw_max", "roll_max", "total_hp", "shield_hp",
      "hydrogen_fuel_capacity", "quantum_fuel_capacity", "crew_size",
      "armor_physical", "armor_energy", "armor_distortion",
      "cross_section_x", "cross_section_y", "cross_section_z", "cargo_capacity",
      "missile_damage_total", "weapon_damage_total",
      "insurance_claim_time", "insurance_expedite_cost",
    ];
    const deltas: Record<string, { ship1: number; ship2: number; diff: number; pct: string }> = {};
    for (const f of numericFields) {
      const v1 = parseFloat(String(ship1[f])) || 0, v2 = parseFloat(String(ship2[f])) || 0;
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
        comparison: deltas, full: { ship1, ship2 },
      },
    });
  }));

  // ── COMPONENTS ──────────────────────────────────────────

  router.get("/api/v1/components", requireGameData, asyncHandler(async (req, res) => {
    const t = Date.now();
    const filters = ComponentQuery.parse(req.query);
    const result = await gameDataService!.getAllComponents(filters);
    if (notModified(req, res, result.data)) return;
    sendCsvOrJson(req, res, result.data as Record<string, unknown>[], {
      success: true, count: result.data.length, total: result.total,
      page: result.page, limit: result.limit, pages: result.pages, data: result.data,
      meta: { source: "Game Data", responseTime: `${Date.now() - t}ms` },
    });
  }));

  router.get("/api/v1/components/:uuid", requireGameData, asyncHandler(async (req, res) => {
    const comp = await gameDataService!.getComponentByUuid(req.params.uuid);
    if (!comp) return void res.status(404).json({ success: false, error: "Component not found" });
    if (notModified(req, res, comp)) return;
    res.json({ success: true, data: comp });
  }));

  router.get("/api/v1/components/:uuid/buy-locations", requireGameData, asyncHandler(async (req, res) => {
    let uuid = req.params.uuid;
    if (uuid.length !== 36) {
      const comp = await gameDataService!.getComponentByUuid(uuid);
      if (!comp) return void res.status(404).json({ success: false, error: "Component not found" });
      uuid = comp.uuid;
    }
    const data = await gameDataService!.getComponentBuyLocations(uuid);
    if (notModified(req, res, data)) return;
    sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
  }));

  // ── MANUFACTURERS ───────────────────────────────────────

  router.get("/api/v1/manufacturers", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getAllManufacturers();
    if (notModified(req, res, data)) return;
    sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
  }));

  // ── SHOPS ───────────────────────────────────────────────

  router.get("/api/v1/shops", requireGameData, asyncHandler(async (req, res) => {
    const filters = ShopQuery.parse(req.query);
    const result = await gameDataService!.getShops(filters);
    if (notModified(req, res, result.data)) return;
    sendCsvOrJson(req, res, result.data as Record<string, unknown>[], { success: true, ...result });
  }));

  router.get("/api/v1/shops/:id/inventory", requireGameData, asyncHandler(async (req, res) => {
    const shopId = parseInt(req.params.id);
    if (isNaN(shopId)) return void res.status(400).json({ success: false, error: "Invalid shop ID" });
    const data = await gameDataService!.getShopInventory(shopId);
    if (notModified(req, res, data)) return;
    sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
  }));

  // ── LOADOUT SIMULATOR ──────────────────────────────────

  router.post("/api/v1/loadout/calculate", requireGameData, asyncHandler(async (req, res) => {
    const { shipUuid, swaps } = LoadoutBody.parse(req.body);
    const uuid = await resolveShipUuid(shipUuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const result = await gameDataService!.calculateLoadout(uuid, swaps);
    res.json({ success: true, data: result });
  }));

  // ── CHANGELOG ───────────────────────────────────────────

  router.get("/api/v1/changelog", requireGameData, asyncHandler(async (req, res) => {
    const filters = ChangelogQuery.parse(req.query);
    const result = await gameDataService!.getChangelog({
      limit: filters.limit,
      offset: filters.offset,
      entityType: filters.entity_type,
      changeType: filters.change_type,
    });
    if (notModified(req, res, result.data)) return;
    res.json({ success: true, ...result });
  }));

  // ── VERSION ─────────────────────────────────────────────

  router.get("/api/v1/version", requireGameData, asyncHandler(async (_req, res) => {
    const latest = await gameDataService!.getLatestExtraction();
    res.json({ success: true, data: latest || { message: "No extraction yet" } });
  }));

  // ── ADMIN (require X-API-Key header) ────────────────────

  router.use("/admin", authMiddleware);

  router.post("/admin/sync-ship-matrix", asyncHandler(async (_req, res) => {
    const result = await shipMatrixService.sync();
    res.json({ success: true, data: result });
  }));

  router.get("/admin/stats", asyncHandler(async (_req, res) => {
    const smStats = await shipMatrixService.getStats();
    const gdStats = gameDataService ? await gameDataService.getStats() : null;
    res.json({ success: true, data: { shipMatrix: smStats, gameData: gdStats } });
  }));

  router.get("/admin/extraction-log", requireGameData, asyncHandler(async (_req, res) => {
    const log = await gameDataService!.getExtractionLog();
    res.json({ success: true, data: log });
  }));

  // ── HEALTH ──────────────────────────────────────────────

  router.get("/health", asyncHandler(async (_req, res) => {
    await pool.execute("SELECT 1");
    res.json({ status: "ok", database: "connected", gameData: gameDataService ? "available" : "unavailable" });
  }));

  return router;
}
