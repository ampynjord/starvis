export const fNumber = (v: number | null | undefined, decimals = 0): string => {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (isNaN(n)) return '—';
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
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const fDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const fSize = (s: number | null | undefined): string => {
  if (s == null) return '—';
  return `S${s}`;
};

export const fTime = (seconds: number | null | undefined): string => {
  if (seconds == null) return '—';
  const s = typeof seconds === 'number' ? seconds : Number(seconds);
  if (isNaN(s)) return '—';
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${(s / 60).toFixed(1)}min`;
};

export const fDimension = (v: number | null | undefined): string => {
  if (v == null) return '—';
  return `${fNumber(v, 1)} m`;
};
