import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, BarChart3, ChevronRight, Clock, ExternalLink,
  Layers, Palette, Ruler, Users,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { ShipCard } from '@/components/ship/ShipCard';
import { ShipLoadout } from '@/components/ship/ShipLoadout';
import { ShipStatsBanner } from '@/components/ship/ShipStatsBanner';
import { CargoGrid } from '@/components/ship/CargoGrid';
import {
  fCredits, fMass,
} from '@/utils/formatters';
import { VARIANT_TYPE_LABELS } from '@/utils/constants';

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
  const { data: similar } = useQuery({
    queryKey: ['ships.similar', uuid],
    queryFn: () => api.ships.similar(uuid!, 4),
    enabled: !!uuid,
  });
  if (isLoading) return <LoadingGrid message="LOADING SHIP…" />;
  if (error)    return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!ship)    return null;

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button onClick={() => navigate(-1)} className="hover:text-slate-400 transition-colors flex items-center gap-1">
          <ArrowLeft size={12} /> Back
        </button>
        <ChevronRight size={10} />
        <Link to="/ships" className="hover:text-slate-400 transition-colors">Ships</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{ship.name}</span>
      </div>

      {/* Ship hero */}
      <div className="sci-panel overflow-hidden">
        {/* Bannière pleine largeur */}
        {(ship.thumbnail_large ?? ship.thumbnail) && (
          <div className="relative w-full h-52 bg-slate-900/80">
            <img
              src={(ship.thumbnail_large ?? ship.thumbnail)!}
              alt={ship.name}
              className="w-full h-full object-cover opacity-80"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0A1628] to-transparent" />
          </div>
        )}
        {/* Contenu */}
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">
                {ship.manufacturer_name}
              </p>
              <h1 className="font-orbitron text-3xl font-black text-slate-100 leading-tight">
                {ship.name}
              </h1>
              {/* Badges */}
              <div className="flex flex-wrap gap-2 mt-3">
                {ship.career && <GlowBadge color="cyan">{ship.career}</GlowBadge>}
                {ship.role && ship.role !== ship.career && <GlowBadge color="slate">{ship.role}</GlowBadge>}
                {ship.vehicle_category && ship.vehicle_category !== 'ship' && <GlowBadge color="slate">{ship.vehicle_category}</GlowBadge>}
                {ship.variant_type && ship.variant_type !== 'standard' && (
                  <GlowBadge
                    color={ship.variant_type === 'collector' ? 'amber' : ship.variant_type === 'npc' ? 'red' : 'slate'}
                  >
                    {VARIANT_TYPE_LABELS[ship.variant_type] ?? ship.variant_type}
                  </GlowBadge>
                )}
                {ship.ship_matrix_id != null && <GlowBadge color="green">RSI Link</GlowBadge>}
              </div>
            </div>
            {/* Actions */}
            <div className="flex flex-col items-start gap-2 flex-shrink-0">
              <Link to={`/compare?a=${uuid}`} className="sci-btn-amber text-sm">
                <BarChart3 size={13} /> Compare
              </Link>
              {ship.store_url && (
                <a
                  href={ship.store_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono-sc text-slate-500 hover:text-cyan-400 transition-colors"
                >
                  <ExternalLink size={11} /> RSI Store
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Specs column */}
        <div className="space-y-4">

          {/* ── Dimensions ── */}
          <ScifiPanel title="Dimensions" actions={<Ruler size={13} className="text-slate-600" />}>
            {(() => {
              const L = Number(ship.size_y) || 0;  // size_y = length (forward axis)
              const W = Number(ship.size_x) || 0;  // size_x = width/beam
              const H = Number(ship.size_z) || 0;  // size_z = height
              const maxDim = Math.max(L, W, H, 1);
              const scale = 48;
              const lp = Math.max((L / maxDim) * scale, 4); // length  → left axis
              const wp = Math.max((W / maxDim) * scale, 4); // width   → right axis
              const hp = Math.max((H / maxDim) * scale, 4); // height  → up axis
              const c = 0.866, s = 0.5; // cos30°, sin30°
              const pad = 20;
              // anchor: front-bottom vertex (Bf)
              const ax = lp * c + pad;
              const ay = (lp + wp) * s + hp + pad;
              type V = [number, number];
              // 8 vertices
              const Bf: V = [ax,                    ay           ];
              const Bl: V = [ax - lp*c,             ay - lp*s    ]; // back via length
              const Br: V = [ax + wp*c,             ay - wp*s    ]; // right via width
              const Bb: V = [ax - lp*c + wp*c,      ay - lp*s - wp*s];
              const Tf: V = [Bf[0],                 Bf[1] - hp   ];
              const Tl: V = [Bl[0],                 Bl[1] - hp   ];
              const Tr: V = [Br[0],                 Br[1] - hp   ];
              const Tb: V = [Bb[0],                 Bb[1] - hp   ];
              const svgW = (lp + wp) * c + pad * 2;
              const svgH = (lp + wp) * s + hp + pad * 2;
              const seg = (a: V, b: V, props: React.SVGProps<SVGLineElement>) => (
                <line x1={a[0].toFixed(1)} y1={a[1].toFixed(1)}
                      x2={b[0].toFixed(1)} y2={b[1].toFixed(1)} {...props} />
              );
              const tick = (a: V, b: V, d: V) => {
                const mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2;
                return <line x1={(mx+d[0]).toFixed(1)} y1={(my+d[1]).toFixed(1)}
                             x2={(mx-d[0]).toFixed(1)} y2={(my-d[1]).toFixed(1)}
                             stroke="rgba(100,116,139,0.6)" strokeWidth="0.6" />;
              };
              return (
                <div className="space-y-2">
                  <svg viewBox={`0 0 ${svgW.toFixed(0)} ${svgH.toFixed(0)}`}
                       className="w-full" style={{ maxHeight: '140px' }}>
                    <defs>
                      <marker id="aL" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                        <polygon points="0,0 4,2 0,4" fill="rgb(52,211,153)" />
                      </marker>
                      <marker id="aW" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                        <polygon points="0,0 4,2 0,4" fill="rgb(251,191,36)" />
                      </marker>
                      <marker id="aH" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                        <polygon points="0,0 4,2 0,4" fill="rgb(34,211,238)" />
                      </marker>
                    </defs>

                    {/* ── Hidden edges (dashed, muted) ── */}
                    {seg(Bl, Bb, { stroke:'rgba(100,116,139,0.35)', strokeWidth:'0.7', strokeDasharray:'2,2' })}
                    {seg(Br, Bb, { stroke:'rgba(100,116,139,0.35)', strokeWidth:'0.7', strokeDasharray:'2,2' })}
                    {seg(Bf, Bb, { stroke:'rgba(100,116,139,0.35)', strokeWidth:'0.7', strokeDasharray:'2,2' })}

                    {/* ── Visible edges (solid, slate) ── */}
                    {seg(Bf, Bl, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}
                    {seg(Bf, Br, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}
                    {seg(Bf, Tf, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}
                    {seg(Bl, Tl, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}
                    {seg(Br, Tr, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}
                    {seg(Tf, Tl, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}
                    {seg(Tf, Tr, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}
                    {seg(Tl, Tb, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}
                    {seg(Tr, Tb, { stroke:'rgba(148,163,184,0.55)', strokeWidth:'0.8' })}

                    {/* ── Axis dimension lines (outside the box) ── */}
                    {/* Length axis — left, emerald */}
                    {L > 0 && <>
                      {seg(Bf, Bl, { stroke:'rgb(52,211,153)', strokeWidth:'1', markerEnd:'url(#aL)', opacity:0.7 })}
                      {tick(Bf, Bl, [lp*s*0.15, -lp*c*0.15] as V)}
                      {tick(Bl, Bf, [lp*s*0.15, -lp*c*0.15] as V)}
                      <text x={((Bf[0]+Bl[0])/2 - lp*s*0.22).toFixed(1)}
                            y={((Bf[1]+Bl[1])/2 - lp*c*0.10 + 3).toFixed(1)}
                            fontSize="6.5" fill="rgb(52,211,153)" textAnchor="middle"
                            fontFamily="monospace" fontWeight="bold">
                        {L.toFixed(0)} m
                      </text>
                    </>}

                    {/* Width axis — right, amber */}
                    {W > 0 && <>
                      {seg(Bf, Br, { stroke:'rgb(251,191,36)', strokeWidth:'1', markerEnd:'url(#aW)', opacity:0.7 })}
                      {tick(Bf, Br, [wp*s*0.15, wp*c*0.15] as V)}
                      {tick(Br, Bf, [wp*s*0.15, wp*c*0.15] as V)}
                      <text x={((Bf[0]+Br[0])/2 + wp*s*0.22).toFixed(1)}
                            y={((Bf[1]+Br[1])/2 - wp*c*0.10 + 3).toFixed(1)}
                            fontSize="6.5" fill="rgb(251,191,36)" textAnchor="middle"
                            fontFamily="monospace" fontWeight="bold">
                        {W.toFixed(0)} m
                      </text>
                    </>}

                    {/* Height axis — vertical, cyan */}
                    {H > 0 && <>
                      {seg(Br, Tr, { stroke:'rgb(34,211,238)', strokeWidth:'1', markerEnd:'url(#aH)', opacity:0.7 })}
                      {tick(Br, Tr, [3, 0] as V)}
                      {tick(Tr, Br, [3, 0] as V)}
                      <text x={(Br[0] + 8).toFixed(1)}
                            y={((Br[1]+Tr[1])/2 + 2).toFixed(1)}
                            fontSize="6.5" fill="rgb(34,211,238)" textAnchor="start"
                            fontFamily="monospace" fontWeight="bold">
                        {H.toFixed(0)} m
                      </text>
                    </>}
                  </svg>

                  {/* Legend */}
                  <div className="flex gap-4 items-center">
                    <span className="flex items-center gap-1 text-[9px] font-mono-sc text-emerald-600">
                      <span className="w-3 h-px bg-emerald-600 inline-block" /> L
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-mono-sc text-amber-500">
                      <span className="w-3 h-px bg-amber-500 inline-block" /> W
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-mono-sc text-cyan-500">
                      <span className="w-3 h-px bg-cyan-500 inline-block" /> H
                    </span>
                    {ship.mass != null && (
                      <span className="text-[9px] font-mono-sc text-slate-700 ml-auto">{fMass(ship.mass)}</span>
                    )}
                  </div>
                </div>
              );
            })()}
          </ScifiPanel>

          {/* ── Crew & Cargo ── */}
          <ScifiPanel title="Crew & Cargo">
            <div className="space-y-4">
              {/* Crew pips */}
              {(() => {
                // Priorité : ship_matrix min/max_crew, sinon P4K crew_size
                const minC = ship.min_crew != null ? Number(ship.min_crew) : (ship.crew_size ?? null);
                const maxC = ship.max_crew != null ? Number(ship.max_crew) : (ship.crew_size ?? null);
                if (maxC == null) return null;
                const crewLabel = minC != null && maxC !== minC ? `${minC} – ${maxC}` : String(maxC);
                const pipCount = Math.min(maxC, 16);
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">
                        <Users size={10} /> Crew
                      </span>
                      <span className="text-sm font-orbitron font-bold text-teal-400 tabular-nums">{crewLabel}</span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {Array.from({ length: pipCount }).map((_, i) => (
                        <div key={i} className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                          minC != null && i < minC ? 'bg-teal-900/60 border-teal-700/50' : 'bg-teal-900/30 border-teal-800/40'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${minC != null && i < minC ? 'bg-teal-500' : 'bg-teal-700'}`} />
                        </div>
                      ))}
                      {maxC > 16 && (
                        <div className="w-4 h-4 rounded-sm bg-teal-900/40 border border-teal-800/40 flex items-center justify-center">
                          <span className="text-[7px] font-mono-sc text-teal-600">+{maxC - 16}</span>
                        </div>
                      )}
                    </div>
                    {minC != null && maxC !== minC && (
                      <p className="text-[9px] font-mono-sc text-slate-600 mt-1.5">
                        <span className="text-teal-700">{minC} min</span> · <span className="text-teal-500">{maxC} max</span>
                      </p>
                    )}
                  </div>
                );
              })()}
              {/* Cargo */}
              {ship.cargo_capacity != null && ship.cargo_capacity > 0 && (
                <CargoGrid scu={Number(ship.cargo_capacity)} shipName={ship.name} />
              )}
            </div>
          </ScifiPanel>

          {/* ── Insurance ── */}
          {(ship.insurance_claim_time != null || ship.insurance_expedite_cost != null) && (
            <ScifiPanel title="Insurance" actions={<Clock size={13} className="text-slate-600" />}>
              {ship.insurance_claim_time != null && (() => {
                const claimMin = Number(ship.insurance_claim_time);
                // Idris M = 253 min (le plus long à claim) → 100% de la barre
                const MAX_CLAIM = 253;
                const color     = claimMin < 60 ? 'bg-emerald-600' : claimMin < 120 ? 'bg-amber-500' : 'bg-red-600';
                const textColor = claimMin < 60 ? 'text-emerald-400' : claimMin < 120 ? 'text-amber-400' : 'text-red-400';
                const pct = Math.min(100, (claimMin / MAX_CLAIM) * 100);
                // ticks à 60, 120, 180 minutes
                const ticks = [60, 120, 180].map(t => ({ min: t, pct: (t / MAX_CLAIM) * 100 }));
                return (
                  <div className="mb-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Claim time</span>
                      <span className={`text-sm font-orbitron font-bold tabular-nums ${textColor}`}>
                        {claimMin.toFixed(1)} <span className="text-[10px]">min</span>
                      </span>
                    </div>
                    {/* Timeline bar (0 → Idris M = 253 min) */}
                    <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      {ticks.map(({ min, pct: tp }) => (
                        <div key={min} className="absolute top-0 bottom-0 w-px bg-slate-700/50" style={{ left: `${tp}%` }} />
                      ))}
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[8px] font-mono-sc text-slate-800">0</span>
                      {ticks.map(({ min }) => (
                        <span key={min} className="text-[8px] font-mono-sc text-slate-800">{min}</span>
                      ))}
                      <span className="text-[8px] font-mono-sc text-slate-800">253min</span>
                    </div>
                  </div>
                );
              })()}
              {ship.insurance_expedite_cost != null && (
                <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                  <span className="text-[10px] font-mono-sc text-slate-700 uppercase tracking-widest">Expedite</span>
                  <span className="text-[11px] font-mono-sc text-amber-500 tabular-nums">
                    {fCredits(ship.insurance_expedite_cost)}
                  </span>
                </div>
              )}
            </ScifiPanel>
          )}
        </div>

        {/* Performance column */}
        <div className="space-y-4">
          <ScifiPanel title="Combat & Speed">
            <ShipStatsBanner ship={ship} loadout={loadout ?? []} />
          </ScifiPanel>
        </div>

        {/* Paints column */}
        <div className="space-y-4">
          {paints && paints.length > 0 && (
            <ScifiPanel title="Available paints" subtitle={`${paints.length} paints`} actions={<Palette size={14} className="text-slate-600" />}>
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {paints.map(p => (
                  <div key={p.paint_uuid} className="px-2 py-1.5 rounded hover:bg-white/5">
                    <span className="text-xs font-mono-sc text-slate-400">{p.paint_name}</span>
                  </div>
                ))}
              </div>
            </ScifiPanel>
          )}
        </div>
      </div>

      {/* Loadout */}
      {loadout && loadout.length > 0 && (
        <ScifiPanel title="Default loadout" subtitle="Composants par défaut" actions={<Layers size={14} className="text-slate-600" />}>
          <ShipLoadout nodes={loadout} />
        </ScifiPanel>
      )}

      {/* Similar ships */}
      {similar && similar.length > 0 && (
        <ScifiPanel title="Similar ships" subtitle="Same role or size class">
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


