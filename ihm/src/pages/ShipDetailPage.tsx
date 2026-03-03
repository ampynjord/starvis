import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, BarChart3, ChevronRight, Layers, Palette,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { StatBar } from '@/components/ui/StatBar';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { ShipCard } from '@/components/ship/ShipCard';
import { LoadoutTree } from '@/components/ship/LoadoutTree';
import {
  fCredits, fDimension, fMass, fSpeed, fTime,
} from '@/utils/formatters';
import { VARIANT_TYPE_LABELS } from '@/utils/constants';
import type { Hardpoint } from '@/types/api';

export default function ShipDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const { data: ship, isLoading, error, refetch } = useQuery({
    queryKey: ['ships.get', uuid],
    queryFn: () => api.ships.get(uuid!),
    enabled: !!uuid,
  });
  const { data: loadout } = useQuery({
    queryKey: ['ships.loadout', uuid],
    queryFn: () => api.ships.loadout(uuid!),
    enabled: !!uuid,
  });
  const { data: paints } = useQuery({
    queryKey: ['ships.paints', uuid],
    queryFn: () => api.ships.paints(uuid!),
    enabled: !!uuid,
  });
  const { data: stats } = useQuery({
    queryKey: ['ships.stats', uuid],
    queryFn: () => api.ships.stats(uuid!),
    enabled: !!uuid,
  });
  const { data: similar } = useQuery({
    queryKey: ['ships.similar', uuid],
    queryFn: () => api.ships.similar(uuid!, 4),
    enabled: !!uuid,
  });
  const { data: hardpoints } = useQuery({
    queryKey: ['ships.hardpoints', uuid],
    queryFn: () => api.ships.hardpoints(uuid!),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="CHARGEMENT DU VAISSEAU…" />;
  if (error)    return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!ship)    return null;

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button onClick={() => navigate(-1)} className="hover:text-slate-400 transition-colors flex items-center gap-1">
          <ArrowLeft size={12} /> Retour
        </button>
        <ChevronRight size={10} />
        <Link to="/ships" className="hover:text-slate-400 transition-colors">Vaisseaux</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{ship.name}</span>
      </div>

      {/* Ship hero */}
      <div className="sci-panel p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">
              {ship.manufacturer}
            </p>
            <h1 className="font-orbitron text-3xl font-black text-slate-100 leading-tight">
              {ship.name}
            </h1>
            {/* Badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              {ship.career && <GlowBadge color="cyan">{ship.career}</GlowBadge>}
              {ship.role && ship.role !== ship.career && <GlowBadge color="slate">{ship.role}</GlowBadge>}
              {ship.size != null && <GlowBadge color="slate">Taille {ship.size}</GlowBadge>}
              {ship.variant_type && ship.variant_type !== 'standard' && (
                <GlowBadge
                  color={ship.variant_type === 'collector' ? 'amber' : ship.variant_type === 'npc' ? 'red' : 'slate'}
                >
                  {VARIANT_TYPE_LABELS[ship.variant_type] ?? ship.variant_type}
                </GlowBadge>
              )}
              {ship.has_sm_link && <GlowBadge color="green">RSI Ship Matrix</GlowBadge>}
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0">
            <Link to={`/compare?a=${uuid}`} className="sci-btn-amber text-sm">
              <BarChart3 size={13} /> Comparer
            </Link>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Specs column */}
        <div className="space-y-4">
          {/* Dimensions */}
          <ScifiPanel title="Dimensions" subtitle="Mesures en mètres">
            <div className="grid grid-cols-2 gap-3">
              <SpecCell label="Longueur" value={fDimension(ship.length)} />
              <SpecCell label="Largeur"  value={fDimension(ship.width)} />
              <SpecCell label="Hauteur"  value={fDimension(ship.height)} />
              <SpecCell label="Masse"    value={fMass(ship.mass)} />
            </div>
          </ScifiPanel>

          {/* Crew */}
          <ScifiPanel title="Équipage">
            <div className="grid grid-cols-3 gap-3">
              <SpecCell label="Min"     value={ship.crew_min != null ? String(ship.crew_min) : '—'} />
              <SpecCell label="Max"     value={ship.crew_max != null ? String(ship.crew_max) : '—'} />
              <SpecCell label="Sorties" value={ship.number_of_exits != null ? String(ship.number_of_exits) : '—'} />
            </div>
          </ScifiPanel>

          {/* Cargo */}
          {ship.cargocapacity != null && (
            <ScifiPanel title="Cargo">
              <SpecCell label="Capacité" value={`${ship.cargocapacity.toLocaleString('fr-FR')} SCU`} />
            </ScifiPanel>
          )}

          {/* Insurance */}
          {ship.pledge_cost != null && (
            <ScifiPanel title="Assurance & Prix">
              <div className="space-y-2">
                <SpecCell label="Prix pledge" value={fCredits(ship.pledge_cost)} />
                <SpecCell label="Temps réclamation" value={fTime(ship.insurance_claim_time)} />
                <SpecCell label="Expédition" value={fCredits(ship.insurance_expedite_cost)} />
              </div>
            </ScifiPanel>
          )}
        </div>

        {/* Performance column */}
        <div className="space-y-4">
          <ScifiPanel title="Vitesse & Maniabilité">
            <div className="space-y-3">
              <StatBar label="SCM" displayValue={fSpeed(ship.scm_speed)} value={ship.scm_speed ?? 0} max={600} />
              <StatBar label="Afterburner" displayValue={fSpeed(ship.afterburner_speed)} value={ship.afterburner_speed ?? 0} max={1400} color="amber" />
              <StatBar label="Quantum" displayValue={ship.quantum_speed != null ? `${(ship.quantum_speed / 1e6).toFixed(0)} Mm/s` : '—'} value={ship.quantum_speed ?? 0} max={500e6} color="cyan" />
            </div>
          </ScifiPanel>

          <ScifiPanel title="Maniabilité (deg/s)">
            <div className="space-y-3">
              <StatBar label="Pitch" displayValue={ship.pitch != null ? `${ship.pitch.toFixed(0)}°/s` : '—'} value={ship.pitch ?? 0} max={90} />
              <StatBar label="Yaw"   displayValue={ship.yaw   != null ? `${ship.yaw.toFixed(0)}°/s`   : '—'} value={ship.yaw   ?? 0} max={90} />
              <StatBar label="Roll"  displayValue={ship.roll  != null ? `${ship.roll.toFixed(0)}°/s`   : '—'} value={ship.roll  ?? 0} max={90} color="amber" />
            </div>
          </ScifiPanel>

          {/* Hardpoints summary */}
          {stats && (
            <ScifiPanel title="Armement & systèmes" subtitle={`${stats.total_hardpoints} points d'emport`}>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(stats.by_type).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between px-2 py-1.5 sci-panel">
                    <span className="text-xs text-slate-500 truncate">{type}</span>
                    <span className="text-xs font-mono-sc text-cyan-400 ml-1">{count}</span>
                  </div>
                ))}
              </div>
            </ScifiPanel>
          )}
        </div>

        {/* Paints column */}
        <div className="space-y-4">
          {paints && paints.length > 0 && (
            <ScifiPanel title="Livrées disponibles" subtitle={`${paints.length} peintures`} actions={<Palette size={14} className="text-slate-600" />}>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {paints.map(p => (
                  <div key={p.uuid} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                    <div className="w-3 h-3 rounded-sm mt-0.5 flex-shrink-0 border border-cyan-800 bg-gradient-to-br from-cyan-900 to-blue-900" />
                    <span className="text-xs text-slate-400">{p.name}</span>
                  </div>
                ))}
              </div>
            </ScifiPanel>
          )}

          {/* Hardpoints detail */}
          {hardpoints && hardpoints.length > 0 && (
            <ScifiPanel title="Points d'emport" subtitle={`${hardpoints.length} slots`}>
              <div className="space-y-0.5 max-h-52 overflow-y-auto">
                {hardpoints.map((hp: Hardpoint) => (
                  <div key={hp.uuid} className="flex items-center justify-between px-2 py-1 rounded hover:bg-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono-sc text-slate-600 flex-shrink-0">S{hp.port_size ?? '?'}</span>
                      <span className="text-xs text-slate-400 truncate">{hp.parts_name}</span>
                    </div>
                    <span className="text-xs text-cyan-700 ml-2 flex-shrink-0">{hp.port_type}</span>
                  </div>
                ))}
              </div>
            </ScifiPanel>
          )}
        </div>
      </div>

      {/* Loadout */}
      {loadout && loadout.length > 0 && (
        <ScifiPanel title="Loadout par défaut" subtitle="Arborescence complète du vaisseau" actions={<Layers size={14} className="text-slate-600" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {loadout.map((node, i) => (
              <LoadoutTree key={i} node={node} />
            ))}
          </div>
        </ScifiPanel>
      )}

      {/* Similar ships */}
      {similar && similar.length > 0 && (
        <ScifiPanel title="Vaisseaux similaires" subtitle="Même rôle ou gabarit">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {similar.map((s, i) => (
              <ShipCard key={s.uuid} ship={s} index={i} />
            ))}
          </div>
        </ScifiPanel>
      )}
    </div>
  );
}

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="sci-panel p-2.5">
      <p className="text-xs text-slate-600 font-mono-sc uppercase">{label}</p>
      <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{value}</p>
    </div>
  );
}
