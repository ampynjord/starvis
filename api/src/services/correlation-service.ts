import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaLike as PrismaClient } from '@starvis/db';
import { convertBigIntToNumber, type Row, toPostgres } from './shared.js';

export const CORRELATION_DOMAINS = ['system', 'location', 'shop', 'ship', 'commodity', 'item', 'component'] as const;

export type CorrelationDomain = (typeof CORRELATION_DOMAINS)[number];
export type CorrelationSource = 'rsi' | 'p4k' | 'uex';

export interface CorrelationSourceLink {
  source: CorrelationSource;
  sourceTable: string;
  sourceId: string | null;
  sourceUuid: string | null;
  sourceName: string | null;
  matchMethod: string;
  matchScore: number;
  isPrimary: boolean;
  metadata: Record<string, unknown>;
}

export interface CanonicalCorrelation {
  id: string;
  env: string;
  domain: CorrelationDomain;
  key: string;
  name: string;
  primarySource: CorrelationSource;
  confidence: 'single_source' | 'correlated';
  sourcePriority: CorrelationSource[];
  sources: CorrelationSourceLink[];
}

export interface CanonicalRecord {
  id: string;
  env: string;
  domain: string;
  key: string;
  name: string;
  /** Nullable au schema : une entite peut n'avoir aucune source prioritaire. */
  primary_source: string | null;
  confidence: string;
  updated_at: string;
  sources: {
    source: string;
    source_table: string;
    source_id: string | null;
    source_uuid: string | null;
    source_name: string | null;
    match_method: string;
    match_score: number;
    is_primary: boolean;
  }[];
}

export interface CorrelationQuery {
  domain: CorrelationDomain;
  env?: string;
  search?: string;
  source?: CorrelationSource;
  limit?: number;
}

const DOMAIN_SET = new Set<string>(CORRELATION_DOMAINS);

const SOURCE_PRIORITY: Record<CorrelationDomain, CorrelationSource[]> = {
  system: ['rsi', 'p4k', 'uex'],
  location: ['rsi', 'p4k', 'uex'],
  shop: ['p4k', 'uex', 'rsi'],
  ship: ['p4k', 'rsi', 'uex'],
  commodity: ['p4k', 'uex', 'rsi'],
  item: ['p4k', 'uex', 'rsi'],
  component: ['p4k', 'uex', 'rsi'],
};

export function isCorrelationDomain(domain: string): domain is CorrelationDomain {
  return DOMAIN_SET.has(domain);
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+System$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+System$/i, '');
}

function sourceRank(domain: CorrelationDomain, source: CorrelationSource): number {
  const rank = SOURCE_PRIORITY[domain].indexOf(source);
  return rank === -1 ? 99 : rank;
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value as Record<string, unknown>;
  return {};
}

function rowLink(row: Row, isPrimary: boolean): CorrelationSourceLink {
  return {
    source: row.source as CorrelationSource,
    sourceTable: String(row.source_table),
    sourceId: row.source_id == null ? null : String(row.source_id),
    sourceUuid: row.source_uuid == null ? null : String(row.source_uuid),
    sourceName: row.source_name == null ? null : String(row.source_name),
    matchMethod: String(row.match_method ?? 'computed'),
    matchScore: Number(row.match_score ?? 0),
    isPrimary,
    metadata: parseMetadata(row.metadata),
  };
}

export class CorrelationService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  /**
   * Tous les groupes d'un domaine, sans filtre ni plafond.
   *
   * `getCorrelations` en sert une tranche filtrée ; la persistance a besoin de
   * l'ensemble. Les séparer évite qu'un plafond d'affichage se glisse dans ce
   * qu'on écrit — il s'y était déjà glissé dans le résumé, qui comptait 500
   * composants sur 3 275.
   */
  private async computeGroups(domain: CorrelationDomain, env: string): Promise<CanonicalCorrelation[]> {
    const query: CorrelationQuery = { domain, env };
    return this.groupsFor(query, env);
  }

  async getCorrelations(query: CorrelationQuery): Promise<CanonicalCorrelation[]> {
    const env = query.env ?? 'live';
    const groups = await this.groupsFor(query, env);
    return groups.sort((a, b) => a.name.localeCompare(b.name)).slice(0, Math.min(Math.max(query.limit ?? 200, 1), 500));
  }

  private async groupsFor(query: CorrelationQuery, env: string): Promise<CanonicalCorrelation[]> {
    const prisma = this.getClient(env);
    const rows = convertBigIntToNumber(
      await prisma.$queryRawUnsafe<Row[]>(toPostgres(sqlForDomain(query.domain)), ...paramsForDomain(query.domain, env)),
    );
    const grouped = new Map<string, Row[]>();

    for (const row of rows) {
      const baseKey = String(row.source_group_key || row.source_uuid || row.source_id || row.source_name || '');
      const key = normalizeKey(baseKey) || normalizeKey(row.source_name);
      if (!key) continue;
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    const search = query.search ? normalizeKey(query.search) : null;
    const source = query.source;
    const result: CanonicalCorrelation[] = [];
    for (const [key, group] of grouped) {
      if (source && !group.some((row) => row.source === source)) continue;
      if (search && !group.some((row) => normalizeKey(row.source_name).includes(search) || key.includes(search))) continue;

      const ordered = [...group].sort((a, b) => {
        const sourceDiff =
          sourceRank(query.domain, a.source as CorrelationSource) - sourceRank(query.domain, b.source as CorrelationSource);
        if (sourceDiff !== 0) return sourceDiff;
        return Number(b.match_score ?? 0) - Number(a.match_score ?? 0);
      });
      const primary = ordered[0];
      const primarySource = primary.source as CorrelationSource;
      const primaryName = normalizeName(primary.source_name) || key;
      result.push({
        id: `${query.domain}:${key}`,
        env,
        domain: query.domain,
        key,
        name: primaryName,
        primarySource,
        confidence: new Set(group.map((row) => row.source)).size > 1 ? 'correlated' : 'single_source',
        sourcePriority: SOURCE_PRIORITY[query.domain],
        sources: ordered.map((row) => rowLink(row, row === primary)),
      });
    }

    return result;
  }

  /**
   * Fige l'identite calculee dans `canonical_entities` et ses liens.
   *
   * La correspondance etait recalculee a chaque requete et n'existait nulle
   * part : deux appels pouvaient rendre deux identifiants differents pour la
   * meme entite, et rien d'autre ne pouvait s'y rattacher. Les tables existaient
   * depuis une migration de juin et portaient zero ligne.
   *
   * Le remplacement est complet par domaine : une entite disparue du jeu doit
   * disparaitre d'ici, ce qu'un upsert seul ne ferait pas. Le tout dans une
   * transaction — un domaine a moitie reecrit serait pire que pas reecrit.
   */
  async persistCanonicalEntities(env = 'live'): Promise<Record<string, { entities: number; links: number; duplicates: number }>> {
    const prisma = this.getClient(env);
    const report: Record<string, { entities: number; links: number; duplicates: number }> = {};

    for (const domain of CORRELATION_DOMAINS) {
      const groups = await this.computeGroups(domain, env);

      // Une meme ligne source peut ressortir deux fois du SQL — deux prix UEX
      // du meme article ne different que par leur ressource, et le `DISTINCT`
      // les garde tous deux. La table n'accepte qu'un lien par ligne source :
      // on garde le meilleur score et on compte les autres, plutot que de les
      // absorber en silence.
      let duplicates = 0;
      for (const group of groups) {
        const bySource = new Map<string, (typeof group.sources)[number]>();
        for (const link of group.sources) {
          const key = `${link.source}|${link.sourceTable}|${link.sourceId ?? ''}|${link.sourceUuid ?? ''}`;
          const kept = bySource.get(key);
          if (!kept) {
            bySource.set(key, link);
            continue;
          }
          duplicates++;
          if (link.matchScore > kept.matchScore) bySource.set(key, { ...link, isPrimary: kept.isPrimary || link.isPrimary });
          else if (link.isPrimary) kept.isPrimary = true;
        }
        group.sources = [...bySource.values()];
      }

      // Trois ordres par domaine, pas un par entite : creer les milliers de
      // lignes une a une depassait le delai de la transaction interactive au
      // bout de cinq secondes. Les identifiants sont donc generes ici, pour
      // pouvoir ecrire les liens dans la foulee sans relire ce qui vient d'etre
      // insere.
      const entityRows = groups.map((group) => ({
        id: randomUUID(),
        env,
        domain,
        canonicalKey: group.key.slice(0, 255),
        name: group.name.slice(0, 255),
        primarySource: group.primarySource,
        primarySourceId: group.sources.find((link) => link.isPrimary)?.sourceId?.slice(0, 160) ?? null,
        confidence: group.confidence,
      }));

      const linkRows = groups.flatMap((group, index) =>
        group.sources.map((link) => ({
          canonicalId: entityRows[index].id,
          env,
          domain,
          source: link.source,
          sourceTable: link.sourceTable.slice(0, 120),
          sourceId: link.sourceId?.slice(0, 160) ?? null,
          sourceUuid: link.sourceUuid?.slice(0, 80) ?? null,
          sourceName: link.sourceName?.slice(0, 255) ?? null,
          matchMethod: link.matchMethod.slice(0, 40),
          matchScore: link.matchScore,
          isPrimary: link.isPrimary,
          // Prisma attend une valeur JSON d'entree ; le service manipule un
          // enregistrement libre, la conversion est explicite ici plutot que
          // diffuse dans le calcul des groupes.
          metadata: link.metadata as Prisma.InputJsonValue,
        })),
      );

      await prisma.$transaction(
        async (tx) => {
          await tx.canonicalEntity.deleteMany({ where: { env, domain } });
          if (entityRows.length > 0) await tx.canonicalEntity.createMany({ data: entityRows });
          if (linkRows.length > 0) await tx.canonicalEntityLink.createMany({ data: linkRows });
        },
        // Un domaine a moitie reecrit serait pire que pas reecrit : la
        // transaction couvre la suppression et la reecriture, et se donne de
        // quoi finir sur les domaines les plus larges.
        { timeout: 120_000 },
      );

      report[domain] = { entities: groups.length, links: groups.reduce((sum, g) => sum + g.sources.length, 0), duplicates };
    }

    return report;
  }

  /**
   * L'identite canonique d'une entite, depuis n'importe lequel de ses UUID.
   *
   * C'est ce que la table servait a rendre possible : demander « tout ce qu'on
   * sait de cette chose » sans savoir de quelle source vient l'identifiant qu'on
   * tient.
   */
  async getCanonicalBySourceUuid(sourceUuid: string, env = 'live'): Promise<CanonicalRecord | null> {
    const prisma = this.getClient(env);
    void this.refreshIfStale(env);

    const link = await prisma.canonicalEntityLink.findFirst({
      where: { env, sourceUuid },
      include: { canonical: { include: { links: true } } },
    });
    if (!link) return null;

    const entity = link.canonical;
    return {
      id: entity.id,
      env: entity.env,
      domain: entity.domain,
      key: entity.canonicalKey,
      name: entity.name,
      primary_source: entity.primarySource,
      confidence: entity.confidence,
      updated_at: entity.updatedAt.toISOString(),
      sources: entity.links
        .map((row) => ({
          source: row.source,
          source_table: row.sourceTable,
          source_id: row.sourceId,
          source_uuid: row.sourceUuid,
          source_name: row.sourceName,
          match_method: row.matchMethod,
          match_score: row.matchScore,
          is_primary: row.isPrimary,
        }))
        .sort((a, b) => b.match_score - a.match_score),
    };
  }

  /**
   * Recalcule en arriere-plan si une extraction est passee depuis la derniere
   * ecriture.
   *
   * La persistance est declenchee a la main ; sans ce controle elle se
   * perimerait en silence, ce qui est pire que de ne pas l'avoir. Le
   * rafraichissement ne bloque pas la requete en cours : celle-ci sert l'etat
   * precedent, la suivante aura le nouveau.
   */
  private refreshing = false;

  private async refreshIfStale(env: string): Promise<void> {
    if (this.refreshing) return;
    const prisma = this.getClient(env);
    try {
      const latest = await prisma.$queryRawUnsafe<Row[]>(
        toPostgres('SELECT MAX(extracted_at) AS at FROM meta.extraction_log WHERE game_env = ?'),
        env,
      );
      const extractedAt = latest[0]?.at ? new Date(String(latest[0].at)) : null;
      if (!extractedAt) return;

      const persisted = await prisma.canonicalEntity.aggregate({ where: { env }, _max: { updatedAt: true } });
      const persistedAt = persisted._max.updatedAt;
      if (persistedAt && persistedAt >= extractedAt) return;

      this.refreshing = true;
      void this.persistCanonicalEntities(env).finally(() => {
        this.refreshing = false;
      });
    } catch {
      // Une identite perimee vaut mieux qu'une requete en echec : le controle
      // de fraicheur ne doit jamais faire tomber la lecture.
      this.refreshing = false;
    }
  }

  async getSummary(env = 'live'): Promise<Record<CorrelationDomain, { total: number; correlated: number; singleSource: number }>> {
    const entries = await Promise.all(
      CORRELATION_DOMAINS.map(async (domain) => {
        // Sur les groupes complets : passer par `getCorrelations` plafonnait le
        // compte a 500, et le resume annoncait donc 500 composants la ou il y en
        // a 3 275.
        const correlations = await this.computeGroups(domain, env);
        return [
          domain,
          {
            total: correlations.length,
            correlated: correlations.filter((entry) => entry.confidence === 'correlated').length,
            singleSource: correlations.filter((entry) => entry.confidence === 'single_source').length,
          },
        ] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<CorrelationDomain, { total: number; correlated: number; singleSource: number }>;
  }
}

function paramsForDomain(domain: CorrelationDomain, env: string): string[] {
  if (domain === 'system') return [env, env, env];
  if (domain === 'ship') return [env, env, env];
  if (domain === 'shop') return [env, env];
  if (domain === 'location') return [env];
  return [env, env];
}

function sqlForDomain(domain: CorrelationDomain): string {
  if (domain === 'system') return SYSTEM_SQL;
  if (domain === 'ship') return SHIP_SQL;
  if (domain === 'shop') return SHOP_SQL;
  if (domain === 'location') return LOCATION_SQL;
  if (domain === 'commodity') return resourceSql('commodity', 'game.commodities', 'commodities', 'canonical_commodity_key');
  if (domain === 'item') return resourceSql('item', 'game.items', 'items', 'canonical_item_key');
  return resourceSql('component', 'game.components', 'components', 'canonical_component_key');
}

const SYSTEM_SQL = `
SELECT 'system' AS domain, 'rsi' AS source, 'rsi.starmap_locations' AS source_table,
       sl.rsi_id::text AS source_id, sl.id::text AS source_uuid,
       COALESCE(sl.name, sl.system_name, sl.system_code) AS source_name,
       COALESCE(sl.name, sl.system_name, sl.system_code) AS source_group_key,
       'rsi_starmap_system' AS match_method, 95 AS match_score,
       jsonb_build_object('type', sl.type, 'system_code', sl.system_code) AS metadata
  FROM rsi.starmap_locations sl
 WHERE LOWER(sl.type) = 'system' AND COALESCE(sl.name, sl.system_name, sl.system_code) IS NOT NULL
UNION ALL
SELECT 'system', 'p4k', 'game.locations',
       l.class_name, l.uuid, COALESCE(sl.name, sl.system_name, l.system_code),
       COALESCE(sl.name, sl.system_name, l.system_code),
       COALESCE(l.starmap_match_method, 'p4k_system_code'), COALESCE(l.starmap_match_score, 80),
       jsonb_build_object('system_code', l.system_code, 'type', l.type)
  FROM game.locations l
  LEFT JOIN rsi.starmap_locations sl ON sl.system_code = l.system_code AND LOWER(sl.type) = 'system'
 WHERE l.env = ? AND l.system_code IS NOT NULL
UNION ALL
SELECT DISTINCT 'system', 'p4k', 'game.shops',
       s.system, NULL::text, s.system, s.system,
       'p4k_shop_system', 60,
       jsonb_build_object('shop_count_hint', true)
  FROM game.shops s
 WHERE s.env = ? AND s.system IS NOT NULL AND s.system != ''
UNION ALL
SELECT DISTINCT 'system', 'uex', 'game.uex_terminals',
       t.star_system, NULL::text, t.star_system, t.star_system,
       'uex_terminal_system', 55,
       jsonb_build_object('terminal_count_hint', true)
  FROM game.uex_terminals t
 WHERE t.env = ? AND t.star_system IS NOT NULL AND t.star_system != ''
`;

const SHIP_SQL = `
SELECT 'ship' AS domain, 'p4k' AS source, 'game.ships' AS source_table,
       s.class_name AS source_id, s.uuid AS source_uuid, COALESCE(s.name, s.class_name) AS source_name,
       'uuid:' || s.uuid AS source_group_key,
       'p4k_ship_uuid' AS match_method, 95 AS match_score,
       jsonb_build_object('manufacturer_code', s.manufacturer_code, 'ship_matrix_id', s.ship_matrix_id) AS metadata
  FROM game.ships s
 WHERE s.env = ?
UNION ALL
SELECT 'ship', 'rsi', 'rsi.ship_matrix',
       sm.id::text, sm.id::text, sm.name,
       COALESCE('uuid:' || s.uuid, 'rsi:' || sm.id::text),
       CASE WHEN s.uuid IS NULL THEN 'rsi_ship_matrix_name' ELSE 'rsi_ship_matrix_link' END,
       CASE WHEN s.uuid IS NULL THEN 70 ELSE 90 END,
       jsonb_build_object('manufacturer_code', sm.manufacturer_code, 'url', sm.url)
  FROM rsi.ship_matrix sm
  LEFT JOIN game.ships s ON s.ship_matrix_id = sm.id AND s.env = ?
UNION ALL
SELECT DISTINCT 'ship', 'uex', 'game.uex_vehicle_prices',
       p.uex_vehicle_id::text, p.ship_uuid, COALESCE(s.name, p.vehicle_name),
       COALESCE('uuid:' || p.ship_uuid, p.vehicle_name),
       CASE WHEN p.ship_uuid IS NULL THEN 'uex_vehicle_name' ELSE 'uex_ship_uuid' END,
       CASE WHEN p.ship_uuid IS NULL THEN 60 ELSE 88 END,
       jsonb_build_object('uex_vehicle_id', p.uex_vehicle_id, 'price_kind', p.price_kind)
  FROM game.uex_vehicle_prices p
  LEFT JOIN game.ships s ON s.uuid = p.ship_uuid AND s.env = p.env
 WHERE p.env = ?
`;

const SHOP_SQL = `
SELECT 'shop' AS domain, 'p4k' AS source, 'game.shops' AS source_table,
       s.id::text AS source_id, s.id::text AS source_uuid, s.name AS source_name,
       COALESCE(s.canonical_shop_key, CONCAT_WS(':', s.system, s.city, s.location, s.name)) AS source_group_key,
       'p4k_shop_key' AS match_method, 85 AS match_score,
       jsonb_build_object('system', s.system, 'city', s.city, 'location', s.location, 'shop_type', s.shop_type) AS metadata
  FROM game.shops s
 WHERE s.env = ?
UNION ALL
SELECT 'shop', 'uex', 'game.uex_terminals',
       t.uex_id::text, t.uex_id::text, t.name,
       CONCAT_WS(':', t.star_system, t.city, t.space_station, t.outpost, t.name),
       'uex_terminal_key', 75,
       jsonb_build_object('system', t.star_system, 'city', t.city, 'type', t.type, 'company_name', t.company_name)
  FROM game.uex_terminals t
 WHERE t.env = ?
`;

const LOCATION_SQL = `
SELECT 'location' AS domain, 'p4k' AS source, 'game.locations' AS source_table,
       l.class_name AS source_id, l.uuid AS source_uuid, l.name AS source_name,
       COALESCE('rsi:' || l.rsi_starmap_location_id::text, 'uuid:' || l.uuid, l.loc_key, l.name) AS source_group_key,
       COALESCE(l.starmap_match_method, 'p4k_location_uuid') AS match_method, COALESCE(l.starmap_match_score, 80) AS match_score,
       jsonb_build_object('type', l.type, 'system_code', l.system_code, 'parent_uuid', l.parent_uuid) AS metadata
  FROM game.locations l
 WHERE l.env = ?
UNION ALL
SELECT 'location', 'rsi', 'rsi.starmap_locations',
       sl.rsi_id::text, sl.id::text, sl.name,
       'rsi:' || sl.id::text,
       'rsi_starmap_location', 90,
       jsonb_build_object('type', sl.type, 'system_code', sl.system_code, 'parent_id', sl.parent_id) AS metadata
  FROM rsi.starmap_locations sl
 WHERE LOWER(sl.type) != 'system'
`;

function resourceSql(domain: 'commodity' | 'item' | 'component', table: string, tableName: string, canonicalColumn: string): string {
  return `
SELECT '${domain}' AS domain, 'p4k' AS source, '${table}' AS source_table,
       p.class_name AS source_id, p.uuid AS source_uuid, p.name AS source_name,
       -- L'UUID d'abord, et non la cle canonique : UEX regroupe sur
       -- 'uuid:<uuid>', si bien qu'une cle composite du cote P4K —
       -- « gimbal::gimbal::a::5::varipuck-s5-gimbal-mount » — ne pouvait
       -- jamais rencontrer la sienne. Les deux sources tombaient dans des
       -- groupes separes, et le rapprochement n'avait jamais lieu.
       COALESCE('uuid:' || p.uuid, p.${canonicalColumn}, p.name) AS source_group_key,
       'p4k_${domain}_uuid' AS match_method, 90 AS match_score,
       jsonb_build_object('class_name', p.class_name, 'type', p.type) AS metadata
  FROM ${table} p
 WHERE p.env = ?
UNION ALL
SELECT DISTINCT '${domain}', 'uex', 'game.uex_market_prices',
       COALESCE(m.entity_uex_id::text, m.uex_id::text), m.entity_uuid, m.entity_name,
       COALESCE('uuid:' || m.entity_uuid, m.entity_name),
       CASE WHEN m.entity_uuid IS NULL THEN 'uex_${domain}_name' ELSE 'uex_${domain}_uuid' END,
       CASE WHEN m.entity_uuid IS NULL THEN 55 ELSE 82 END,
       jsonb_build_object('resource', m.resource, 'entity_kind', m.entity_kind, 'table', '${tableName}')
  FROM game.uex_market_prices m
 WHERE m.env = ? AND m.entity_kind = '${domain}'
`;
}
