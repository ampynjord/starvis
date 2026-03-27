/**
 * Crafting text normalizers for public API display fields.
 */

const CRAFTING_PREFIX_RE = /^(CraftingBlueprintRecord\.)?BP_CRAFT_/i;
const GPP_PREFIX_RE = /^@StatName_GPP_(Weapon_|Armor_)?/;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function titleCaseWords(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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
