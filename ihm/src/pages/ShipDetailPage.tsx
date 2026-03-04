import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, BarChart3, ChevronRight, Clock, ExternalLink,
  Layers, Package, Palette, Ruler, Users,
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
import {
  fCredits, fDimension, fMass,
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
              const L = Number(ship.cross_section_z) || 0; // Length
              const W = Number(ship.cross_section_x) || 0; // Width
              const H = Number(ship.cross_section_y) || 0; // Height
              const maxDim = Math.max(L, W, H, 1);
              const scale = 52;
              const lp = Math.max((L / maxDim) * scale, 3);
              const wp = Math.max((W / maxDim) * scale, 3);
              const hp = Math.max((H / maxDim) * scale, 3);
              const c = 0.866, s = 0.5; // cos30, sin30
              const pad = 12;
              // Anchor = front-bottom vertex
              const ax = lp * c + pad;
              const ay = (lp + wp) * s + hp + pad;
              // 4 bottom
              const Bf = [ax,             ay            ];
              const Bl = [ax - lp*c,      ay - lp*s     ]; // Length direction (left)
              const Br = [ax + wp*c,      ay - wp*s     ]; // Width direction (right)
              const Bb = [ax - lp*c+wp*c, ay - lp*s-wp*s];
              // 4 top
              const Tf = [Bf[0], Bf[1] - hp];
              const Tl = [Bl[0], Bl[1] - hp];
              const Tr = [Br[0], Br[1] - hp];
              const Tb = [Bb[0], Bb[1] - hp];
              const svgW = (lp + wp) * c + pad * 2;
              const svgH = (lp + wp) * s + hp + pad * 2;
              const pts = (...vs: number[][]) =>
                vs.map(v => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join(' ');
              return (
                <div className="space-y-3">
                  <svg
                    viewBox={`0 0 ${svgW.toFixed(0)} ${svgH.toFixed(0)}`}
                    className="w-full"
                    style={{ maxHeight: '130px' }}
                  >
                    {/* Left face — Length × Height — emerald */}
                    <polygon points={pts(Bf, Bl, Tl, Tf)}
                      fill="rgba(5,150,105,0.12)" stroke="rgb(5,150,105)" strokeWidth="1" />
                    {/* Right face — Width × Height — amber */}
                    <polygon points={pts(Bf, Br, Tr, Tf)}
                      fill="rgba(245,158,11,0.12)" stroke="rgb(245,158,11)" strokeWidth="1" />
                    {/* Top face — Length × Width — cyan */}
                    <polygon points={pts(Tf, Tl, Tb, Tr)}
                      fill="rgba(8,145,178,0.15)" stroke="rgb(8,145,178)" strokeWidth="1" />
                    {/* Labels */}
                    <text x={(Bf[0]+Bl[0])/2 - 4} y={(Bf[1]+Bl[1])/2 + 1}
                      fontSize="6" fill="rgb(52,211,153)" textAnchor="end" fontFamily="monospace">
                      {L > 0 ? `${L.toFixed(0)}m` : ''}
                    </text>
                    <text x={(Bf[0]+Br[0])/2 + 4} y={(Bf[1]+Br[1])/2 + 1}
                      fontSize="6" fill="rgb(251,191,36)" textAnchor="start" fontFamily="monospace">
                      {W > 0 ? `${W.toFixed(0)}m` : ''}
                    </text>
                    <text x={Bf[0] + 4} y={(Bf[1]+Tf[1])/2 + 2}
                      fontSize="6" fill="rgb(34,211,238)" textAnchor="start" fontFamily="monospace">
                      {H > 0 ? `${H.toFixed(0)}m` : ''}
                    </text>
                  </svg>
                  {/* Légende axes */}
                  <div className="flex gap-4">
                    <span className="text-[9px] font-mono-sc text-emerald-600">L {fDimension(ship.cross_section_z)}</span>
                    <span className="text-[9px] font-mono-sc text-amber-600">W {fDimension(ship.cross_section_x)}</span>
                    <span className="text-[9px] font-mono-sc text-cyan-600">H {fDimension(ship.cross_section_y)}</span>
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
              {ship.crew_size != null && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">
                      <Users size={10} /> Crew
                    </span>
                    <span className="text-sm font-orbitron font-bold text-teal-400 tabular-nums">{ship.crew_size}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: Math.min(ship.crew_size, 16) }).map((_, i) => (
                      <div key={i} className="w-4 h-4 rounded-sm bg-teal-900/60 border border-teal-700/50 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                      </div>
                    ))}
                    {ship.crew_size > 16 && (
                      <div className="w-4 h-4 rounded-sm bg-teal-900/40 border border-teal-800/40 flex items-center justify-center">
                        <span className="text-[7px] font-mono-sc text-teal-600">+{ship.crew_size - 16}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Cargo */}
              {ship.cargo_capacity != null && ship.cargo_capacity > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">
                      <Package size={10} /> Cargo
                    </span>
                    <span className="text-sm font-orbitron font-bold text-emerald-400 tabular-nums">
                      {ship.cargo_capacity.toLocaleString('en-US')} <span className="text-[10px] text-emerald-700">SCU</span>
                    </span>
                  </div>
                  {/* Cargo blocks grid — 1 block = 10 SCU, max 50 blocks */}
                  {(() => {
                    const blockSize = ship.cargo_capacity >= 500 ? 100 : ship.cargo_capacity >= 100 ? 20 : ship.cargo_capacity >= 20 ? 5 : 1;
                    const blocks = Math.min(Math.round(ship.cargo_capacity / blockSize), 40);
                    return (
                      <div className="flex flex-wrap gap-0.5">
                        {Array.from({ length: blocks }).map((_, i) => (
                          <div
                            key={i}
                            className="w-3 h-3 rounded-sm bg-emerald-900/70 border border-emerald-700/30"
                          />
                        ))}
                        {Math.round(ship.cargo_capacity / blockSize) > 40 && (
                          <span className="text-[9px] font-mono-sc text-emerald-800 self-end">…</span>
                        )}
                      </div>
                    );
                  })()}
                  <p className="text-[9px] font-mono-sc text-slate-800 mt-1">1 block = {ship.cargo_capacity >= 500 ? 100 : ship.cargo_capacity >= 100 ? 20 : ship.cargo_capacity >= 20 ? 5 : 1} SCU</p>
                </div>
              )}
            </div>
          </ScifiPanel>

          {/* ── Insurance ── */}
          {(ship.insurance_claim_time != null || ship.insurance_expedite_cost != null) && (
            <ScifiPanel title="Insurance" actions={<Clock size={13} className="text-slate-600" />}>
              {ship.insurance_claim_time != null && (() => {
                const claimMin = Number(ship.insurance_claim_time);
                // 0–15 min = fast (green), 15–45 = normal (amber), >45 = slow (red)
                const color    = claimMin < 15 ? 'bg-emerald-600' : claimMin < 45 ? 'bg-amber-500' : 'bg-red-600';
                const textColor= claimMin < 15 ? 'text-emerald-400' : claimMin < 45 ? 'text-amber-400' : 'text-red-400';
                const pct = Math.min(100, (claimMin / 60) * 100);
                return (
                  <div className="mb-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Claim time</span>
                      <span className={`text-sm font-orbitron font-bold tabular-nums ${textColor}`}>
                        {claimMin.toFixed(1)} <span className="text-[10px]">min</span>
                      </span>
                    </div>
                    {/* Timeline bar */}
                    <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      {/* tick marks at 15, 30, 45 min */}
                      {[25, 50, 75].map(t => (
                        <div key={t} className="absolute top-0 bottom-0 w-px bg-slate-700/50" style={{ left: `${t}%` }} />
                      ))}
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[8px] font-mono-sc text-slate-800">0</span>
                      <span className="text-[8px] font-mono-sc text-slate-800">15</span>
                      <span className="text-[8px] font-mono-sc text-slate-800">30</span>
                      <span className="text-[8px] font-mono-sc text-slate-800">45</span>
                      <span className="text-[8px] font-mono-sc text-slate-800">60min</span>
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


