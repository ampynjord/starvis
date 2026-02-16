/**
 * STARVIS - Zod schemas & pure helpers
 *
 * Extracted to a standalone module so tests can import them
 * without triggering side-effects (DB config, logger, etc.).
 */
import { z } from "zod";

// ── Query param coercers ──────────────────────────────────

/** Coerce Express query param (string | string[] | undefined) → string | undefined */
export const qStr = z.preprocess(v => (Array.isArray(v) ? v[0] : v) || undefined, z.string().optional());

export const qInt = (def: number, max?: number) =>
  z.preprocess(
    v => { const s = Array.isArray(v) ? v[0] : v; return s === undefined || s === "" ? undefined : s; },
    z.coerce.number().int().min(1).pipe(max ? z.number().max(max) : z.number()).catch(def),
  );

// ── Route schemas ─────────────────────────────────────────

export const ShipQuery = z.object({
  manufacturer: qStr, role: qStr, career: qStr, status: qStr,
  vehicle_category: qStr, variant_type: qStr, search: qStr,
  sort: qStr, order: qStr,
  page: qInt(1), limit: qInt(50, 200),
  format: qStr,
}).passthrough();

export const ComponentQuery = z.object({
  type: qStr, sub_type: qStr, size: qStr, grade: qStr,
  manufacturer: qStr, search: qStr,
  sort: qStr, order: qStr,
  page: qInt(1), limit: qInt(50, 200),
  format: qStr,
}).passthrough();

export const ShopQuery = z.object({
  search: qStr, location: qStr, type: qStr,
  page: qInt(1), limit: qInt(20, 100),
  format: qStr,
}).passthrough();

export const ChangelogQuery = z.object({
  limit: qStr, offset: qStr,
  entity_type: qStr, change_type: qStr,
}).passthrough();

export const LoadoutBody = z.object({
  shipUuid: z.string().min(1, "shipUuid is required"),
  swaps: z.array(z.object({
    portName: z.string().min(1, "portName is required"),
    componentUuid: z.string().min(1, "componentUuid is required"),
  })).default([]),
});

export const SearchQuery = z.object({ search: qStr, format: qStr }).passthrough();

export const PaintQuery = z.object({
  search: qStr, ship_uuid: qStr,
  page: qInt(1), limit: qInt(50, 200),
  format: qStr,
}).passthrough();

// ── Pure helpers ──────────────────────────────────────────

export function arrayToCsv(data: Record<string, unknown>[]): string {
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
