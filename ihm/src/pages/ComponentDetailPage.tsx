import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MapPin, Rocket } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { CanonicalMeta } from '@/components/ui/CanonicalMeta';
import { ShipCard } from '@/components/ship/ShipCard';
import { COMPONENT_TYPE_COLORS } from '@/utils/constants';
import { fCredits } from '@/utils/formatters';

function fmtNum(v: number | null | undefined, unit = '', digits = 0): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  if (digits > 0) return `${n.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
  return `${n.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
}

export default function ComponentDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const router = useRouter();
  const { env } = useEnv();

  const { data: comp, isLoading, error, refetch } = useQuery({
    queryKey: ['components.get', uuid, env],
    queryFn: () => api.components.get(uuid!, env),
    enabled: !!uuid,
  });
  const { data: ships } = useQuery({
    queryKey: ['components.ships', uuid, env],
    queryFn: () => api.components.ships(uuid!, env),
    enabled: !!uuid,
  });
  const { data: buyLocs } = useQuery({
    queryKey: ['components.buyLocs', uuid, env],
    queryFn: () => api.components.buyLocations(uuid!, env),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="LOADING COMPONENT…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!comp) return null;

  const typeColor = COMPONENT_TYPE_COLORS[comp.type] ?? 'text-slate-400';

  const baseSpecs = [
    { label: 'Mass', value: fmtNum(comp.mass, 'kg', 2) },
    { label: 'HP', value: fmtNum(comp.hp) },
    { label: 'Power base', value: fmtNum(comp.power_base, 'W') },
    { label: 'Power draw', value: fmtNum(comp.power_draw, 'W') },
    { label: 'Power output', value: fmtNum(comp.power_output, 'W') },
    { label: 'Heat generation', value: fmtNum(comp.heat_generation) },
    { label: 'Cooling rate', value: fmtNum(comp.cooling_rate) },
    { label: 'EM signature', value: fmtNum(comp.em_signature) },
    { label: 'IR signature', value: fmtNum(comp.ir_signature) },
  ];

  const combatSpecs = [
    { label: 'Weapon damage', value: fmtNum(comp.weapon_damage, '', 2) },
    { label: 'Damage type', value: comp.weapon_damage_type ?? '—' },
    { label: 'Fire rate', value: fmtNum(comp.weapon_fire_rate, 'rpm', 2) },
    { label: 'Weapon range', value: fmtNum(comp.weapon_range, 'm', 1) },
    { label: 'Projectile speed', value: fmtNum(comp.weapon_speed, 'm/s', 1) },
    { label: 'Ammo', value: fmtNum(comp.weapon_ammo_count) },
    { label: 'Alpha damage', value: fmtNum(comp.weapon_alpha_damage, '', 2) },
    { label: 'DPS', value: fmtNum(comp.weapon_dps, '', 2) },
    { label: 'Burst DPS', value: fmtNum(comp.weapon_burst_dps, '', 2) },
    { label: 'Sustained DPS', value: fmtNum(comp.weapon_sustained_dps, '', 2) },
    { label: 'Shield HP', value: fmtNum(comp.shield_hp) },
    { label: 'Shield regen', value: fmtNum(comp.shield_regen, '', 2) },
    { label: 'Shield regen delay', value: fmtNum(comp.shield_regen_delay, 's', 2) },
    { label: 'Missile damage', value: fmtNum(comp.missile_damage, '', 2) },
    { label: 'Missile speed', value: fmtNum(comp.missile_speed, 'm/s', 1) },
    { label: 'Missile range', value: fmtNum(comp.missile_range, 'm', 1) },
  ];

  const utilitySpecs = [
    { label: 'Quantum speed', value: fmtNum(comp.qd_speed, 'km/s', 2) },
    { label: 'Quantum spool', value: fmtNum(comp.qd_spool_time, 's', 2) },
    { label: 'Quantum range', value: fmtNum(comp.qd_range, 'Gm', 2) },
    { label: 'Quantum fuel rate', value: fmtNum(comp.qd_fuel_rate, 'units/s', 4) },
    { label: 'Radar range', value: fmtNum(comp.radar_range, 'm', 1) },
    { label: 'Thruster thrust', value: fmtNum(comp.thruster_max_thrust, 'N', 2) },
    { label: 'Tractor force', value: fmtNum(comp.tractor_max_force, 'N', 2) },
    { label: 'Mining speed', value: fmtNum(comp.mining_speed, '', 4) },
    { label: 'Salvage speed', value: fmtNum(comp.salvage_speed, '', 4) },
  ];

  const rawPayload = comp.game_data ?? comp.data_json ?? null;

  return (
    <div className="max-w-screen-lg mx-auto space-y-6">
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button onClick={() => router.push(-1)} className="hover:text-slate-400 transition-colors flex items-center gap-1"><ArrowLeft size={12} /> Back</button>
        <ChevronRight size={10} />
        <Link href="/components" className="hover:text-slate-400">Components</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{comp.name}</span>
      </div>

      <div className="sci-panel p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <p className={`text-xs font-mono-sc ${typeColor} uppercase tracking-widest mb-1`}>{comp.type}</p>
            <h1 className="font-orbitron text-2xl font-black text-slate-100">{comp.name}</h1>
            <div className="flex flex-wrap gap-2 mt-3">
              {comp.grade && <GlowBadge color="amber">{comp.grade}</GlowBadge>}
              {comp.size != null && <GlowBadge color="slate">S{comp.size}</GlowBadge>}
              {comp.sub_type && <GlowBadge color="slate">{comp.sub_type}</GlowBadge>}
              {comp.class_name && <GlowBadge color="slate">{comp.class_name}</GlowBadge>}
              {comp.manufacturer_name && <GlowBadge color="cyan">{comp.manufacturer_name}</GlowBadge>}
            </div>
            <CanonicalMeta
              className="mt-4"
              sourceType={comp.source_type}
              sourceName={comp.source_name}
              confidenceScore={comp.confidence_score}
              canonicalKey={comp.canonical_component_key}
              normalizedName={comp.normalized_name}
            />
          </div>
        </div>
        {comp.description && <p className="mt-4 text-sm text-slate-500 leading-relaxed">{comp.description}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScifiPanel title="Core Specifications">
          <div className="grid grid-cols-2 gap-2">
            {baseSpecs.filter(s => s.value !== '—').map(({ label, value }) => (
              <div key={label} className="sci-panel p-2.5">
                <p className="text-xs text-slate-600 font-mono-sc uppercase">{label}</p>
                <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </ScifiPanel>

        <ScifiPanel title="Buy Locations" subtitle={buyLocs ? `${buyLocs.length} locations` : undefined} actions={<MapPin size={14} className="text-slate-600" />}>
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
                      <CanonicalMeta
                        compact
                        className="mt-1"
                        sourceType={loc.inventory_source_type ?? loc.shop_source_type}
                        sourceName={loc.inventory_source_name ?? loc.shop_source_name}
                        confidenceScore={loc.confidence_score}
                      />
                    </div>
                    {loc.base_price != null && <span className="text-xs font-mono-sc text-amber-400 flex-shrink-0">{fCredits(loc.base_price)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScifiPanel>
      </div>

      {(combatSpecs.some(s => s.value !== '—') || utilitySpecs.some(s => s.value !== '—')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {combatSpecs.some(s => s.value !== '—') && (
            <ScifiPanel title="Combat Stats">
              <div className="grid grid-cols-2 gap-2">
                {combatSpecs.filter(s => s.value !== '—').map(({ label, value }) => (
                  <div key={label} className="sci-panel p-2.5">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase">{label}</p>
                    <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </ScifiPanel>
          )}

          {utilitySpecs.some(s => s.value !== '—') && (
            <ScifiPanel title="Flight / Utility Stats">
              <div className="grid grid-cols-2 gap-2">
                {utilitySpecs.filter(s => s.value !== '—').map(({ label, value }) => (
                  <div key={label} className="sci-panel p-2.5">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase">{label}</p>
                    <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </ScifiPanel>
          )}
        </div>
      )}

      {ships && ships.length > 0 && (
        <ScifiPanel title="Equipped Ships" subtitle={`${ships.length} ships`} actions={<Rocket size={14} className="text-slate-600" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {ships.map((s, i) => <ShipCard key={s.uuid} ship={s} index={i} />)}
          </div>
        </ScifiPanel>
      )}

      {rawPayload && (
        <ScifiPanel title="Raw Game Data" subtitle="Parsed payload from extractor">
          <pre className="max-h-96 overflow-auto text-xs text-slate-400 font-mono-sc leading-relaxed">{JSON.stringify(rawPayload, null, 2)}</pre>
        </ScifiPanel>
      )}
    </div>
  );
}
