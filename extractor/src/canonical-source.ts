export type CanonicalSourceType = 'p4k_datamine' | 'cornerstone' | 'community_log' | 'manual' | 'derived';

export interface CanonicalShopInput {
  name: string;
  className: string;
  system?: string | null;
  planetMoon?: string | null;
  city?: string | null;
  location?: string | null;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference?: string | null;
  confidenceScore?: number | null;
}

export interface CanonicalInventoryInput {
  componentClassName: string;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference?: string | null;
  confidenceScore?: number | null;
}

export interface CanonicalizedShopRecord {
  normalizedName: string;
  canonicalShopKey: string;
  canonicalLocationKey: string | null;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference: string | null;
  confidenceScore: number;
}

export interface CanonicalizedInventoryRecord {
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference: string | null;
  confidenceScore: number;
}

export interface CanonicalItemInput {
  name: string;
  className: string;
  type?: string | null;
  subType?: string | null;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference?: string | null;
  confidenceScore?: number | null;
}

export interface CanonicalizedItemRecord {
  normalizedName: string;
  canonicalItemKey: string;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference: string | null;
  confidenceScore: number;
}

export interface CanonicalCommodityInput {
  name: string;
  className: string;
  type?: string | null;
  subType?: string | null;
  symbol?: string | null;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference?: string | null;
  confidenceScore?: number | null;
}

export interface CanonicalizedCommodityRecord {
  normalizedName: string;
  canonicalCommodityKey: string;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference: string | null;
  confidenceScore: number;
}

export interface CanonicalComponentInput {
  name: string;
  className: string;
  type?: string | null;
  subType?: string | null;
  grade?: string | null;
  size?: number | null;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference?: string | null;
  confidenceScore?: number | null;
}

export interface CanonicalizedComponentRecord {
  normalizedName: string;
  canonicalComponentKey: string;
  sourceType: CanonicalSourceType;
  sourceName: string;
  sourceReference: string | null;
  confidenceScore: number;
}

function normalizeText(value: string | null | undefined): string {
  const raw = value == null ? '' : String(value);
  const lower = raw.trim().toLowerCase();
  const safe = lower === 'undefined' || lower === 'null' || lower === 'n/a' || lower === 'na' ? '' : raw;
  return safe
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function clampConfidence(value: number | null | undefined, fallback: number): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function canonicalizeShopRecord(input: CanonicalShopInput): CanonicalizedShopRecord {
  const normalizedName = normalizeText(input.name) || normalizeText(input.className) || 'unknown-shop';
  const system = normalizeText(input.system);
  const planetMoon = normalizeText(input.planetMoon);
  const city = normalizeText(input.city);
  const location = normalizeText(input.location);

  const canonicalLocationKey = [system, planetMoon, city || location].filter(Boolean).join('/') || null;
  const canonicalShopKey = [canonicalLocationKey, normalizedName].filter(Boolean).join('::') || normalizedName;

  return {
    normalizedName,
    canonicalShopKey,
    canonicalLocationKey,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceReference: input.sourceReference ?? null,
    confidenceScore: clampConfidence(input.confidenceScore, input.sourceType === 'p4k_datamine' ? 70 : 85),
  };
}

export function canonicalizeInventoryRecord(input: CanonicalInventoryInput): CanonicalizedInventoryRecord {
  return {
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceReference: input.sourceReference ?? null,
    confidenceScore: clampConfidence(input.confidenceScore, input.sourceType === 'cornerstone' ? 85 : 70),
  };
}

export function canonicalizeItemRecord(input: CanonicalItemInput): CanonicalizedItemRecord {
  const normalizedName = normalizeText(input.name) || normalizeText(input.className) || 'unknown-item';
  const typeKey = normalizeText(input.type);
  const subTypeKey = normalizeText(input.subType);
  const classKey = normalizeText(input.className);
  const canonicalItemKey = [typeKey, subTypeKey, normalizedName, classKey].filter(Boolean).join('::') || normalizedName;

  return {
    normalizedName,
    canonicalItemKey,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceReference: input.sourceReference ?? null,
    confidenceScore: clampConfidence(input.confidenceScore, input.sourceType === 'p4k_datamine' ? 70 : 85),
  };
}

export function canonicalizeCommodityRecord(input: CanonicalCommodityInput): CanonicalizedCommodityRecord {
  const normalizedName = normalizeText(input.name) || normalizeText(input.className) || 'unknown-commodity';
  const typeKey = normalizeText(input.type);
  const subTypeKey = normalizeText(input.subType);
  const symbolKey = normalizeText(input.symbol);
  const classKey = normalizeText(input.className);
  const canonicalCommodityKey = [typeKey, subTypeKey, symbolKey || normalizedName, classKey].filter(Boolean).join('::') || normalizedName;

  return {
    normalizedName,
    canonicalCommodityKey,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceReference: input.sourceReference ?? null,
    confidenceScore: clampConfidence(input.confidenceScore, input.sourceType === 'p4k_datamine' ? 70 : 85),
  };
}

export function canonicalizeComponentRecord(input: CanonicalComponentInput): CanonicalizedComponentRecord {
  const normalizedName = normalizeText(input.name) || normalizeText(input.className) || 'unknown-component';
  const typeKey = normalizeText(input.type);
  const subTypeKey = normalizeText(input.subType);
  const gradeKey = normalizeText(input.grade);
  const sizeKey = input.size == null ? '' : String(input.size);
  const classKey = normalizeText(input.className);
  const canonicalComponentKey =
    [typeKey, subTypeKey, gradeKey, sizeKey, normalizedName, classKey].filter(Boolean).join('::') || normalizedName;

  return {
    normalizedName,
    canonicalComponentKey,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceReference: input.sourceReference ?? null,
    confidenceScore: clampConfidence(input.confidenceScore, input.sourceType === 'p4k_datamine' ? 70 : 85),
  };
}
