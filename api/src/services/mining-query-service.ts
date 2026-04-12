/**
 * MiningQueryService — Mineral elements and rock compositions from P4K DataForge
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { convertBigIntToNumber, type Row, toPostgres } from './shared.js';

export class MiningQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  // ── Elements ──────────────────────────────────────────────

  async getAllElements(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT e.uuid, e.class_name, e.name, e.commodity_uuid,
              e.instability, e.resistance,
              e.optimal_window_midpoint, e.optimal_window_thinness, e.optimal_window_midpoint_rand,
              e.explosion_multiplier, e.cluster_factor,
              COUNT(DISTINCT mcp.composition_uuid) AS rocks_containing,
              ROUND(AVG(mcp.probability) * 100, 1) AS avg_probability_pct,
              ROUND(AVG(mcp.min_percentage) * 100, 1) AS avg_min_pct,
              ROUND(AVG(mcp.max_percentage) * 100, 1) AS avg_max_pct
       FROM game.mining_elements e
       LEFT JOIN game.mining_composition_parts mcp ON mcp.element_uuid = e.uuid AND mcp.element_env = e.env
       WHERE e.env = ?
       GROUP BY e.uuid, e.class_name, e.name, e.commodity_uuid, e.instability, e.resistance,
                e.optimal_window_midpoint, e.optimal_window_thinness, e.optimal_window_midpoint_rand,
                e.explosion_multiplier, e.cluster_factor
       ORDER BY e.name ASC`),
      env,
    );
    return convertBigIntToNumber(rows);
  }

  async getElementById(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT e.*,
              json_agg(
                json_build_object(
                  'composition_uuid', p.composition_uuid,
                  'deposit_name',     c.deposit_name,
                  'class_name',       c.class_name,
                  'min_percentage',   p.min_percentage,
                  'max_percentage',   p.max_percentage,
                  'probability',      p.probability
                )
              ) FILTER (WHERE p.composition_uuid IS NOT NULL) AS found_in
       FROM game.mining_elements e
       LEFT JOIN game.mining_composition_parts p ON p.element_uuid = e.uuid AND p.element_env = e.env
       LEFT JOIN game.mining_compositions c      ON c.uuid = p.composition_uuid AND c.env = p.composition_env
       WHERE e.env = ? AND e.uuid = ?
       GROUP BY e.uuid`),
      env,
      uuid,
    );
    if (!rows[0]) return null;
    const row = rows[0];
    if (!row.found_in) row.found_in = [];
    return row;
  }

  // ── Compositions ──────────────────────────────────────────

  async getAllCompositions(includeEmpty = false, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const havingClause = includeEmpty ? '' : 'HAVING COUNT(mcp.id) > 0';
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT mc.uuid, mc.class_name, mc.deposit_name, mc.min_distinct_elements,
              COUNT(mcp.id) AS element_count
       FROM game.mining_compositions mc
       LEFT JOIN game.mining_composition_parts mcp ON mcp.composition_uuid = mc.uuid AND mcp.composition_env = mc.env
       WHERE mc.env = ?
       GROUP BY mc.uuid, mc.class_name, mc.deposit_name, mc.min_distinct_elements
       ${havingClause}
       ORDER BY mc.deposit_name ASC`),
      env,
    );
    return convertBigIntToNumber(rows);
  }

  async getCompositionByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT mc.*,
              json_agg(
                json_build_object(
                  'element_uuid',    e.uuid,
                  'element_name',    e.name,
                  'instability',     e.instability,
                  'resistance',      e.resistance,
                  'min_percentage',  mcp.min_percentage,
                  'max_percentage',  mcp.max_percentage,
                  'probability',     mcp.probability
                )
              ) FILTER (WHERE e.uuid IS NOT NULL) AS elements
       FROM game.mining_compositions mc
       LEFT JOIN game.mining_composition_parts mcp ON mcp.composition_uuid = mc.uuid AND mcp.composition_env = mc.env
       LEFT JOIN game.mining_elements e            ON e.uuid = mcp.element_uuid AND e.env = mcp.element_env
       WHERE mc.env = ? AND mc.uuid = ?
       GROUP BY mc.uuid`),
      env,
      uuid,
    );
    if (!rows[0]) return null;
    const row = convertBigIntToNumber(rows[0]);
    if (!row.elements) row.elements = [];
    return row;
  }

  // ── Mining Solver ─────────────────────────────────────────

  async solveForElement(elementUuid: string, opts?: { minProbability?: number; env?: string }): Promise<Row[]> {
    const minProb = opts?.minProbability ?? 0;
    const env = opts?.env ?? 'live';
    const prisma = this.getClient(env);

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT mc.uuid, mc.class_name, mc.deposit_name, mc.min_distinct_elements,
              mcp.min_percentage, mcp.max_percentage, mcp.probability, mcp.curve_exponent,
              e.name   AS element_name,
              e.instability, e.resistance,
              e.optimal_window_midpoint, e.optimal_window_thinness,
              e.explosion_multiplier
       FROM game.mining_composition_parts mcp
       JOIN game.mining_compositions mc ON mc.uuid = mcp.composition_uuid AND mc.env = mcp.composition_env
       JOIN game.mining_elements e      ON e.uuid  = mcp.element_uuid AND e.env = mcp.element_env
       WHERE mcp.composition_env = ? AND mcp.element_uuid = ?
         AND mcp.probability >= ?
       ORDER BY mcp.probability DESC, mcp.max_percentage DESC`),
      env,
      elementUuid,
      minProb,
    );
    return convertBigIntToNumber(rows);
  }

  async solveForComposition(compositionUuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT e.uuid, e.name, e.class_name,
              e.instability, e.resistance,
              e.optimal_window_midpoint, e.optimal_window_thinness,
              e.explosion_multiplier, e.cluster_factor,
              mcp.min_percentage, mcp.max_percentage, mcp.probability
       FROM game.mining_composition_parts mcp
       JOIN game.mining_elements e ON e.uuid = mcp.element_uuid AND e.env = mcp.element_env
       WHERE mcp.composition_env = ? AND mcp.composition_uuid = ?
       ORDER BY mcp.probability DESC, mcp.max_percentage DESC`),
      env,
      compositionUuid,
    );
    return convertBigIntToNumber(rows);
  }

  async getStats(env = 'live'): Promise<{ elements: number; compositions: number; parts: number }> {
    const prisma = this.getClient(env);
    const [r] = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT
         (SELECT COUNT(*) FROM game.mining_elements WHERE env = ?)         AS elements,
         (SELECT COUNT(*) FROM game.mining_compositions WHERE env = ?)     AS compositions,
         (SELECT COUNT(*) FROM game.mining_composition_parts WHERE composition_env = ?) AS parts`),
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
