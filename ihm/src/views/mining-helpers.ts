export function pct(v: number | string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export function fNum(v: number | string | null, decimals = 2): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

/** Color class from 0 (safe/green) to 1 (dangerous/red) */
export function dangerColor(v: number | string | null): string {
  if (v == null) return 'text-slate-500';
  const n = Number(v);
  if (n < 0.3) return 'text-green-400';
  if (n < 0.6) return 'text-amber-400';
  return 'text-red-400';
}

export function dangerBg(v: number | null): string {
  if (v == null) return 'bg-slate-700';
  if (v < 0.3) return 'bg-green-500';
  if (v < 0.6) return 'bg-amber-500';
  return 'bg-red-500';
}

export function probColor(v: number | string): string {
  const n = Number(v);
  if (n >= 0.7) return 'bg-green-500';
  if (n >= 0.4) return 'bg-amber-500';
  return 'bg-slate-600';
}
