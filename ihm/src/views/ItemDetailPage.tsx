'use client';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowLeft, ChevronRight,
  FlaskConical, Heart, Ruler, Shield, Swords, Weight, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { useAdvancedMode } from '@/contexts/AdvancedModeContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { PageShell } from '@/components/ui/PageShell';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { PriceAvailabilityPanel } from '@/components/economy/PriceAvailabilityPanel';
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
  Gadget:         'tools-medics',
  Tool:           'tools-medics',
  Consumable:     'tools-medics',
  Attachment:     'attachments',
  Magazine:       'magazines',
};

// ── Quick stat pill ────────────────────────────────────────────────────────────

function QuickStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (value === '—') return null;
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 min-w-[72px]">
      <div className="flex items-center gap-1 text-slate-600">
        {icon}
        <span className="text-[9px] font-mono-sc uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-sm font-orbitron font-bold text-slate-200 tabular-nums">{value}</span>
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
  const { isAdvancedMode } = useAdvancedMode();
  const dj = item.data_json as Record<string, number> | null;
  return (
    <ScifiPanel title="Weapon Stats">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {item.weapon_dps != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">DPS</span>
            <span className="text-sm font-mono-sc font-semibold text-red-400">{f(item.weapon_dps, '', 1)}</span>
          </div>
        )}
        {item.weapon_damage != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Damage / shot</span>
            <span className="text-sm font-mono-sc font-semibold text-slate-200">{f(item.weapon_damage, '', 2)}</span>
          </div>
        )}
        {item.weapon_fire_rate != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Fire rate</span>
            <span className="text-sm font-mono-sc font-semibold text-slate-200">{f(item.weapon_fire_rate, 'rpm')}</span>
          </div>
        )}
        {item.weapon_range != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Range</span>
            <span className="text-sm font-mono-sc font-semibold text-slate-200">{f(item.weapon_range, 'm', 0)}</span>
          </div>
        )}
        {item.weapon_speed != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Projectile speed</span>
            <span className="text-sm font-mono-sc font-semibold text-slate-200">{f(item.weapon_speed, 'm/s', 0)}</span>
          </div>
        )}
        {item.weapon_ammo_count != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Ammo</span>
            <span className="text-sm font-mono-sc font-semibold text-slate-200">{f(item.weapon_ammo_count)}</span>
          </div>
        )}
      </div>
      {item.weapon_damage_type && (
        <p className="text-xs font-mono-sc text-slate-500 mb-3">
          Damage type: <span className="text-slate-300 capitalize">{item.weapon_damage_type}</span>
        </p>
      )}
      {isAdvancedMode && dj && (dj.damagePhysical != null || dj.damageEnergy != null || dj.damageDistortion != null) && (
        <div className="space-y-2 mt-4 pt-4 border-t border-slate-800">
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
  const { isAdvancedMode } = useAdvancedMode();
  const dj = item.data_json as Record<string, number | null> | null;
  return (
    <ScifiPanel title="Protection Stats">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {item.armor_damage_reduction != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Damage reduction</span>
            <span className="text-sm font-mono-sc font-semibold text-blue-400">{pct(item.armor_damage_reduction)}</span>
          </div>
        )}
        {item.armor_temp_min != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Min temp</span>
            <span className="text-sm font-mono-sc font-semibold text-slate-200">{f(item.armor_temp_min, '°C', 0)}</span>
          </div>
        )}
        {item.armor_temp_max != null && (
          <div className="sci-panel px-4 py-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Max temp</span>
            <span className="text-sm font-mono-sc font-semibold text-slate-200">{f(item.armor_temp_max, '°C', 0)}</span>
          </div>
        )}
      </div>
      {isAdvancedMode && dj && (dj.drPhysical != null || dj.drEnergy != null) && (
        <div className="space-y-2 mt-4 pt-4 border-t border-slate-800">
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

  const { data: craftingData } = useQuery({
    queryKey: ['crafting.byOutput', uuid, env],
    queryFn: () => api.crafting.recipes({ outputItemUuid: uuid!, env, limit: 5 }),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="LOADING ITEM…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!item) return null;

  const displayName = item.displayName ?? item.display_name ?? item.name;
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  const consumableSubType = item.sub_type ?? '';
  const isItemsConsumable = item.type === 'Consumable' && ['Food', 'Drink', 'Hacking', 'SystemAccess'].includes(consumableSubType);
  const slug = isItemsConsumable ? '' : TYPE_TO_SLUG[item.type];
  const breadcrumbHref = isItemsConsumable ? '/consumables' : slug ? `/fps-gear?cat=${slug}` : '/consumables';
  const breadcrumbLabel = isItemsConsumable || !slug ? 'Consumables' : 'FPS Gear';

  const isWeapon = item.type === 'FPS_Weapon';
  const isArmor = item.type.startsWith('Armor_') || item.type === 'Undersuit';

  // Build QuickStat pills
  const quickStats: { icon: React.ReactNode; label: string; value: string }[] = [];
  if (isWeapon) {
    if (item.weapon_dps != null) quickStats.push({ icon: <Zap size={9} />, label: 'DPS', value: f(item.weapon_dps, '', 1) });
    if (item.weapon_fire_rate != null) quickStats.push({ icon: <Activity size={9} />, label: 'Fire rate', value: f(item.weapon_fire_rate, 'rpm') });
    if (item.weapon_range != null) quickStats.push({ icon: <Ruler size={9} />, label: 'Range', value: f(item.weapon_range, 'm', 0) });
    if (item.weapon_ammo_count != null) quickStats.push({ icon: <Swords size={9} />, label: 'Ammo', value: f(item.weapon_ammo_count) });
  } else if (isArmor) {
    if (item.armor_damage_reduction != null) quickStats.push({ icon: <Shield size={9} />, label: 'DR', value: pct(item.armor_damage_reduction) });
    if (item.armor_temp_min != null && item.armor_temp_max != null) {
      quickStats.push({ icon: <span className="text-[8px]">°C</span>, label: 'Temp range', value: `${f(item.armor_temp_min)}–${f(item.armor_temp_max)}` });
    }
  }
  if (item.mass != null) quickStats.push({ icon: <Weight size={9} />, label: 'Mass', value: f(item.mass, 'kg', 2) });
  if (item.hp != null) quickStats.push({ icon: <Heart size={9} />, label: 'HP', value: f(item.hp) });

  return (
    <PageShell size="xl">

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
      <div className="sci-panel overflow-hidden">
        {/* Image placeholder */}
        <div className="relative w-full h-48 bg-slate-900">
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-orbitron text-6xl font-black text-slate-800 select-none tracking-widest">
              {typeLabel.slice(0, 3).toUpperCase()}
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#0A1628] to-transparent" />
        </div>

        {/* Header info */}
        <div className="px-6 pb-6 -mt-8 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">{typeLabel}</p>
              <h1 className="font-orbitron text-3xl font-black text-slate-100 leading-tight">{displayName}</h1>
              <div className="flex flex-wrap gap-2 mt-3">
                {item.grade && <GlowBadge color="amber">{item.grade}</GlowBadge>}
                {item.size != null && <GlowBadge color="slate">S{item.size}</GlowBadge>}
                {item.sub_type && item.sub_type !== 'UNDEFINED' && <GlowBadge color="slate">{item.sub_type}</GlowBadge>}
                {item.manufacturer_name && <GlowBadge color="cyan">{item.manufacturer_name}</GlowBadge>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats bar */}
      {quickStats.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {quickStats.map((s) => (
            <QuickStat key={s.label} icon={s.icon} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {/* Description */}
      {item.description && (
        <p className="text-sm text-slate-400 leading-relaxed border-l-2 border-cyan-900/40 pl-4">{item.description}</p>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Left — type-specific stats */}
        <div className="lg:col-span-2 space-y-6">
          {isWeapon && <WeaponStats item={item} />}
          {isArmor && <ArmorStats item={item} />}

          {/* Blueprint & Crafting */}
          {craftingData && craftingData.data.length > 0 && (
            <ScifiPanel
              title="Crafting"
              subtitle={`${craftingData.total} recipe${craftingData.total !== 1 ? 's' : ''}`}
              actions={<FlaskConical size={14} className="text-purple-500" />}
            >
              <div className="space-y-3">
                {craftingData.data.map((recipe) => (
                  <Link
                    key={recipe.uuid}
                    href={`/crafting?recipe=${recipe.uuid}`}
                    className="block sci-panel p-3 bg-purple-950/10 border-purple-900/30 hover:border-purple-500/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-xs font-orbitron text-slate-200 leading-tight">
                        {recipe.display_name ?? recipe.name ?? 'Crafting recipe'}
                      </p>
                      <div className="flex gap-1 shrink-0">
                        {recipe.station_type && (
                          <span className="text-[9px] font-mono-sc text-purple-400 border border-purple-900/40 bg-purple-950/20 rounded-sm px-1.5 py-0.5 leading-none">
                            {recipe.station_type}
                          </span>
                        )}
                        {recipe.skill_level != null && (
                          <span className="text-[9px] font-mono-sc text-amber-400 border border-amber-900/40 bg-amber-950/20 rounded-sm px-1.5 py-0.5 leading-none">
                            Lvl {recipe.skill_level}
                          </span>
                        )}
                      </div>
                    </div>
                    {recipe.crafting_time_s != null && (
                      <p className="text-[10px] font-mono-sc text-slate-500 mb-2">
                        ⏱ {recipe.crafting_time_s < 60 ? `${recipe.crafting_time_s}s` : `${Math.round(recipe.crafting_time_s / 60)} min`}
                        {recipe.output_quantity != null && recipe.output_quantity > 1 && ` · ×${recipe.output_quantity}`}
                      </p>
                    )}
                    {recipe.ingredients && recipe.ingredients.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {recipe.ingredients.map((ing, i) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: stable ingredient list
                          <span key={i} className="text-[9px] font-mono-sc text-slate-500 border border-slate-800 bg-slate-900/40 rounded-sm px-1.5 py-0.5 leading-none">
                            {ing.quantity != null ? `×${ing.quantity} ` : ''}{ing.display_item_name ?? ing.displayItemName ?? ing.item_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </ScifiPanel>
          )}

          <PriceAvailabilityPanel rows={buyLocs} />
        </div>
      </div>
    </PageShell>
  );
}

