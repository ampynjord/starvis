/**
 * Item display-name normalizer for public API fields.
 */

const TRAILING_VARIANT_CODE_RE = /\s\d{2}(?:\s\d{2})+(?=\s+[a-z][a-z0-9-]*$|$)/gi;
const KNOWN_ACRONYMS = new Set(['api', 'fps', 'ptu', 'rsi', 'scu', 'uee', 'ui']);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toDisplayToken(token: string): string {
  const lower = token.toLowerCase();
  if (!token) return token;
  if (/^\d+$/.test(token)) return token;
  if (KNOWN_ACRONYMS.has(lower)) return lower.toUpperCase();
  if (/^[a-z]{3}$/.test(lower) && new Set(lower).size <= 2) return lower.toUpperCase();
  return `${lower[0].toUpperCase()}${lower.slice(1)}`;
}

function titleCaseWords(value: string): string {
  return value
    .split(' ')
    .map((token) => toDisplayToken(token))
    .join(' ');
}

function stripVariantCodes(value: string): string {
  return collapseWhitespace(value.replace(TRAILING_VARIANT_CODE_RE, ''));
}

function toMorozovAlias(name: string, className?: string | null): string | null {
  const source = collapseWhitespace(`${name} ${className ?? ''}`.toLowerCase());
  if (!source.includes('cds') || !source.includes('heavy')) return null;

  const m = name.match(/^(?:CDS)\s+(?:(?:Legacy\s+)?Armor\s+)?(?:Combat\s+)?Heavy\s+(Arms|Core|Torso|Helmet|Legs)(?:\s+(.*))?$/i);
  if (m) {
    const slot = titleCaseWords(m[1]);
    const suffix = m[2] ? ` ${titleCaseWords(collapseWhitespace(m[2]))}` : '';
    return `Morozov ${slot}${suffix}`.trim();
  }

  const u = name.match(/^(?:CDS)\s+Undersuit(?:\s+(.*))?$/i);
  if (u && /cds_.*heavy|heavy_.*cds|morozov/.test((className ?? '').toLowerCase())) {
    const suffix = u[1] ? ` ${titleCaseWords(collapseWhitespace(u[1]))}` : '';
    return `Morozov Undersuit${suffix}`.trim();
  }

  return null;
}

/**
 * Build a human-readable item display name while keeping source `name` untouched.
 */
export function cleanItemDisplayName(raw: string | null | undefined, className?: string | null): string {
  if (!raw) return '';
  const hasUnderscore = raw.includes('_');
  const codeLike = /^[a-z0-9_]+$/.test(raw);
  const collapsed = stripVariantCodes(collapseWhitespace(raw.replace(/_/g, ' ')));
  const display = hasUnderscore || codeLike ? titleCaseWords(collapsed) : collapsed;
  const morozovAlias = toMorozovAlias(display, className);
  return morozovAlias ?? display;
}
