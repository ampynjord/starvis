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
import { convertBigIntToNumber, type Row } from './shared.js';

export class MiningQueryService {
  constructor(private prisma: PrismaClient) {}

  // ── Elements ──────────────────────────────────────────────

  async getAllElements(env = 'live'): Promise<Row[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT e.uuid, e.class_name, e.name, e.commodity_uuid,
              e.instability, e.resistance,
              e.optimal_window_midpoint, e.optimal_window_thinness, e.optimal_window_midpoint_rand,
              e.explosion_multiplier, e.cluster_factor,
              CAST(COUNT(DISTINCT mcp.composition_uuid) AS SIGNED) AS rocks_containing,
              ROUND(AVG(mcp.probability) * 100, 1) AS avg_probability_pct,
              ROUND(AVG(mcp.min_percentage) * 100, 1) AS avg_min_pct,
              ROUND(AVG(mcp.max_percentage) * 100, 1) AS avg_max_pct
       FROM mining_elements e
       LEFT JOIN mining_composition_parts mcp ON mcp.element_uuid = e.uuid AND mcp.game_env = e.game_env
       WHERE e.game_env = ?
       GROUP BY e.uuid, e.class_name, e.name, e.commodity_uuid, e.instability, e.resistance,
                e.optimal_window_midpoint, e.optimal_window_thinness, e.optimal_window_midpoint_rand,
                e.explosion_multiplier, e.cluster_factor
       ORDER BY e.name ASC`,
      env,
    );
    return convertBigIntToNumber(rows);
  }

  async getElementById(uuid: string, env = 'live'): Promise<Row | null> {
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
       LEFT JOIN mining_composition_parts p ON p.element_uuid = e.uuid AND p.game_env = e.game_env
       LEFT JOIN mining_compositions c      ON c.uuid = p.composition_uuid AND c.game_env = p.game_env
       WHERE e.uuid = ? AND e.game_env = ?
       GROUP BY e.uuid`,
      uuid,
      env,
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
      // Filter out null-element entries produced by LEFT JOIN miss on mining_elements
      if (Array.isArray(row.elements)) {
        row.elements = (row.elements as Record<string, unknown>[]).filter(
          (e) => e != null && e.element_uuid != null,
        );
      }
    return row;
  }

  // ── Compositions ──────────────────────────────────────────

  async getAllCompositions(includeEmpty = false, env = 'live'): Promise<Row[]> {
    const havingClause = includeEmpty ? '' : 'HAVING element_count > 0';
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT mc.uuid, mc.class_name, mc.deposit_name, mc.min_distinct_elements,
              CAST(COUNT(mcp.id) AS SIGNED) AS element_count
       FROM mining_compositions mc
       LEFT JOIN mining_composition_parts mcp ON mcp.composition_uuid = mc.uuid AND mcp.game_env = mc.game_env
       WHERE mc.game_env = ?
       GROUP BY mc.uuid, mc.class_name, mc.deposit_name, mc.min_distinct_elements
       ${havingClause}
       ORDER BY mc.deposit_name ASC`,
      env,
    );
    return convertBigIntToNumber(rows);
  }

  async getCompositionByUuid(uuid: string, env = 'live'): Promise<Row | null> {
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
       LEFT JOIN mining_composition_parts mcp ON mcp.composition_uuid = mc.uuid AND mcp.game_env = mc.game_env
       LEFT JOIN mining_elements e            ON e.uuid = mcp.element_uuid AND e.game_env = mcp.game_env
       WHERE mc.uuid = ? AND mc.game_env = ?
       GROUP BY mc.uuid`,
      uuid,
      env,
    );
    if (!rows[0]) return null;
    const row = convertBigIntToNumber(rows[0]);
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
  async solveForElement(elementUuid: string, opts?: { minProbability?: number; env?: string }): Promise<Row[]> {
    const minProb = opts?.minProbability ?? 0;
    const env = opts?.env ?? 'live';

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT mc.uuid, mc.class_name, mc.deposit_name, mc.min_distinct_elements,
              mcp.min_percentage, mcp.max_percentage, mcp.probability, mcp.curve_exponent,
              e.name   AS element_name,
              e.instability, e.resistance,
              e.optimal_window_midpoint, e.optimal_window_thinness,
              e.explosion_multiplier
       FROM mining_composition_parts mcp
       JOIN mining_compositions mc ON mc.uuid = mcp.composition_uuid AND mc.game_env = mcp.game_env
       JOIN mining_elements e      ON e.uuid  = mcp.element_uuid AND e.game_env = mcp.game_env
       WHERE mcp.element_uuid = ?
         AND mcp.probability >= ?
         AND mcp.game_env = ?
       ORDER BY mcp.probability DESC, mcp.max_percentage DESC`,
      elementUuid,
      minProb,
      env,
    );
    return convertBigIntToNumber(rows);
  }

  /**
   * Returns all minerals present in a given rock composition,
   * sorted by probability.
   */
  async solveForComposition(compositionUuid: string, env = 'live'): Promise<Row[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT e.uuid, e.name, e.class_name,
              e.instability, e.resistance,
              e.optimal_window_midpoint, e.optimal_window_thinness,
              e.explosion_multiplier, e.cluster_factor,
              mcp.min_percentage, mcp.max_percentage, mcp.probability
       FROM mining_composition_parts mcp
       JOIN mining_elements e ON e.uuid = mcp.element_uuid AND e.game_env = mcp.game_env
       WHERE mcp.composition_uuid = ? AND mcp.game_env = ?
       ORDER BY mcp.probability DESC, mcp.max_percentage DESC`,
      compositionUuid,
      env,
    );
    return convertBigIntToNumber(rows);
  }

  async getStats(env = 'live'): Promise<{ elements: number; compositions: number; parts: number }> {
    const [r] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         (SELECT COUNT(*) FROM mining_elements WHERE game_env = ?)         AS elements,
         (SELECT COUNT(*) FROM mining_compositions WHERE game_env = ?)     AS compositions,
         (SELECT COUNT(*) FROM mining_composition_parts WHERE game_env = ?) AS parts`,
      env,
      env,
      env,
    );
    return {
      elements: Number(r.elements),
      compositions: Number(r.compositions),
      parts: Number(r.parts),
    };
  }
}
