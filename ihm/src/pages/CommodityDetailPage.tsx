import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { CanonicalMeta } from '@/components/ui/CanonicalMeta';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';

function fmtNum(v: number | null | undefined, unit = '', digits = 2): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

export default function CommodityDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { env } = useEnv();

  const { data: commodity, isLoading, error, refetch } = useQuery({
    queryKey: ['commodities.get', uuid, env],
    queryFn: () => api.commodities.get(uuid!, env),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="LOADING COMMODITY…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!commodity) return null;

  return (
    <div className="max-w-screen-lg mx-auto space-y-6">
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button onClick={() => navigate(-1)} className="hover:text-slate-400 transition-colors flex items-center gap-1"><ArrowLeft size={12} /> Back</button>
        <ChevronRight size={10} />
        <Link to="/commodities" className="hover:text-slate-400">Commodities</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{commodity.name}</span>
      </div>

      <div className="sci-panel p-6">
        <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">{commodity.type ?? 'Commodity'}</p>
        <h1 className="font-orbitron text-2xl font-black text-slate-100">{commodity.name}</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          {commodity.type && <GlowBadge color="slate">{commodity.type}</GlowBadge>}
          {commodity.sub_type && <GlowBadge color="slate">{commodity.sub_type}</GlowBadge>}
          {commodity.symbol && <GlowBadge color="cyan">{commodity.symbol}</GlowBadge>}
          <GlowBadge color="slate">{commodity.class_name}</GlowBadge>
        </div>
        <CanonicalMeta
          className="mt-4"
          sourceType={commodity.source_type}
          sourceName={commodity.source_name}
          confidenceScore={commodity.confidence_score}
          canonicalKey={commodity.canonical_commodity_key}
          normalizedName={commodity.normalized_name}
        />
      </div>

      <ScifiPanel title="Commodity Details">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { label: 'Name', value: commodity.name },
            { label: 'Class', value: commodity.class_name },
            { label: 'Type', value: commodity.type ?? '—' },
            { label: 'Sub-type', value: commodity.sub_type ?? '—' },
            { label: 'Symbol', value: commodity.symbol ?? '—' },
            { label: 'Volume', value: fmtNum(commodity.occupancy_scu, 'μSCU', 4) },
          ].map(({ label, value }) => (
            <div key={label} className="sci-panel p-2.5">
              <p className="text-xs text-slate-600 font-mono-sc uppercase">{label}</p>
              <p className="text-sm font-mono-sc text-slate-300 mt-0.5 break-words">{value}</p>
            </div>
          ))}
        </div>
      </ScifiPanel>

      {commodity.data_json && (
        <ScifiPanel title="Raw Game Data" subtitle="Parsed payload from extractor">
          <pre className="max-h-96 overflow-auto text-xs text-slate-400 font-mono-sc leading-relaxed">{JSON.stringify(commodity.data_json, null, 2)}</pre>
        </ScifiPanel>
      )}
    </div>
  );
}
