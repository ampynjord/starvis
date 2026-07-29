/**
 * LootService — ce qui peut tomber, et avec quelle chance.
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';

/**
 * Une table de butin telle que l'API la sert.
 *
 * Extraite depuis longtemps, servie nulle part : 161 tables, 709 entrées et 267
 * archétypes dormaient en base. C'est pourtant la réponse à « qu'est-ce que je
 * peux trouver dans une caisse de zone contestée ».
 */
export interface PublicLootTable {
  uuid: string;
  class_name: string;
  name: string | null;
  p4k_path: string | null;
  entry_count: number;
}

export interface PublicLootEntry {
  entry_index: number;
  archetype_uuid: string | null;
  archetype_name: string | null;
  /**
   * Le poids brut, tel que le jeu le déclare.
   *
   * `chance_pct` en donne la lecture : le poids rapporté au total de la table.
   */
  weight: string | null;
  chance_pct: number | null;
  min_results: number | null;
  max_results: number | null;
  /** Ce que l'archétype produit, en clair : « Any Common Random Knive ». */
  yields: string[];
}

export interface PublicLootTableDetail extends PublicLootTable {
  entries: PublicLootEntry[];
}

/** Les entrées d'un archétype portent leur libellé lisible sous `name`. */
function readYields(primary: unknown, secondary: unknown): string[] {
  const names: string[] = [];
  for (const bucket of [primary, secondary]) {
    if (!Array.isArray(bucket)) continue;
    for (const entry of bucket) {
      const name = (entry as { raw?: { name?: unknown } })?.raw?.name ?? (entry as { name?: unknown })?.name;
      if (typeof name === 'string' && name) names.push(name);
    }
  }
  return [...new Set(names)];
}

export class LootService {
  constructor(private prisma: PrismaClient) {}

  async listTables(
    env = 'live',
    page = 1,
    limit = 50,
  ): Promise<{ data: PublicLootTable[]; total: number; page: number; limit: number; pages: number }> {
    const where = { env };
    const total = await this.prisma.gameLootTable.count({ where });
    const tables = await this.prisma.gameLootTable.findMany({
      where,
      orderBy: [{ className: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Un comptage groupé plutôt qu'une requête par table : cinquante tables
    // feraient cinquante allers-retours pour une seule colonne.
    const counts = await this.prisma.gameLootTableEntry.groupBy({
      by: ['tableUuid'],
      where: { env, tableUuid: { in: tables.map((table) => table.uuid) } },
      _count: { _all: true },
    });
    const countByUuid = new Map(counts.map((row) => [row.tableUuid, row._count._all]));

    return {
      data: tables.map((table) => ({
        uuid: table.uuid,
        class_name: table.className,
        name: table.name,
        p4k_path: table.p4kPath,
        entry_count: countByUuid.get(table.uuid) ?? 0,
      })),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getTable(uuid: string, env = 'live'): Promise<PublicLootTableDetail | null> {
    const table = await this.prisma.gameLootTable.findFirst({ where: { env, uuid } });
    if (!table) return null;

    const entries = await this.prisma.gameLootTableEntry.findMany({
      where: { env, tableUuid: uuid },
      orderBy: [{ entryIndex: 'asc' }],
    });

    const archetypeUuids = entries.map((entry) => entry.archetypeUuid).filter((id): id is string => !!id);
    const archetypes = archetypeUuids.length
      ? await this.prisma.gameLootArchetype.findMany({ where: { env, uuid: { in: archetypeUuids } } })
      : [];
    const byUuid = new Map(archetypes.map((archetype) => [archetype.uuid, archetype]));

    // Le poids seul ne dit rien : c'est sa part du total qui se lit.
    const totalWeight = entries.reduce((sum, entry) => sum + Number(entry.weight ?? 0), 0);

    return {
      uuid: table.uuid,
      class_name: table.className,
      name: table.name,
      p4k_path: table.p4kPath,
      entry_count: entries.length,
      entries: entries.map((entry) => {
        const archetype = entry.archetypeUuid ? byUuid.get(entry.archetypeUuid) : undefined;
        const weight = Number(entry.weight ?? 0);
        return {
          entry_index: entry.entryIndex,
          archetype_uuid: entry.archetypeUuid,
          archetype_name: archetype?.name ?? entry.archetypeClassName,
          weight: entry.weight == null ? null : String(entry.weight),
          chance_pct: totalWeight > 0 ? Math.round((weight / totalWeight) * 1000) / 10 : null,
          min_results: entry.minResults,
          max_results: entry.maxResults,
          yields: archetype ? readYields(archetype.primaryEntries, archetype.secondaryEntries) : [],
        };
      }),
    };
  }
}
