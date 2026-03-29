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

/**
 * Build a human-readable item display name while keeping source `name` untouched.
 */
export function cleanItemDisplayName(raw: string | null | undefined): string {
  if (!raw) return '';
  const hasUnderscore = raw.includes('_');
  const codeLike = /^[a-z0-9_]+$/.test(raw);
  const collapsed = stripVariantCodes(collapseWhitespace(raw.replace(/_/g, ' ')));
  return hasUnderscore || codeLike ? titleCaseWords(collapsed) : collapsed;
}
