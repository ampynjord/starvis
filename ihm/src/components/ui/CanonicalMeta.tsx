import { GlowBadge } from '@/components/ui/GlowBadge';

type Props = {
  sourceType?: string | null;
  sourceName?: string | null;
  confidenceScore?: number | null;
  canonicalKey?: string | null;
  locationKey?: string | null;
  normalizedName?: string | null;
  className?: string;
  compact?: boolean;
};

function sourceColor(sourceType?: string | null): 'cyan' | 'amber' | 'slate' {
  if (!sourceType) return 'slate';
  if (sourceType === 'community_log') return 'cyan';
  if (sourceType === 'manual' || sourceType === 'derived') return 'amber';
  return 'slate';
}

function sourceLabel(sourceType?: string | null, sourceName?: string | null): string {
  if (sourceName) return sourceName;
  if (!sourceType) return 'unknown';
  return sourceType.replace(/_/g, ' ');
}

export function CanonicalMeta({
  sourceType,
  sourceName,
  confidenceScore,
  canonicalKey,
  locationKey,
  normalizedName,
  className = '',
  compact = false,
}: Props) {
  const hasData = !!sourceType || !!sourceName || confidenceScore != null || !!canonicalKey || !!locationKey || !!normalizedName;
  if (!hasData) return null;

  const confidence =
    confidenceScore == null || Number.isNaN(Number(confidenceScore))
      ? null
      : `${Math.max(0, Math.min(100, Math.round(Number(confidenceScore))))}%`;

  if (compact) {
    return (
      <div className={`flex flex-wrap gap-1.5 ${className}`.trim()}>
        <GlowBadge color={sourceColor(sourceType)}>src: {sourceLabel(sourceType, sourceName)}</GlowBadge>
        {confidence && <GlowBadge color="slate">conf: {confidence}</GlowBadge>}
      </div>
    );
  }

  return (
    <div className={`sci-panel p-3 ${className}`.trim()}>
      <p className="text-[11px] uppercase tracking-widest text-slate-600 font-mono-sc">Data provenance</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <GlowBadge color={sourceColor(sourceType)}>src: {sourceLabel(sourceType, sourceName)}</GlowBadge>
        {confidence && <GlowBadge color="slate">conf: {confidence}</GlowBadge>}
      </div>
      <div className="mt-2 space-y-1">
        {canonicalKey && <p className="text-[11px] text-slate-500 font-mono-sc break-all">canonical: {canonicalKey}</p>}
        {locationKey && <p className="text-[11px] text-slate-500 font-mono-sc break-all">location: {locationKey}</p>}
        {normalizedName && <p className="text-[11px] text-slate-500 font-mono-sc">normalized: {normalizedName}</p>}
      </div>
    </div>
  );
}
