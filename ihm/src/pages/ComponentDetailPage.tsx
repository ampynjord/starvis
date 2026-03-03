import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MapPin, Rocket } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { ShipCard } from '@/components/ship/ShipCard';
import { COMPONENT_TYPE_COLORS } from '@/utils/constants';
import { fCredits } from '@/utils/formatters';

export default function ComponentDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const { data: comp, isLoading, error, refetch } = useQuery({
    queryKey: ['components.get', uuid],
    queryFn: () => api.components.get(uuid!),
    enabled: !!uuid,
  });
  const { data: ships } = useQuery({
    queryKey: ['components.ships', uuid],
    queryFn: () => api.components.ships(uuid!),
    enabled: !!uuid,
  });
  const { data: buyLocs } = useQuery({
    queryKey: ['components.buyLocs', uuid],
    queryFn: () => api.components.buyLocations(uuid!),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="LOADING COMPONENT…" />;
  if (error)    return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!comp)    return null;

  const typeColor = COMPONENT_TYPE_COLORS[comp.type] ?? 'text-slate-400';

  return (
    <div className="max-w-screen-lg mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button onClick={() => navigate(-1)} className="hover:text-slate-400 transition-colors flex items-center gap-1"><ArrowLeft size={12} /> Back</button>
        <ChevronRight size={10} />
        <Link to="/components" className="hover:text-slate-400">Components</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{comp.name}</span>
      </div>

      {/* Header */}
      <div className="sci-panel p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <p className={`text-xs font-mono-sc ${typeColor} uppercase tracking-widest mb-1`}>{comp.type}</p>
            <h1 className="font-orbitron text-2xl font-black text-slate-100">{comp.name}</h1>
            <div className="flex flex-wrap gap-2 mt-3">
              {comp.grade && <GlowBadge color="amber">{comp.grade}</GlowBadge>}
              {comp.size != null && <GlowBadge color="slate">S{comp.size}</GlowBadge>}
              {comp.sub_type && <GlowBadge color="slate">{comp.sub_type}</GlowBadge>}
              {comp.class && <GlowBadge color="slate">{comp.class}</GlowBadge>}
              {comp.manufacturer_name && <GlowBadge color="cyan">{comp.manufacturer_name}</GlowBadge>}
            </div>
          </div>
        </div>
        {comp.description && (
          <p className="mt-4 text-sm text-slate-500 leading-relaxed">{comp.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stats */}
        <ScifiPanel title="Specifications">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Mass', value: comp.mass != null ? `${comp.mass.toFixed(1)} kg` : '—' },
              { label: 'HP',   value: comp.hp != null ? comp.hp.toLocaleString('en-US') : '—' },
              { label: 'Power base', value: comp.power_base  != null ? `${comp.power_base.toFixed(0)} W`  : '—' },
              { label: 'Power draw', value: comp.power_draw  != null ? `${comp.power_draw.toFixed(0)} W`  : '—' },
              { label: 'Heat',       value: comp.heat_generation     != null ? `${comp.heat_generation.toFixed(0)}` : '—' },
              { label: 'EM sig.',    value: comp.em_signature        != null ? `${comp.em_signature.toFixed(0)}`    : '—' },
              { label: 'IR sig.',    value: comp.ir_signature        != null ? `${comp.ir_signature.toFixed(0)}`    : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="sci-panel p-2.5">
                <p className="text-xs text-slate-600 font-mono-sc uppercase">{label}</p>
                <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </ScifiPanel>

        {/* Buy locations */}
        <ScifiPanel title="Buy locations" subtitle={buyLocs ? `${buyLocs.length} locations` : undefined} actions={<MapPin size={14} className="text-slate-600" />}>
          {!buyLocs?.length ? (
            <p className="text-xs text-slate-600 italic py-4 text-center">No known buy locations</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {buyLocs.map((loc, i) => (
                <div key={i} className="sci-panel px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300 truncate">{loc.shop_name}</p>
                      <p className="text-xs text-slate-600 truncate">{loc.location}</p>
                    </div>
                    {loc.base_price != null && (
                      <span className="text-xs font-mono-sc text-amber-400 flex-shrink-0">{fCredits(loc.base_price)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScifiPanel>
      </div>

      {/* Ships using it */}
      {ships && ships.length > 0 && (
        <ScifiPanel title="Equipped ships" subtitle={`${ships.length} ships`} actions={<Rocket size={14} className="text-slate-600" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {ships.map((s, i) => <ShipCard key={s.uuid} ship={s} index={i} />)}
          </div>
        </ScifiPanel>
      )}
    </div>
  );
}
