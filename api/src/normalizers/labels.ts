/**
 * Generic display-label normalizers for enum-like API fields.
 */

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  if (/^[A-Z0-9]{2,6}$/.test(word)) return word;
  const lower = word.toLowerCase();
  return `${lower[0].toUpperCase()}${lower.slice(1)}`;
}

/** Convert snake_case / kebab-case / camelCase enum values to readable labels. */
export function formatEnumLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  const spaced = collapseWhitespace(
    raw
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'),
  );
  return spaced.split(' ').map(capitalizeWord).join(' ');
}
