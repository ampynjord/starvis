// Canonical key derivation for extractor deduplication.
// Provenance fields (source_type, source_name, etc.) have been removed from the DB schema.

export interface CanonicalItemInput {
  name: string;
  className: string;
  type?: string | null;
  subType?: string | null;
}

export interface CanonicalizedItemRecord {
  normalizedName: string;
  canonicalItemKey: string;
}

export interface CanonicalCommodityInput {
  name: string;
  className: string;
  type?: string | null;
  subType?: string | null;
  symbol?: string | null;
}

export interface CanonicalizedCommodityRecord {
  normalizedName: string;
  canonicalCommodityKey: string;
}

export interface CanonicalComponentInput {
  name: string;
  className: string;
  type?: string | null;
  subType?: string | null;
  grade?: string | null;
  size?: number | null;
}

export interface CanonicalizedComponentRecord {
  normalizedName: string;
  canonicalComponentKey: string;
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

export function canonicalizeItemRecord(input: CanonicalItemInput): CanonicalizedItemRecord {
  const normalizedName = normalizeText(input.name) || normalizeText(input.className) || 'unknown-item';
  const typeKey = normalizeText(input.type);
  const subTypeKey = normalizeText(input.subType);
  const classKey = normalizeText(input.className);
  const canonicalItemKey = [typeKey, subTypeKey, normalizedName, classKey].filter(Boolean).join('::') || normalizedName;
  return { normalizedName, canonicalItemKey };
}

export function canonicalizeCommodityRecord(input: CanonicalCommodityInput): CanonicalizedCommodityRecord {
  const normalizedName = normalizeText(input.name) || normalizeText(input.className) || 'unknown-commodity';
  const typeKey = normalizeText(input.type);
  const subTypeKey = normalizeText(input.subType);
  const symbolKey = normalizeText(input.symbol);
  const classKey = normalizeText(input.className);
  const canonicalCommodityKey = [typeKey, subTypeKey, symbolKey || normalizedName, classKey].filter(Boolean).join('::') || normalizedName;
  return { normalizedName, canonicalCommodityKey };
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
  return { normalizedName, canonicalComponentKey };
}
