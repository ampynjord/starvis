import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { CanonicalMeta } from '@/components/ui/CanonicalMeta';
import { fCredits } from '@/utils/formatters';

function fmtNum(v: number | null | undefined, unit = '', digits = 0): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  if (digits > 0) return `${n.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
  return `${n.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
}

export default function ItemDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const router = useRouter();
  const { env } = useEnv();

  const { data: item, isLoading, error, refetch } = useQuery({
    queryKey: ['items.get', uuid, env],
    queryFn: () => api.items.get(uuid!, env),
    enabled: !!uuid,
  });

  const { data: buyLocs } = useQuery({
    queryKey: ['items.buyLocs', uuid, env],
    queryFn: () => api.items.buyLocations(uuid!, env),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="LOADING ITEM…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!item) return null;

  const isWeapon = !!item.weapon_damage || !!item.weapon_fire_rate || item.type?.toLowerCase().includes('weapon') || item.sub_type?.toLowerCase().includes('fps');
  const isArmor =
    !!item.armor_damage_reduction ||
    !!item.armor_temp_min ||
    !!item.armor_temp_max ||
    item.type?.toLowerCase().includes('armor') ||
    item.type?.toLowerCase().includes('suit') ||
    item.type?.toLowerCase().includes('helmet') ||
    item.type?.toLowerCase().includes('undersuit') ||
    item.type?.toLowerCase().includes('backpack');

  const isFpsCategory = /(helmet|armor|undersuit|clothing|backpack|weapon|ammo|munition|grenade|magazine|tool|module|attachment|medical|medpen|paramed|food|drink|gadget)/i.test(item.type ?? '');
  const breadcrumbTo = isFpsCategory ? '/fps-gear' : '/other-items';
  const breadcrumbLabel = isFpsCategory ? 'FPS Gear' : 'Other Items';

  const weaponStats = [
    { label: 'Damage', value: fmtNum(item.weapon_damage, '', 2) },
    { label: 'Damage type', value: item.weapon_damage_type ?? '—' },
    { label: 'Fire rate', value: fmtNum(item.weapon_fire_rate, 'rpm', 2) },
    { label: 'Range', value: fmtNum(item.weapon_range, 'm', 1) },
    { label: 'Projectile speed', value: fmtNum(item.weapon_speed, 'm/s', 1) },
    { label: 'Ammo', value: fmtNum(item.weapon_ammo_count) },
    { label: 'DPS', value: fmtNum(item.weapon_dps, '', 2) },
  ];

  const armorStats = [
    { label: 'Damage reduction', value: fmtNum(item.armor_damage_reduction, '%', 2) },
    { label: 'Min temperature', value: fmtNum(item.armor_temp_min, '°C', 1) },
    { label: 'Max temperature', value: fmtNum(item.armor_temp_max, '°C', 1) },
  ];

  const rawPayload = item.game_data ?? item.data_json ?? null;

  return (
    <div className="max-w-screen-lg mx-auto space-y-6">
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button onClick={() => router.push(-1)} className="hover:text-slate-400 transition-colors flex items-center gap-1"><ArrowLeft size={12} /> Back</button>
        <ChevronRight size={10} />
        <Link href={breadcrumbTo} className="hover:text-slate-400">{breadcrumbLabel}</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{item.name}</span>
      </div>

      <div className="sci-panel p-6">
        <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">{item.type}</p>
        <h1 className="font-orbitron text-2xl font-black text-slate-100">{item.name}</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          {item.grade && <GlowBadge color="amber">{item.grade}</GlowBadge>}
          {item.size != null && <GlowBadge color="slate">S{item.size}</GlowBadge>}
          {item.sub_type && <GlowBadge color="slate">{item.sub_type}</GlowBadge>}
          {item.class_name && <GlowBadge color="slate">{item.class_name}</GlowBadge>}
          {item.manufacturer_name && <GlowBadge color="cyan">{item.manufacturer_name}</GlowBadge>}
        </div>
        <div className="flex gap-6 mt-4">
          {item.mass != null && <span className="text-xs font-mono-sc text-slate-500">MASS <span className="text-slate-300">{fmtNum(item.mass, 'kg', 2)}</span></span>}
          {item.hp != null && <span className="text-xs font-mono-sc text-slate-500">HP <span className="text-slate-300">{fmtNum(item.hp)}</span></span>}
        </div>
        <CanonicalMeta
          className="mt-4"
          sourceType={item.source_type}
          sourceName={item.source_name}
          confidenceScore={item.confidence_score}
          canonicalKey={item.canonical_item_key}
          normalizedName={item.normalized_name}
        />
        {item.description && <p className="mt-4 text-sm text-slate-500 leading-relaxed">{item.description}</p>}
      </div>

      <ScifiPanel title="Buy Locations" subtitle={buyLocs ? `${buyLocs.length} locations` : undefined} actions={<MapPin size={14} className="text-slate-600" />}>
        {!buyLocs?.length ? (
          <p className="text-xs text-slate-600 italic py-4 text-center">No known buy locations</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
            {buyLocs.map((loc, i) => (
              <div key={i} className="sci-panel px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300 truncate">{loc.shop_name}</p>
                    <p className="text-xs text-slate-600 truncate">{loc.location ?? `${loc.city ?? '—'} · ${loc.system_name ?? '—'}`}</p>
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

      {(isWeapon || isArmor) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isWeapon && (
            <ScifiPanel title="FPS Weapon Stats">
              <div className="grid grid-cols-2 gap-2">
                {weaponStats.map(({ label, value }) => (
                  <div key={label} className="sci-panel p-2.5">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase">{label}</p>
                    <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </ScifiPanel>
          )}

          {isArmor && (
            <ScifiPanel title="Armor / Suit Stats">
              <div className="grid grid-cols-2 gap-2">
                {armorStats.map(({ label, value }) => (
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

      {rawPayload && (
        <ScifiPanel title="Raw Game Data" subtitle="Parsed payload from extractor">
          <pre className="max-h-96 overflow-auto text-xs text-slate-400 font-mono-sc leading-relaxed">{JSON.stringify(rawPayload, null, 2)}</pre>
        </ScifiPanel>
      )}
    </div>
  );
}
