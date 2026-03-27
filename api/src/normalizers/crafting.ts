/**
 * Crafting text normalizers for public API display fields.
 */

const CRAFTING_PREFIX_RE = /^(CraftingBlueprintRecord\.)?BP_CRAFT_/i;
const GPP_PREFIX_RE = /^@StatName_GPP_(Weapon_|Armor_)?/;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const KNOWN_ACRONYMS = new Set(['api', 'fps', 'ptu', 'rsi', 'scu', 'uee', 'ui']);

function toDisplayToken(token: string): string {
  const lower = token.toLowerCase();
  if (!token) return token;
  if (/^\d+$/.test(token)) return token;
  if (KNOWN_ACRONYMS.has(lower)) return lower.toUpperCase();
  // Common 3-letter manufacturer-like shortcodes found in crafting records (e.g. ccc, cds).
  if (/^[a-z]{3}$/.test(lower) && new Set(lower).size <= 2) return lower.toUpperCase();
  return `${lower[0].toUpperCase()}${lower.slice(1)}`;
}

function titleCaseWords(value: string): string {
  return value
    .split(' ')
    .map((token) => toDisplayToken(token))
    .join(' ');
}

export function cleanRecipeName(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = collapseWhitespace(raw.replace(CRAFTING_PREFIX_RE, '').replace(/_/g, ' '));
  return titleCaseWords(cleaned);
}

export function cleanItemName(raw: string | null | undefined): string {
  if (!raw) return '';
  return titleCaseWords(collapseWhitespace(raw.replace(/_/g, ' ')));
}

export function cleanPropertyName(raw: string | null | undefined): string {
  if (!raw) return '';
  if (!raw.startsWith('@')) return collapseWhitespace(raw);
  return collapseWhitespace(raw.replace(GPP_PREFIX_RE, '').replace(/_/g, ' '));
}
