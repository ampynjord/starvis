import { existsSync, readFileSync } from 'node:fs';
import type { CanonicalSourceType } from './canonical-source.js';
import logger from './logger.js';

export interface ExternalSourceOverride {
  className: string;
  name?: string | null;
  type?: string | null;
  subType?: string | null;
  grade?: string | null;
  size?: number | null;
  symbol?: string | null;
  location?: string | null;
  system?: string | null;
  planetMoon?: string | null;
  city?: string | null;
  sourceType?: CanonicalSourceType;
  sourceName?: string;
  sourceReference?: string | null;
  confidenceScore?: number | null;
}

interface SourcePayload {
  items?: ExternalSourceOverride[];
  commodities?: ExternalSourceOverride[];
  components?: ExternalSourceOverride[];
  shops?: ExternalSourceOverride[];
}

type LooseRow = Record<string, unknown>;

export interface ExternalCanonicalData {
  items: Map<string, ExternalSourceOverride>;
  commodities: Map<string, ExternalSourceOverride>;
  components: Map<string, ExternalSourceOverride>;
  shops: Map<string, ExternalSourceOverride>;
}

const EMPTY_DATA: ExternalCanonicalData = {
  items: new Map(),
  commodities: new Map(),
  components: new Map(),
  shops: new Map(),
};

function toMap(rows: ExternalSourceOverride[] | undefined): Map<string, ExternalSourceOverride> {
  const map = new Map<string, ExternalSourceOverride>();
  if (!rows?.length) return map;

  for (const row of rows) {
    if (!row?.className) continue;
    map.set(row.className, row);
  }

  return map;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length ? v : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pick(row: LooseRow, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return undefined;
}

function normalizeRow(row: LooseRow): ExternalSourceOverride | null {
  const className = asString(pick(row, ['className', 'class_name', 'componentClassName', 'component_class_name']));
  if (!className) return null;

  return {
    className,
    name: asString(pick(row, ['name', 'displayName', 'display_name'])),
    type: asString(pick(row, ['type'])),
    subType: asString(pick(row, ['subType', 'sub_type'])),
    grade: asString(pick(row, ['grade'])),
    size: asNumber(pick(row, ['size'])),
    symbol: asString(pick(row, ['symbol'])),
    location: asString(pick(row, ['location'])),
    system: asString(pick(row, ['system'])),
    planetMoon: asString(pick(row, ['planetMoon', 'planet_moon'])),
    city: asString(pick(row, ['city'])),
    sourceType: asString(pick(row, ['sourceType', 'source_type'])) as CanonicalSourceType | undefined,
    sourceName: asString(pick(row, ['sourceName', 'source_name'])) ?? undefined,
    sourceReference: asString(pick(row, ['sourceReference', 'source_reference', 'id', 'uuid'])),
    confidenceScore: asNumber(pick(row, ['confidenceScore', 'confidence_score'])),
  };
}

function normalizeRows(rows: unknown): ExternalSourceOverride[] {
  if (!Array.isArray(rows)) return [];
  const out: ExternalSourceOverride[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const normalized = normalizeRow(row as LooseRow);
    if (normalized) out.push(normalized);
  }
  return out;
}

function readPayload(filePath: string): SourcePayload | null {
  if (!existsSync(filePath)) {
    logger.warn(`External source file not found: ${filePath}`);
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as SourcePayload;
    return parsed;
  } catch (error) {
    logger.warn(`Failed to parse external source file ${filePath}: ${(error as Error).message}`);
    return null;
  }
}

async function fetchPayload(url: string, headers: Record<string, string>): Promise<SourcePayload | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      logger.warn(`Failed to fetch external source ${url}: HTTP ${res.status}`);
      return null;
    }

    const parsed = (await res.json()) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      logger.warn(`Invalid JSON payload from ${url}: expected object`);
      return null;
    }

    return parsed as SourcePayload;
  } catch (error) {
    logger.warn(`Failed to fetch external source ${url}: ${(error as Error).message}`);
    return null;
  }
}

function mergeMaps(
  target: Map<string, ExternalSourceOverride>,
  incoming: Map<string, ExternalSourceOverride>,
): Map<string, ExternalSourceOverride> {
  for (const [key, value] of incoming) {
    const prev = target.get(key);
    if (!prev) {
      target.set(key, value);
      continue;
    }

    const prevScore = prev.confidenceScore ?? 0;
    const nextScore = value.confidenceScore ?? 0;
    if (nextScore >= prevScore) target.set(key, { ...prev, ...value });
  }
  return target;
}

function mapPayload(payload: SourcePayload): ExternalCanonicalData {
  return {
    items: toMap(normalizeRows(payload.items)),
    commodities: toMap(normalizeRows(payload.commodities)),
    components: toMap(normalizeRows(payload.components)),
    shops: toMap(normalizeRows(payload.shops)),
  };
}

function count(data: ExternalCanonicalData): number {
  return data.items.size + data.commodities.size + data.components.size + data.shops.size;
}

export async function loadExternalCanonicalData(): Promise<ExternalCanonicalData> {
  const communityPath = process.env.STARVIS_COMMUNITY_CANONICAL_JSON?.trim();
  const communityUrl = process.env.STARVIS_COMMUNITY_CANONICAL_URL?.trim();

  if (!communityPath && !communityUrl) return EMPTY_DATA;

  const result: ExternalCanonicalData = {
    items: new Map(),
    commodities: new Map(),
    components: new Map(),
    shops: new Map(),
  };

  const sources = [
    {
      name: 'community',
      path: communityPath,
      url: communityUrl,
      defaults: { sourceType: 'community_log' as CanonicalSourceType, sourceName: 'community' },
    },
  ];

  for (const source of sources) {
    let payload: SourcePayload | null = null;

    if (source.path) payload = readPayload(source.path);

    if (!payload && source.url) {
      payload = await fetchPayload(source.url, {});
    }

    if (!payload) continue;

    const mapped = mapPayload(payload);

    // Fill default provenance if missing in source payload.
    for (const [, value] of mapped.items) {
      value.sourceType ??= source.defaults.sourceType;
      value.sourceName ??= source.defaults.sourceName;
    }
    for (const [, value] of mapped.commodities) {
      value.sourceType ??= source.defaults.sourceType;
      value.sourceName ??= source.defaults.sourceName;
    }
    for (const [, value] of mapped.components) {
      value.sourceType ??= source.defaults.sourceType;
      value.sourceName ??= source.defaults.sourceName;
    }
    for (const [, value] of mapped.shops) {
      value.sourceType ??= source.defaults.sourceType;
      value.sourceName ??= source.defaults.sourceName;
    }

    mergeMaps(result.items, mapped.items);
    mergeMaps(result.commodities, mapped.commodities);
    mergeMaps(result.components, mapped.components);
    mergeMaps(result.shops, mapped.shops);

    logger.info(
      `Loaded external source ${source.name}: ${count(mapped)} overrides (items=${mapped.items.size}, commodities=${mapped.commodities.size}, components=${mapped.components.size}, shops=${mapped.shops.size})`,
    );
  }

  if (count(result) > 0) {
    logger.info(
      `Merged external overrides: items=${result.items.size}, commodities=${result.commodities.size}, components=${result.components.size}, shops=${result.shops.size}`,
    );
  }

  return result;
}
