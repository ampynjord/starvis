/**
 * Formatage de valeurs numériques pour l'affichage.
 *
 * Ces fonctions existaient en copies locales dans une dizaine de vues, avec un
 * piège : deux fichiers définissaient un `fNum` de sémantique différente — l'un
 * en `toLocaleString` (séparateurs de milliers), l'autre en `toFixed` (décimales
 * fixes). Un même nom pour deux comportements, donc une lecture trompeuse dès
 * qu'on passait d'un fichier à l'autre.
 *
 * Les noms ci-dessous rendent la distinction visible plutôt que de la masquer.
 */

/** Rendu des valeurs absentes ou non numériques, partout identique. */
export const EMPTY_VALUE = '—';

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Décimales fixes : `12.50`. Pour les grandeurs physiques, où le nombre de
 * décimales porte une information (instabilité, résistance, vitesses).
 *
 * Défaut à 0 décimale, comme le formateur des fiches vaisseaux qu'il remplace :
 * les appelants qui veulent des décimales les demandent explicitement. Passer ce
 * défaut à 2 afficherait « 220.00 m/s » là où la production montre « 220 m/s ».
 */
export function formatDecimal(value: number | string | null | undefined, digits = 0): string {
  const n = toFiniteNumber(value);
  return n === null ? EMPTY_VALUE : n.toFixed(digits);
}

/**
 * Séparateurs de milliers : `12,500`. Pour les quantités et les prix, où la
 * lisibilité des grands nombres prime.
 */
export function formatCount(value: number | string | null | undefined, digits = 0): string {
  const n = toFiniteNumber(value);
  return n === null ? EMPTY_VALUE : n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Pourcentage à partir d'une fraction (0.42 → `42.0%`). */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  const n = toFiniteNumber(value);
  return n === null ? EMPTY_VALUE : `${(n * 100).toFixed(digits)}%`;
}

/** Décimales fixes suivies d'une unité : `220 m/s`. */
export function formatWithUnit(value: number | string | null | undefined, unit: string, digits = 2): string {
  const n = toFiniteNumber(value);
  if (n === null) return EMPTY_VALUE;
  return unit ? `${n.toFixed(digits)} ${unit}` : n.toFixed(digits);
}

/** Notation abrégée pour les grands nombres : `1.2M`, `340k`. */
export function formatCompact(value: number | string | null | undefined, digits = 1): string {
  const n = toFiniteNumber(value);
  if (n === null) return EMPTY_VALUE;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(digits)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(digits)}k`;
  return String(n);
}
