/**
 * MiningQueryService — Mineral elements and rock compositions from P4K DataForge
 *
 * Endpoints:
 *   GET /api/v1/mining/elements              — all minerals with properties
 *   GET /api/v1/mining/elements/:uuid        — single element + rocks containing it
 *   GET /api/v1/mining/compositions          — all rock types with parts
 *   GET /api/v1/mining/solver?element=uuid   — rocks sorted by probability for a given mineral
 */
import type { PrismaClient } from '@prisma/client';
import type { Row } from './shared.js';

export class MiningQueryService {
  constructor(private prisma: PrismaClient) {}

  // ── Elements ──────────────────────────────────────────────

  async getAllElements(): Promise<Row[]> {
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT uuid, class_name, name, commodity_uuid,
              instability, resistance,
              optimal_window_midpoint, optimal_window_thinness,
              explosion_multiplier, cluster_factor
       FROM mining_elements
       ORDER BY name ASC`,
    );
  }

  async getElementById(uuid: string): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT e.*,
              JSON_ARRAYAGG(
                JSON_OBJECT(
                  'composition_uuid', p.composition_uuid,
                  'deposit_name',     c.deposit_name,
                  'class_name',       c.class_name,
                  'min_percentage',   p.min_percentage,
                  'max_percentage',   p.max_percentage,
                  'probability',      p.probability
                )
              ) AS found_in
       FROM mining_elements e
       LEFT JOIN mining_composition_parts p ON p.element_uuid = e.uuid
       LEFT JOIN mining_compositions c      ON c.uuid = p.composition_uuid
       WHERE e.uuid = ?
       GROUP BY e.uuid`,
      uuid,
    );
    if (!rows[0]) return null;
    const row = rows[0];
    if (typeof row.found_in === 'string') {
      try {
        row.found_in = JSON.parse(row.found_in);
      } catch {
        row.found_in = [];
      }
    }
    return row;
  }

  // ── Compositions ──────────────────────────────────────────

  async getAllCompositions(includeEmpty = false): Promise<Row[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT mc.uuid, mc.class_name, mc.deposit_name, mc.min_distinct_elements,
              COUNT(mcp.id) AS element_count
       FROM mining_compositions mc
       LEFT JOIN mining_composition_parts mcp ON mcp.composition_uuid = mc.uuid
       ${includeEmpty ? '' : 'HAVING element_count > 0'}
       GROUP BY mc.uuid
       ORDER BY mc.deposit_name ASC`,
    );
    return rows;
  }

  async getCompositionByUuid(uuid: string): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT mc.*,
              JSON_ARRAYAGG(
                JSON_OBJECT(
                  'element_uuid',    e.uuid,
                  'element_name',    e.name,
                  'instability',     e.instability,
                  'resistance',      e.resistance,
                  'min_percentage',  mcp.min_percentage,
                  'max_percentage',  mcp.max_percentage,
                  'probability',     mcp.probability
                )
              ) AS elements
       FROM mining_compositions mc
       LEFT JOIN mining_composition_parts mcp ON mcp.composition_uuid = mc.uuid
       LEFT JOIN mining_elements e            ON e.uuid = mcp.element_uuid
       WHERE mc.uuid = ?
       GROUP BY mc.uuid`,
      uuid,
    );
    if (!rows[0]) return null;
    const row = rows[0];
    if (typeof row.elements === 'string') {
      try {
        row.elements = JSON.parse(row.elements);
      } catch {
        row.elements = [];
      }
    }
    return row;
  }

  // ── Mining Solver ─────────────────────────────────────────

  /**
   * For a given mineral element UUID, returns all rock compositions
   * that contain it, sorted by probability descending.
   * Optionally filter by min probability threshold.
   */
  async solveForElement(elementUuid: string, opts?: { minProbability?: number }): Promise<Row[]> {
    const minProb = opts?.minProbability ?? 0;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT mc.uuid, mc.class_name, mc.deposit_name, mc.min_distinct_elements,
              mcp.min_percentage, mcp.max_percentage, mcp.probability, mcp.curve_exponent,
              e.name   AS element_name,
              e.instability, e.resistance,
              e.optimal_window_midpoint, e.optimal_window_thinness,
              e.explosion_multiplier
       FROM mining_composition_parts mcp
       JOIN mining_compositions mc ON mc.uuid = mcp.composition_uuid
       JOIN mining_elements e      ON e.uuid  = mcp.element_uuid
       WHERE mcp.element_uuid = ?
         AND mcp.probability >= ?
       ORDER BY mcp.probability DESC, mcp.max_percentage DESC`,
      elementUuid,
      minProb,
    );
    return rows;
  }

  /**
   * Returns all minerals present in a given rock composition,
   * sorted by probability.
   */
  async solveForComposition(compositionUuid: string): Promise<Row[]> {
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT e.uuid, e.name, e.class_name,
              e.instability, e.resistance,
              e.optimal_window_midpoint, e.optimal_window_thinness,
              e.explosion_multiplier, e.cluster_factor,
              mcp.min_percentage, mcp.max_percentage, mcp.probability
       FROM mining_composition_parts mcp
       JOIN mining_elements e ON e.uuid = mcp.element_uuid
       WHERE mcp.composition_uuid = ?
       ORDER BY mcp.probability DESC, mcp.max_percentage DESC`,
      compositionUuid,
    );
  }

  async getStats(): Promise<{ elements: number; compositions: number; parts: number }> {
    const [r] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         (SELECT COUNT(*) FROM mining_elements)         AS elements,
         (SELECT COUNT(*) FROM mining_compositions)     AS compositions,
         (SELECT COUNT(*) FROM mining_composition_parts) AS parts`,
    );
    return {
      elements: Number(r.elements),
      compositions: Number(r.compositions),
      parts: Number(r.parts),
    };
  }
}
