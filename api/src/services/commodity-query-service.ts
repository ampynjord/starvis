/**
 * CommodityQueryService — Tradeable/mineable goods (metals, minerals, gas, food, etc.)
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { type FiltersResult, type PaginatedResult, paginate, stripInternal } from './shared.js';

const COMMODITY_SORT = new Set(['name', 'class_name', 'type', 'sub_type', 'symbol', 'occupancy_scu']);
const COMMODITY_CATEGORY_DEFS: Array<{ label: string; regex: RegExp }> = [
  { label: 'Raw Ore / Minerals', regex: /(raw|ore|mineral|gem)/i },
  { label: 'Refined Materials', regex: /(refined|processed|alloy|ingot)/i },
  { label: 'Fuel / Gas / Fluids', regex: /(fuel|gas|liquid|hydrogen|quantum)/i },
  { label: 'Agriculture / Food', regex: /(agri|agriculture|food|bio|organic)/i },
  { label: 'Medical / Contraband', regex: /(medical|drug|narcotic|contraband)/i },
];

function buildCommodityCategories(rows: { type: string; count: number }[]): { label: string; types: string[]; count: number }[] {
  const used = new Set<string>();
  const categories = COMMODITY_CATEGORY_DEFS.map((def) => {
    const matching = rows.filter((row) => def.regex.test(row.type));
    for (const row of matching) used.add(row.type);
    return {
      label: def.label,
      types: matching.map((row) => row.type),
      count: matching.reduce((sum, row) => sum + row.count, 0),
    };
  }).filter((category) => category.types.length > 0);
  const misc = rows.filter((row) => !used.has(row.type));
  if (misc.length > 0) {
    categories.push({
      label: 'Other Trade Goods',
      types: misc.map((row) => row.type),
      count: misc.reduce((sum, row) => sum + row.count, 0),
    });
  }
  return [{ label: 'All', types: [], count: rows.reduce((sum, row) => sum + row.count, 0) }, ...categories];
}

/**
 * Une marchandise telle que l'API la sert.
 *
 * C'est le contrat, écrit une fois. Les noms sont en `snake_case` parce que
 * c'est ce que les consommateurs reçoivent depuis toujours — pas parce que
 * Prisma ou PostgreSQL l'imposent.
 *
 * `sc_uuid` est ajouté par `stripInternal` sur tout le trafic sortant, d'où son
 * caractère optionnel ici : la sérialisation ne le produit pas elle-même.
 */
export interface PublicCommodity {
  uuid: string;
  env: string;
  class_name: string;
  name: string;
  type: string;
  sub_type: string | null;
  symbol: string | null;
  /** Colonne `numeric`, rendue en chaîne comme le faisait le pilote. */
  occupancy_scu: string | null;
  data_json: unknown;
  created_at: Date;
  updated_at: Date;
  sc_uuid?: string;
}

/**
 * Traduit un enregistrement Prisma vers le contrat public.
 *
 * Prisma rend les champs en `camelCase` — le modèle les déclare ainsi, avec
 * `@map` vers les colonnes. L'API, elle, sert du `snake_case` depuis toujours et
 * est consommée par des tiers. Rendre l'objet Prisma tel quel romprait le
 * contrat sans qu'aucun test unitaire ne le voie : les champs seraient présents,
 * simplement sous d'autres noms.
 *
 * **L'ordre des clés est délibéré.** Il reproduit celui des colonnes de la table,
 * seul ordre dans lequel `SELECT *` les renvoyait. Ce n'est pas de la
 * cosmétique : c'est ce qui permet de comparer les sorties avant et après octet
 * à octet, et donc de prouver que la migration n'a rien changé de visible.
 *
 * `normalized_name` et `canonical_commodity_key` sont volontairement absents :
 * `stripInternal` les retirait déjà, ils ne font pas partie du contrat.
 */
function toPublicCommodity(record: {
  uuid: string;
  env: string;
  className: string;
  name: string;
  type: string;
  subType: string | null;
  symbol: string | null;
  // Le `Decimal` de Prisma, décrit par ce qu'on en attend plutôt que par son
  // type nominal : cette fonction n'a besoin que de sa représentation textuelle.
  occupancyScu: { toString(): string } | null;
  dataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PublicCommodity {
  return {
    uuid: record.uuid,
    env: record.env,
    class_name: record.className,
    name: record.name,
    type: record.type,
    sub_type: record.subType,
    symbol: record.symbol,
    // Le pilote renvoyait cette colonne `numeric` sous forme de chaîne ; Prisma
    // en fait un `Decimal`. Sans cette conversion, la valeur sortirait comme un
    // objet — divergence invisible aujourd'hui, où aucune marchandise n'en porte,
    // et certaine dès la première.
    occupancy_scu: record.occupancyScu === null ? null : record.occupancyScu.toString(),
    data_json: record.dataJson,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class CommodityQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getAllCommodities(filters?: {
    env?: string;
    type?: string;
    types?: string;
    category?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<PublicCommodity>> {
    const env = filters?.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['c.env = ?'];
    const params: (string | number)[] = [env];

    let categoryTypes: string[] = [];
    if (filters?.category && filters.category !== 'All') {
      const categories = await this.getCommodityCategories(env);
      categoryTypes = categories.categories.find((category) => category.label === filters.category)?.types ?? [];
      if (categoryTypes.length === 0) categoryTypes = ['__none__'];
    }

    if (categoryTypes.length > 0) {
      where.push(`c.type IN (${categoryTypes.map(() => '?').join(', ')})`);
      params.push(...categoryTypes);
    } else if (filters?.types) {
      const typeList = filters.types
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (typeList.length === 1) {
        where.push('c.type = ?');
        params.push(typeList[0]);
      } else if (typeList.length > 1) {
        where.push(`c.type IN (${typeList.map(() => '?').join(', ')})`);
        params.push(...typeList);
      }
    } else if (filters?.type) {
      where.push('c.type = ?');
      params.push(filters.type);
    }
    if (filters?.search) {
      where.push('(c.name ILIKE ? OR c.class_name ILIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const baseSql = `SELECT c.* FROM game.commodities c${w}`;
    const countSql = `SELECT COUNT(*) as total FROM game.commodities c${w}`;

    return paginate<PublicCommodity>(prisma, baseSql, countSql, params, filters || {}, COMMODITY_SORT, 'c');
  }

  async getCommodityByUuid(uuid: string, env = 'live'): Promise<PublicCommodity | null> {
    const prisma = this.getClient(env);
    const record = await prisma.commodity.findUnique({ where: { uuid_env: { uuid, env } } });
    return record ? (stripInternal(toPublicCommodity(record)) as PublicCommodity) : null;
  }

  async getCommodityTypes(env = 'live'): Promise<{ types: { type: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const groups = await prisma.commodity.groupBy({
      by: ['type'],
      where: { env },
      _count: { _all: true },
      orderBy: { _count: { type: 'desc' } },
    });
    return { types: groups.map((g) => ({ type: String(g.type), count: Number(g._count._all) })) };
  }

  async getCommodityCategories(env = 'live'): Promise<{ categories: { label: string; types: string[]; count: number }[] }> {
    const typeResult = await this.getCommodityTypes(env);
    return { categories: buildCommodityCategories(typeResult.types.filter((row) => row.type)) };
  }

  async getCommodityFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const groups = await prisma.commodity.groupBy({
      by: ['type'],
      where: { env },
      _count: { _all: true },
      orderBy: { type: 'asc' },
    });
    return {
      filters: {
        type: groups.map((g) => ({ value: String(g.type), label: String(g.type), count: Number(g._count._all) })),
      },
    };
  }
}
