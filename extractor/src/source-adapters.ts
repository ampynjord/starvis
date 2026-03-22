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
    items: toMap(payload.items),
    commodities: toMap(payload.commodities),
    components: toMap(payload.components),
    shops: toMap(payload.shops),
  };
}

function count(data: ExternalCanonicalData): number {
  return data.items.size + data.commodities.size + data.components.size + data.shops.size;
}

export function loadExternalCanonicalData(): ExternalCanonicalData {
  const cornerstonePath = process.env.STARVIS_CORNERSTONE_CANONICAL_JSON?.trim();
  const communityPath = process.env.STARVIS_COMMUNITY_CANONICAL_JSON?.trim();

  if (!cornerstonePath && !communityPath) return EMPTY_DATA;

  const result: ExternalCanonicalData = {
    items: new Map(),
    commodities: new Map(),
    components: new Map(),
    shops: new Map(),
  };

  const sources = [
    {
      name: 'cornerstone',
      path: cornerstonePath,
      defaults: { sourceType: 'cornerstone' as CanonicalSourceType, sourceName: 'cornerstone' },
    },
    {
      name: 'community',
      path: communityPath,
      defaults: { sourceType: 'community_log' as CanonicalSourceType, sourceName: 'community' },
    },
  ];

  for (const source of sources) {
    if (!source.path) continue;
    const payload = readPayload(source.path);
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
