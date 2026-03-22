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

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
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