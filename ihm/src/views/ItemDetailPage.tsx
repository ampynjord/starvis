'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { CanonicalMeta } from '@/components/ui/CanonicalMeta';
import { fCredits } from '@/utils/formatters';
import type { Item } from '@/types/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function f(v: number | null | undefined, unit = '', dec = 0): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  const s = dec > 0 ? n.toFixed(dec) : n.toLocaleString('en-US');
  return unit ? `${s} ${unit}` : s;
}

function pct(v: number | null | undefined, dec = 0): string {
  if (v == null) return '—';
  return `${(Number(v) * 100).toFixed(dec)} %`;
}

// ── Type helpers ──────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  FPS_Weapon:     'Weapon',
  Armor_Torso:    'Core Armor',
  Armor_Arms:     'Arms Armor',
  Armor_Legs:     'Legs Armor',
  Armor_Helmet:   'Helmet',
  Armor_Backpack: 'Backpack',
  Undersuit:      'Undersuit',
  Clothing:       'Clothing',
  Gadget:         'Other',
  Tool:           'Tool',
  Consumable:     'Consumable',
  Attachment:     'Attachment',
  Magazine:       'Magazine',
};

const TYPE_TO_SLUG: Record<string, string> = {
  FPS_Weapon:     'weapons',
  Armor_Torso:    'core',
  Armor_Arms:     'arms',
  Armor_Legs:     'legs',
  Armor_Helmet:   'helmet',
  Armor_Backpack: 'backpack',
  Undersuit:      'undersuit',
  Clothing:       'clothing',
  Gadget:         'other',
  Tool:           'tools-medics',
  Consumable:     'tools-medics',
  Attachment:     'attachments',
  Magazine:       'magazines',
};

// ── Stat pill ────────────────────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
      <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-mono-sc font-semibold ${accent ?? 'text-slate-200'}`}>{value}</span>
    </div>
  );
}

// ── Resistance bar ────────────────────────────────────────────────────────────

function ResBar({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  if (value == null) return null;
  const pctVal = Math.round(Number(value) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-mono-sc text-slate-600 uppercase w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pctVal, 100)}%` }} />
      </div>
      <span className="text-xs font-mono-sc text-slate-400 w-10 text-right">{pctVal}%</span>
    </div>
  );
}

// ── Weapon stats block ────────────────────────────────────────────────────────

function WeaponStats({ item }: { item: Item }) {
  const dj = item.data_json as Record<string, number> | null;
  return (
    <ScifiPanel title="Weapon Stats">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {item.weapon_dps != null && <Stat label="DPS" value={f(item.weapon_dps, '', 1)} accent="text-red-400" />}
        {item.weapon_damage != null && <Stat label="Damage / shot" value={f(item.weapon_damage, '', 2)} />}
        {item.weapon_fire_rate != null && <Stat label="Fire rate" value={f(item.weapon_fire_rate, 'rpm')} />}
        {item.weapon_range != null && <Stat label="Range" value={f(item.weapon_range, 'm', 0)} />}
        {item.weapon_speed != null && <Stat label="Projectile speed" value={f(item.weapon_speed, 'm/s', 0)} />}
        {item.weapon_ammo_count != null && <Stat label="Ammo" value={f(item.weapon_ammo_count)} />}
      </div>
      {item.weapon_damage_type && (
        <p className="text-xs font-mono-sc text-slate-500 mb-3">
          Damage type: <span className="text-slate-300 capitalize">{item.weapon_damage_type}</span>
        </p>
      )}
      {/* Per-damage-type breakdown from data_json */}
      {dj && (dj.damagePhysical != null || dj.damageEnergy != null || dj.damageDistortion != null) && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest mb-1">Damage breakdown</p>
          {dj.damagePhysical != null && <ResBar label="Physical" value={dj.damagePhysical / ((dj.damagePhysical ?? 0) + (dj.damageEnergy ?? 0) + (dj.damageDistortion ?? 0))} color="bg-orange-500" />}
          {dj.damageEnergy != null && <ResBar label="Energy" value={dj.damageEnergy / ((dj.damagePhysical ?? 0) + (dj.damageEnergy ?? 0) + (dj.damageDistortion ?? 0))} color="bg-cyan-500" />}
          {dj.damageDistortion != null && <ResBar label="Distortion" value={dj.damageDistortion / ((dj.damagePhysical ?? 0) + (dj.damageEnergy ?? 0) + (dj.damageDistortion ?? 0))} color="bg-purple-500" />}
        </div>
      )}
    </ScifiPanel>
  );
}

// ── Armor stats block ────────────────────────────────────────────────────────

function ArmorStats({ item }: { item: Item }) {
  const dj = item.data_json as Record<string, number | null> | null;
  return (
    <ScifiPanel title="Protection Stats">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {item.armor_damage_reduction != null && (
          <Stat label="Damage reduction" value={pct(item.armor_damage_reduction)} accent="text-blue-400" />
        )}
        {item.armor_temp_min != null && (
          <Stat label="Min temp" value={f(item.armor_temp_min, '°C', 0)} />
        )}
        {item.armor_temp_max != null && (
          <Stat label="Max temp" value={f(item.armor_temp_max, '°C', 0)} />
        )}
      </div>
      {dj && (dj.drPhysical != null || dj.drEnergy != null) && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest mb-1">Resistance per damage type</p>
          {dj.drPhysical != null && <ResBar label="Physical" value={dj.drPhysical} color="bg-orange-500" />}
          {dj.drEnergy != null && <ResBar label="Energy" value={dj.drEnergy} color="bg-cyan-500" />}
          {dj.drDistortion != null && <ResBar label="Distortion" value={dj.drDistortion} color="bg-purple-500" />}
          {dj.drThermal != null && <ResBar label="Thermal" value={dj.drThermal} color="bg-red-500" />}
          {dj.drBiochemical != null && <ResBar label="Biochemical" value={dj.drBiochemical} color="bg-green-500" />}
          {dj.drStun != null && <ResBar label="Stun" value={dj.drStun} color="bg-yellow-500" />}
        </div>
      )}
    </ScifiPanel>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ItemDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params?.uuid;
  const router = useRouter();
  const { env } = useEnv();
  const [rawOpen, setRawOpen] = useState(false);

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

  const displayName = item.displayName ?? item.display_name ?? item.name;
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  const slug = TYPE_TO_SLUG[item.type];
  const breadcrumbHref = slug ? `/fps-gear?cat=${slug}` : '/fps-gear';
  const breadcrumbLabel = 'FPS Gear';

  const isWeapon = item.type === 'FPS_Weapon';
  const isArmor = item.type.startsWith('Armor_') || item.type === 'Undersuit';

  const rawPayload = item.data_json ?? null;

  return (
    <div className="max-w-(--breakpoint-lg) mx-auto space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button
          type="button"
          onClick={() => router.back()}
          className="hover:text-slate-400 transition-colors flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Back
        </button>
        <ChevronRight size={10} />
        <Link href={breadcrumbHref} className="hover:text-slate-400">{breadcrumbLabel}</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{displayName}</span>
      </div>

      {/* Hero panel */}
      <div className="sci-panel p-6">
        <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">{typeLabel}</p>
        <h1 className="font-orbitron text-2xl font-black text-slate-100">{displayName}</h1>

        <div className="flex flex-wrap gap-2 mt-3">
          {item.grade && <GlowBadge color="amber">{item.grade}</GlowBadge>}
          {item.size != null && <GlowBadge color="slate">S{item.size}</GlowBadge>}
          {item.sub_type && item.sub_type !== 'UNDEFINED' && <GlowBadge color="slate">{item.sub_type}</GlowBadge>}
          {item.manufacturer_name && <GlowBadge color="cyan">{item.manufacturer_name}</GlowBadge>}
        </div>

        <div className="flex gap-6 mt-4">
          {item.mass != null && (
            <span className="text-xs font-mono-sc text-slate-500">
              MASS <span className="text-slate-300">{f(item.mass, 'kg', 2)}</span>
            </span>
          )}
          {item.hp != null && (
            <span className="text-xs font-mono-sc text-slate-500">
              HP <span className="text-slate-300">{f(item.hp)}</span>
            </span>
          )}
          {item.class_name && (
            <span className="text-xs font-mono-sc text-slate-600">{item.class_name}</span>
          )}
        </div>

        <CanonicalMeta
          className="mt-4"
          sourceType={item.source_type}
          sourceName={item.source_name}
          confidenceScore={item.confidence_score}
          canonicalKey={item.canonical_item_key}
          normalizedName={item.normalized_name}
        />

        {item.description && (
          <p className="mt-4 text-sm text-slate-500 leading-relaxed">{item.description}</p>
        )}
      </div>

      {/* Type-specific stats */}
      {isWeapon && <WeaponStats item={item} />}
      {isArmor && <ArmorStats item={item} />}

      {/* Buy locations */}
      <ScifiPanel
        title="Buy Locations"
        subtitle={buyLocs ? `${buyLocs.length} location${buyLocs.length !== 1 ? 's' : ''}` : undefined}
        actions={<MapPin size={14} className="text-slate-600" />}
      >
        {!buyLocs?.length ? (
          <p className="text-xs text-slate-600 italic py-4 text-center">No known buy locations</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
            {buyLocs.map((loc, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable list
              <div key={i} className="sci-panel px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300 truncate">{loc.shop_name}</p>
                    <p className="text-xs text-slate-600 truncate">
                      {loc.location ?? `${loc.city ?? '—'} · ${loc.system_name ?? '—'}`}
                    </p>
                    <CanonicalMeta
                      compact
                      className="mt-1"
                      sourceType={loc.inventory_source_type ?? loc.shop_source_type}
                      sourceName={loc.inventory_source_name ?? loc.shop_source_name}
                      confidenceScore={loc.confidence_score}
                    />
                  </div>
                  {loc.base_price != null && (
                    <span className="text-xs font-mono-sc text-amber-400 shrink-0">{fCredits(loc.base_price)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScifiPanel>

      {/* Raw data (collapsible) */}
      {rawPayload && Object.keys(rawPayload).length > 0 && (
        <div className="sci-panel overflow-hidden">
          <button
            type="button"
            onClick={() => setRawOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-mono-sc text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span className="uppercase tracking-widest">Raw Game Data</span>
            {rawOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {rawOpen && (
            <pre className="px-4 pb-4 max-h-80 overflow-auto text-xs text-slate-500 font-mono leading-relaxed border-t border-border">
              {JSON.stringify(rawPayload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
