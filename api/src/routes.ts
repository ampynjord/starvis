/**
 * STARVIS v2.0 - Routes
 *
 * Public (44): ship-matrix(3), ships(12), components(6), manufacturers(4),
 *              paints(1), shops(2), items(4), commodities(3),
 *              loadout(1), changelog(2), stats(1), version(1)
 * Admin (3):   sync(1), stats(1), extraction-log(1)
 * System (1):  health
 *
 * Features: Pagination, ETag caching, CSV export, Zod validation
 */
import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { ZodError } from "zod";
import { authMiddleware } from "./middleware/index.js";
import {
    arrayToCsv, ChangelogQuery, CommodityQuery, ComponentQuery, ItemQuery, LoadoutBody,
    PaintQuery, SearchQuery, ShipQuery, ShopQuery,
} from "./schemas.js";
import type { GameDataService } from "./services/game-data-service.js";
import type { ShipMatrixService } from "./services/ship-matrix-service.js";
import { logger } from "./utils/index.js";

// Re-export schemas so existing consumers are unaffected
export {
    arrayToCsv, ChangelogQuery, CommodityQuery, ComponentQuery, ItemQuery, LoadoutBody,
    PaintQuery, qInt, qStr, SearchQuery, ShipQuery, ShopQuery
} from "./schemas.js";

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
      const isProduction = process.env.NODE_ENV === "production";
      res.status(500).json({ success: false, error: isProduction ? "Internal server error" : err.message });
    });
  };
}

function setETag(res: Response, jsonStr: string): string {
  const hash = createHash("md5").update(jsonStr).digest("hex").slice(0, 16);
  const etag = `"${hash}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return etag;
}

/** Serialize once, check ETag, and send — avoids double JSON.stringify.
 *  ETag is computed without volatile fields (meta.responseTime). */
function sendWithETag(req: Request, res: Response, payload: Record<string, unknown>): void {
  // Compute ETag from stable content only (strip meta.responseTime)
  const { meta, ...stable } = payload;
  const stableStr = JSON.stringify(stable);
  const etag = setETag(res, stableStr);
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
  // Send the full payload (including meta) as JSON
  const fullStr = JSON.stringify(payload);
  res.setHeader("Content-Type", "application/json");
  res.send(fullStr);
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
    sendWithETag(req, res, { success: true, data: stats });
  }));

  router.get("/api/v1/ship-matrix", asyncHandler(async (req, res) => {
    const t = Date.now();
    const { search } = SearchQuery.parse(req.query);
    const data = search ? await shipMatrixService.search(search) : await shipMatrixService.getAll();
    const payload = {
      success: true, count: data.length, data,
      meta: { source: "RSI Ship Matrix", responseTime: `${Date.now() - t}ms` },
    };
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, data as Record<string, unknown>[], payload);
    sendWithETag(req, res, payload);
  }));

  router.get("/api/v1/ship-matrix/:id", asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const ship = Number.isNaN(id) ? await shipMatrixService.getByName(req.params.id) : await shipMatrixService.getById(id);
    if (!ship) return void res.status(404).json({ success: false, error: "Not found" });
    sendWithETag(req, res, { success: true, data: ship });
  }));

  // ── SHIPS ───────────────────────────────────────────────

  router.get("/api/v1/ships", requireGameData, asyncHandler(async (req, res) => {
    const t = Date.now();
    const filters = ShipQuery.parse(req.query);
    const result = await gameDataService!.getAllShips(filters);
    const payload = {
      success: true, count: result.data.length, total: result.total,
      page: result.page, limit: result.limit, pages: result.pages, data: result.data,
      meta: { source: "Game Data", responseTime: `${Date.now() - t}ms` },
    };
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
    sendWithETag(req, res, payload);
  }));

  router.get("/api/v1/ships/filters", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getShipFilters();
    sendWithETag(req, res, { success: true, data });
  }));

  router.get("/api/v1/ships/search", requireGameData, asyncHandler(async (req, res) => {
    const { search } = SearchQuery.parse(req.query);
    if (!search || search.length < 2) return void res.status(400).json({ success: false, error: "Query 'search' must be at least 2 characters" });
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit)) || 10));
    const data = await gameDataService!.searchShipsAutocomplete(search, limit);
    sendWithETag(req, res, { success: true, count: data.length, data });
  }));

  router.get("/api/v1/ships/random", requireGameData, asyncHandler(async (req, res) => {
    const ship = await gameDataService!.getRandomShip();
    if (!ship) return void res.status(404).json({ success: false, error: "No ships available" });
    sendWithETag(req, res, { success: true, data: ship });
  }));

  router.get("/api/v1/ships/manufacturers", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getShipManufacturers();
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
    sendWithETag(req, res, { success: true, count: data.length, data });
  }));

  router.get("/api/v1/ships/:uuid", requireGameData, asyncHandler(async (req, res) => {
    const ship = await resolveShip(req.params.uuid);
    if (!ship) return void res.status(404).json({ success: false, error: "Ship not found" });
    if (ship.game_data && typeof ship.game_data === "string") try { ship.game_data = JSON.parse(ship.game_data as string); } catch { /* keep raw */ }
    sendWithETag(req, res, { success: true, data: ship });
  }));

  router.get("/api/v1/ships/:uuid/loadout", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const loadout = await gameDataService!.getShipLoadout(uuid);
    if (!loadout.length) return void res.status(404).json({ success: false, error: "No loadout found" });
    // Build recursive hierarchical tree (supports turret→gimbal→weapon 3+ levels)
    const rootPorts = loadout.filter((p: Record<string, unknown>) => !p.parent_id);
    const childMap = new Map<number, Record<string, unknown>[]>();
    for (const p of loadout) {
      const parentId = p.parent_id as number | null;
      if (parentId) {
        if (!childMap.has(parentId)) childMap.set(parentId, []);
        childMap.get(parentId)!.push(p);
      }
    }
    function buildTree(node: Record<string, unknown>): Record<string, unknown> {
      const children = childMap.get(node.id as number) || [];
      return { ...node, children: children.map(buildTree) };
    }
    const hierarchical = rootPorts.map(buildTree);
    sendWithETag(req, res, { success: true, data: hierarchical });
  }));

  router.get("/api/v1/ships/:uuid/modules", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const modules = await gameDataService!.getShipModules(uuid);
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, modules as Record<string, unknown>[], { success: true, data: modules });
    sendWithETag(req, res, { success: true, data: modules });
  }));

  router.get("/api/v1/ships/:uuid/paints", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const paints = await gameDataService!.getShipPaints(uuid);
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, paints as Record<string, unknown>[], { success: true, data: paints });
    sendWithETag(req, res, { success: true, data: paints });
  }));

  router.get("/api/v1/ships/:uuid/stats", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const stats = await gameDataService!.getShipStats(uuid);
    if (!stats) return void res.status(404).json({ success: false, error: "Ship not found" });
    sendWithETag(req, res, { success: true, data: stats });
  }));

  router.get("/api/v1/ships/:uuid/hardpoints", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const hardpoints = await gameDataService!.getShipHardpoints(uuid);
    if (!hardpoints) return void res.status(404).json({ success: false, error: "Ship not found" });
    sendWithETag(req, res, { success: true, count: hardpoints.length, data: hardpoints });
  }));

  router.get("/api/v1/ships/:uuid/similar", requireGameData, asyncHandler(async (req, res) => {
    const uuid = await resolveShipUuid(req.params.uuid);
    if (!uuid) return void res.status(404).json({ success: false, error: "Ship not found" });
    const limit = Math.min(10, Math.max(1, parseInt(String(req.query.limit)) || 5));
    const data = await gameDataService!.getSimilarShips(uuid, limit);
    sendWithETag(req, res, { success: true, count: data.length, data });
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
  router.get("/api/v1/components/types", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getComponentTypes();
    sendWithETag(req, res, { success: true, data });
  }));
  router.get("/api/v1/components", requireGameData, asyncHandler(async (req, res) => {
    const t = Date.now();
    const filters = ComponentQuery.parse(req.query);
    const result = await gameDataService!.getAllComponents(filters);
    const payload = {
      success: true, count: result.data.length, total: result.total,
      page: result.page, limit: result.limit, pages: result.pages, data: result.data,
      meta: { source: "Game Data", responseTime: `${Date.now() - t}ms` },
    };
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
    sendWithETag(req, res, payload);
  }));

  router.get("/api/v1/components/filters", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getComponentFilters();
    sendWithETag(req, res, { success: true, data });
  }));

  router.get("/api/v1/components/:uuid", requireGameData, asyncHandler(async (req, res) => {
    const comp = await gameDataService!.resolveComponent(req.params.uuid);
    if (!comp) return void res.status(404).json({ success: false, error: "Component not found" });
    sendWithETag(req, res, { success: true, data: comp });
  }));

  router.get("/api/v1/components/:uuid/buy-locations", requireGameData, asyncHandler(async (req, res) => {
    const comp = await gameDataService!.resolveComponent(req.params.uuid);
    if (!comp) return void res.status(404).json({ success: false, error: "Component not found" });
    const data = await gameDataService!.getComponentBuyLocations(comp.uuid);
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
    sendWithETag(req, res, { success: true, count: data.length, data });
  }));

  router.get("/api/v1/components/:uuid/ships", requireGameData, asyncHandler(async (req, res) => {
    const comp = await gameDataService!.resolveComponent(req.params.uuid);
    if (!comp) return void res.status(404).json({ success: false, error: "Component not found" });
    const data = await gameDataService!.getComponentShips(comp.uuid);
    sendWithETag(req, res, { success: true, count: data.length, data });
  }));

  // ── MANUFACTURERS ───────────────────────────────────────

  router.get("/api/v1/manufacturers", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getAllManufacturers();
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
    sendWithETag(req, res, { success: true, count: data.length, data });
  }));

  router.get("/api/v1/manufacturers/:code", requireGameData, asyncHandler(async (req, res) => {
    const mfr = await gameDataService!.getManufacturerByCode(req.params.code);
    if (!mfr) return void res.status(404).json({ success: false, error: "Manufacturer not found" });
    sendWithETag(req, res, { success: true, data: mfr });
  }));

  router.get("/api/v1/manufacturers/:code/ships", requireGameData, asyncHandler(async (req, res) => {
    const mfr = await gameDataService!.getManufacturerByCode(req.params.code);
    if (!mfr) return void res.status(404).json({ success: false, error: "Manufacturer not found" });
    const data = await gameDataService!.getManufacturerShips(req.params.code);
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
    sendWithETag(req, res, { success: true, count: data.length, data });
  }));

  router.get("/api/v1/manufacturers/:code/components", requireGameData, asyncHandler(async (req, res) => {
    const mfr = await gameDataService!.getManufacturerByCode(req.params.code);
    if (!mfr) return void res.status(404).json({ success: false, error: "Manufacturer not found" });
    const data = await gameDataService!.getManufacturerComponents(req.params.code);
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
    sendWithETag(req, res, { success: true, count: data.length, data });
  }));

  // ── PAINTS ───────────────────────────────────────────────

  router.get("/api/v1/paints", requireGameData, asyncHandler(async (req, res) => {
    const t = Date.now();
    const filters = PaintQuery.parse(req.query);
    const result = await gameDataService!.getAllPaints(filters);
    const payload = {
      success: true, count: result.data.length, total: result.total,
      page: result.page, limit: result.limit, pages: result.pages, data: result.data,
      meta: { source: "Game Data", responseTime: `${Date.now() - t}ms` },
    };
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
    sendWithETag(req, res, payload);
  }));

  // ── SHOPS ───────────────────────────────────────────────

  router.get("/api/v1/shops", requireGameData, asyncHandler(async (req, res) => {
    const filters = ShopQuery.parse(req.query);
    const result = await gameDataService!.getShops(filters);
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], { success: true, ...result });
    sendWithETag(req, res, { success: true, ...result });
  }));

  router.get("/api/v1/shops/:id/inventory", requireGameData, asyncHandler(async (req, res) => {
    const shopId = parseInt(req.params.id);
    if (isNaN(shopId)) return void res.status(400).json({ success: false, error: "Invalid shop ID" });
    const data = await gameDataService!.getShopInventory(shopId);
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
    sendWithETag(req, res, { success: true, count: data.length, data });
  }));

  // ── ITEMS (FPS weapons, armor, clothing, gadgets) ──────

  router.get("/api/v1/items/types", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getItemTypes();
    sendWithETag(req, res, { success: true, ...data });
  }));

  router.get("/api/v1/items/filters", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getItemFilters();
    sendWithETag(req, res, { success: true, data });
  }));

  router.get("/api/v1/items", requireGameData, asyncHandler(async (req, res) => {
    const t = Date.now();
    const filters = ItemQuery.parse(req.query);
    const result = await gameDataService!.getAllItems(filters);
    const payload = {
      success: true, count: result.data.length, total: result.total,
      page: result.page, limit: result.limit, pages: result.pages, data: result.data,
      meta: { source: "Game Data", responseTime: `${Date.now() - t}ms` },
    };
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
    sendWithETag(req, res, payload);
  }));

  router.get("/api/v1/items/:uuid", requireGameData, asyncHandler(async (req, res) => {
    const item = await gameDataService!.resolveItem(req.params.uuid);
    if (!item) return void res.status(404).json({ success: false, error: "Item not found" });
    sendWithETag(req, res, { success: true, data: item });
  }));

  // ── COMMODITIES (tradeable goods) ──────────────────────

  router.get("/api/v1/commodities/types", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getCommodityTypes();
    sendWithETag(req, res, { success: true, ...data });
  }));

  router.get("/api/v1/commodities", requireGameData, asyncHandler(async (req, res) => {
    const t = Date.now();
    const filters = CommodityQuery.parse(req.query);
    const result = await gameDataService!.getAllCommodities(filters);
    const payload = {
      success: true, count: result.data.length, total: result.total,
      page: result.page, limit: result.limit, pages: result.pages, data: result.data,
      meta: { source: "Game Data", responseTime: `${Date.now() - t}ms` },
    };
    if (req.query.format === "csv") return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
    sendWithETag(req, res, payload);
  }));

  router.get("/api/v1/commodities/:uuid", requireGameData, asyncHandler(async (req, res) => {
    const commodity = await gameDataService!.getCommodityByUuid(req.params.uuid);
    if (!commodity) return void res.status(404).json({ success: false, error: "Commodity not found" });
    sendWithETag(req, res, { success: true, data: commodity });
  }));

  // ── UNIFIED SEARCH ──────────────────────────────────────

  router.get("/api/v1/search", requireGameData, asyncHandler(async (req, res) => {
    const { search } = SearchQuery.parse(req.query);
    if (!search || search.length < 2) return void res.status(400).json({ success: false, error: "Query 'search' must be at least 2 characters" });
    const limit = parseInt(String(req.query.limit) || "10");
    const data = await gameDataService!.unifiedSearch(search, limit);
    sendWithETag(req, res, {
      success: true,
      data,
      total: data.ships.length + data.components.length + data.items.length,
    });
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

  router.get("/api/v1/changelog/summary", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getChangelogSummary();
    sendWithETag(req, res, { success: true, data });
  }));

  router.get("/api/v1/changelog", requireGameData, asyncHandler(async (req, res) => {
    const filters = ChangelogQuery.parse(req.query);
    const result = await gameDataService!.getChangelog({
      limit: filters.limit,
      offset: filters.offset,
      entityType: filters.entity_type,
      changeType: filters.change_type,
    });
    sendWithETag(req, res, { success: true, ...result });
  }));

  // ── STATS (public) ──────────────────────────────────────

  router.get("/api/v1/stats/overview", requireGameData, asyncHandler(async (req, res) => {
    const data = await gameDataService!.getPublicStats();
    sendWithETag(req, res, { success: true, data });
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
