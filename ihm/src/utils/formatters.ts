export const fNumber = (v: number | null | undefined, decimals = 0): string => {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
};

export const fMass = (kg: number | null | undefined): string => {
  if (kg == null) return '—';
  if (kg >= 1_000_000) return `${fNumber(kg / 1_000_000, 1)} kt`;
  if (kg >= 1_000) return `${fNumber(kg / 1_000, 1)} t`;
  return `${fNumber(kg, 0)} kg`;
};

export const fSpeed = (ms: number | null | undefined): string => {
  if (ms == null) return '—';
  return `${fNumber(ms, 0)} m/s`;
};

export const fDistance = (m: number | null | undefined): string => {
  if (m == null) return '—';
  if (m >= 1_000_000) return `${fNumber(m / 1_000_000, 2)} Gm`;
  if (m >= 1_000) return `${fNumber(m / 1_000, 1)} km`;
  return `${fNumber(m, 0)} m`;
};

export const fCredits = (aUEC: number | null | undefined): string => {
  if (aUEC == null) return '—';
  if (aUEC >= 1_000_000) return `${fNumber(aUEC / 1_000_000, 1)}M aUEC`;
  if (aUEC >= 1_000) return `${fNumber(aUEC / 1_000, 1)}k aUEC`;
  return `${fNumber(aUEC)} aUEC`;
};

export const fDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const fDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const fSize = (s: number | null | undefined): string => {
  if (s == null) return '—';
  return `S${s}`;
};

export const fTime = (seconds: number | null | undefined): string => {
  if (seconds == null) return '—';
  const s = typeof seconds === 'number' ? seconds : Number(seconds);
  if (Number.isNaN(s)) return '—';
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${(s / 60).toFixed(1)}min`;
};

export const fDimension = (v: number | null | undefined): string => {
  if (v == null) return '—';
  return `${fNumber(v, 1)} m`;
};

// Humanize raw game identifiers (class names, localization keys) into readable
// labels so the IHM never shows things like "AEGS_Gladius", "mnrl_gold" or
// "@LOC_PLACEHOLDER" to end users. Use only as a display fallback when a clean
// `name` is missing.
export const prettyName = (raw: string | null | undefined): string => {
  if (!raw) return 'Unknown';
  let value = raw.trim();
  // Drop localization-key prefixes like "@LOC_…" / "@UI_…".
  value = value.replace(/^@+/, '').replace(/^(LOC|UI|MISC|ITEM|MNRL|COMM)_/i, '');
  // Split CamelCase and underscores/dashes into words.
  value = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return 'Unknown';
  // Title-case, preserving short all-caps tokens (e.g. "MK2", "S4").
  return value
    .split(' ')
    .map((word) => (word.length <= 2 || /\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
};
