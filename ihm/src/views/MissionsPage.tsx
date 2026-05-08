'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Archive,
  Bell,
  BookOpen,
  Calendar,
  Clock,
  ClipboardList,
  Coins,
  Crosshair,
  Eye,
  FlaskConical,
  Gauge,
  Link as LinkIcon,
  MapPin,
  Package,
  Radio,
  Scale,
  Share2,
  Skull,
  Truck,
  User,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Mission } from '@/types/api';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { FilterPanel, MobileFilterWrapper } from '@/components/ui/FilterPanel';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 40;

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(secs: number | null): string {
  if (!secs) return '';
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatReward(min: number | null, max: number | null, currency?: string | null): string {
  const c = currency ?? 'aUEC';
  if (min != null && max != null && min !== max)
    return `${min.toLocaleString('en-US')} – ${max.toLocaleString('en-US')} ${c}`;
  if (max != null) return `${max.toLocaleString('en-US')} ${c}`;
  if (min != null) return `${min.toLocaleString('en-US')} ${c}`;
  return '';
}

// ── Type meta (color + icon + label) ────────────────────────────────────────

type BadgeColor = 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate';

interface TypeMeta {
  color: BadgeColor;
  icon: React.ReactNode;
  label: string;
  /** Does this type typically have a danger_level? */
  hasDanger: boolean;
  /** Does this type typically have a buy-in? */
  hasBuyin: boolean;
}

const TYPE_META: Record<string, TypeMeta> = {
  Hauling:               { color: 'cyan',   icon: <Truck size={11} />,       label: 'Hauling',              hasDanger: true,  hasBuyin: false },
  Hauling_Interstellar:  { color: 'cyan',   icon: <Truck size={11} />,       label: 'Interstellar Hauling', hasDanger: true,  hasBuyin: false },
  Hauling_Planetary:     { color: 'cyan',   icon: <Truck size={11} />,       label: 'Planetary Hauling',    hasDanger: true,  hasBuyin: false },
  Hauling_Solar:         { color: 'cyan',   icon: <Truck size={11} />,       label: 'Solar Hauling',        hasDanger: true,  hasBuyin: false },
  Collection:            { color: 'amber',  icon: <Archive size={11} />,     label: 'Collection',           hasDanger: false, hasBuyin: true  },
  Mercenary:             { color: 'red',    icon: <Crosshair size={11} />,   label: 'Mercenary',            hasDanger: true,  hasBuyin: true  },
  Delivery:              { color: 'cyan',   icon: <Package size={11} />,     label: 'Delivery',             hasDanger: false, hasBuyin: false },
  Investigation:         { color: 'purple', icon: <Eye size={11} />,         label: 'Investigation',        hasDanger: false, hasBuyin: false },
  Priority:              { color: 'amber',  icon: <AlertTriangle size={11}/>, label: 'Priority',            hasDanger: true,  hasBuyin: true  },
  Salvage:               { color: 'slate',  icon: <Wrench size={11} />,      label: 'Salvage',              hasDanger: false, hasBuyin: true  },
  'Service Beacons':     { color: 'green',  icon: <Radio size={11} />,       label: 'Service Beacon',       hasDanger: false, hasBuyin: false },
  'Bounty Hunter':       { color: 'amber',  icon: <Skull size={11} />,       label: 'Bounty Hunter',        hasDanger: false, hasBuyin: false },
  Racing:                { color: 'green',  icon: <Gauge size={11} />,       label: 'Racing',               hasDanger: false, hasBuyin: true  },
  Maintenance:           { color: 'slate',  icon: <Wrench size={11} />,      label: 'Maintenance',          hasDanger: false, hasBuyin: false },
  Appointment:           { color: 'slate',  icon: <Calendar size={11} />,    label: 'Appointment',          hasDanger: false, hasBuyin: false },
  'ECN Alert':           { color: 'red',    icon: <Bell size={11} />,        label: 'ECN Alert',            hasDanger: false, hasBuyin: false },
  local:                 { color: 'slate',  icon: <MapPin size={11} />,      label: 'Local',                hasDanger: false, hasBuyin: false },
};

function getTypeMeta(type: string | null): TypeMeta {
  return TYPE_META[type ?? ''] ?? { color: 'slate', icon: <Zap size={11} />, label: type ?? '?', hasDanger: false, hasBuyin: false };
}

// ── DangerPips ───────────────────────────────────────────────────────────────

function DangerPips({ level }: { level: number | null }) {
  if (level == null) return null;
  const MAX = 5;
  const colors = ['bg-yellow-500', 'bg-amber-500', 'bg-orange-500', 'bg-red-500', 'bg-red-600'];
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: MAX }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${i < (level ?? 0) ? colors[Math.min(i, colors.length - 1)] : 'bg-slate-700'}`}
        />
      ))}
    </div>
  );
}

// ── MissionCard ───────────────────────────────────────────────────────────────

const TYPE_BORDER: Record<string, string> = {
  cyan: 'border-l-cyan-600',
  amber: 'border-l-amber-500',
  green: 'border-l-green-500',
  red: 'border-l-red-500',
  purple: 'border-l-purple-500',
  slate: 'border-l-slate-600',
};

function MissionCard({
  m,
  isSelected,
  onClick,
}: { m: Mission; isSelected: boolean; onClick: () => void }) {
  const reward = formatReward(m.reward_min, m.reward_max, m.reward_currency);
  const meta = getTypeMeta(m.mission_type);
  const borderColor = TYPE_BORDER[meta.color] ?? 'border-l-slate-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group w-full text-left px-4 py-3 rounded-sm border border-l-2 transition-all duration-150',
        borderColor,
        isSelected
          ? 'bg-cyan-950/20 border-t-cyan-900/60 border-r-cyan-900/60 border-b-cyan-900/60 shadow-[inset_0_0_20px_rgba(6,182,212,0.04)]'
          : 'bg-panel/60 border-t-border border-r-border border-b-border hover:border-t-slate-700 hover:border-r-slate-700 hover:border-b-slate-700 hover:bg-white/[0.02]',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`shrink-0 mt-0.5 flex items-center justify-center w-6 h-6 rounded-sm bg-${meta.color}-950/60 border border-${meta.color}-900/60 text-${meta.color}-400`}>
          {meta.icon}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Giver / faction */}
          {(m.mission_giver || m.faction) && (
            <p className="text-[10px] font-mono-sc text-purple-400/80 uppercase tracking-widest truncate leading-tight mb-0.5">
              {m.mission_giver ?? m.faction}
            </p>
          )}
          {/* Title */}
          <p className={`font-rajdhani font-semibold text-sm leading-tight truncate ${isSelected ? 'text-cyan-100' : 'text-slate-200 group-hover:text-slate-100'}`}>
            {m.title ?? m.class_name}
          </p>

          {/* Tags */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-${meta.color}-950/40 border-${meta.color}-900/60 text-${meta.color}-400`}>
              {meta.icon} {meta.label}
            </span>
            {!m.is_legal && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-red-950/40 border-red-900/60 text-red-400">
                <Skull size={8} /> Illegal
              </span>
            )}
            {!!m.can_be_shared && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-cyan-950/40 border-cyan-900/60 text-cyan-400">
                <Share2 size={8} /> Group
              </span>
            )}
            {!!m.has_blueprint_reward && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-purple-950/40 border-purple-900/60 text-purple-400">
                <FlaskConical size={8} /> Blueprint
              </span>
            )}
            {m.buy_in_amount != null && m.buy_in_amount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-amber-950/40 border-amber-900/60 text-amber-400">
                <Coins size={8} /> {m.buy_in_amount.toLocaleString('en-US')}
              </span>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col items-end gap-1.5 shrink-0 min-w-[72px]">
          {reward && (
            <p className="text-sm font-orbitron text-amber-400 leading-tight whitespace-nowrap">{reward}</p>
          )}
          <div className="flex items-center gap-2">
            {m.danger_level != null && <DangerPips level={m.danger_level} />}
            {m.completion_time_s != null && (
              <span className="text-[10px] font-mono-sc text-slate-600 flex items-center gap-0.5">
                <Clock size={9} />{formatDuration(m.completion_time_s)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({ m }: { m: Mission }) {
  const meta = getTypeMeta(m.mission_type);
  const reward = formatReward(m.reward_min, m.reward_max, m.reward_currency);

  return (
    <ScifiPanel
      title="Mission Detail"
      subtitle={m.class_name}
    >
      {/* Mission title + type */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <GlowBadge color={meta.color}>{meta.icon} {meta.label}</GlowBadge>
          {m.category && <GlowBadge color="slate">{m.display_category ?? m.category}</GlowBadge>}
          <GlowBadge color={m.is_legal ? 'green' : 'red'}>
            <Scale size={10} /> {m.is_legal ? 'Legal' : 'Illegal'}
          </GlowBadge>
          <GlowBadge color={m.can_be_shared ? 'cyan' : 'slate'}>
            <Share2 size={10} /> {m.can_be_shared ? 'Group' : 'Solo'}
          </GlowBadge>
          {!!m.is_unique && <GlowBadge color="amber">Unique</GlowBadge>}
          {!!m.has_blueprint_reward && (
            <GlowBadge color="purple"><FlaskConical size={10} /> Blueprint</GlowBadge>
          )}
        </div>
        {m.title && (
          <h3 className="font-orbitron text-base text-slate-100 leading-snug">{m.title}</h3>
        )}
      </div>

      <div className="space-y-2">
        {/* Reward block */}
        {reward && (
          <div className="sci-panel p-3 bg-amber-950/20 border-amber-900/30">
            <p className="text-[10px] font-mono-sc text-amber-600 uppercase flex items-center gap-1 mb-1">
              <Coins size={10} /> Reward
            </p>
            <p className="text-xl font-orbitron text-amber-400">{reward}</p>
          </div>
        )}

        {/* Buy-in */}
        {m.buy_in_amount != null && m.buy_in_amount > 0 && (
          <div className="sci-panel p-3 bg-orange-950/20 border-orange-900/30">
            <p className="text-[10px] font-mono-sc text-orange-500 uppercase flex items-center gap-1 mb-1">
              <Coins size={10} /> Buy-In Required
            </p>
            <p className="text-lg font-orbitron text-orange-400">
              {m.buy_in_amount.toLocaleString('en-US')} {m.reward_currency ?? 'aUEC'}
            </p>
          </div>
        )}

        {/* Faction / Giver */}
        {(m.faction || m.mission_giver) && (
          <div className="grid grid-cols-2 gap-2">
            {m.faction && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <Users size={9} /> Faction
                </p>
                <p className="text-sm font-mono-sc text-purple-400">{m.faction}</p>
              </div>
            )}
            {m.mission_giver && m.mission_giver !== m.faction && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <User size={9} /> Mission Giver
                </p>
                <p className="text-sm font-mono-sc text-slate-300">{m.mission_giver}</p>
              </div>
            )}
          </div>
        )}

        {/* Danger + Duration */}
        {(m.danger_level != null || m.completion_time_s != null) && (
          <div className="grid grid-cols-2 gap-2">
            {m.danger_level != null && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-1.5">
                  <Skull size={9} /> Danger Level
                </p>
                <div className="flex items-center gap-2">
                  <DangerPips level={m.danger_level} />
                  <span className="text-sm font-orbitron text-red-400">{m.danger_level}/5</span>
                </div>
              </div>
            )}
            {m.completion_time_s != null && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <Clock size={9} /> Time Limit
                </p>
                <p className="text-sm font-orbitron text-slate-300">{formatDuration(m.completion_time_s)}</p>
              </div>
            )}
          </div>
        )}

        {/* Location: shown only when non-null (currently always null — runtime data) */}
        {(m.location_system || m.location_planet || m.location_name) && (
          <div className="sci-panel p-2.5">
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
              <MapPin size={9} /> Location
            </p>
            <p className="text-sm font-mono-sc text-slate-300">
              {[m.location_system, m.location_planet, m.location_name].filter(Boolean).join(' › ')}
            </p>
          </div>
        )}

        {/* Blueprint reward */}
        {!!m.has_blueprint_reward && (
          <Link
            href={m.blueprint_reward_uuid ? `/blueprints?recipe=${m.blueprint_reward_uuid}` : '/blueprints'}
            className="block sci-panel p-2.5 bg-purple-950/20 border-purple-900/30 hover:border-purple-500/50 transition-colors"
          >
            <p className="text-[10px] text-purple-500 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
              <FlaskConical size={9} /> Blueprint Reward
              <LinkIcon size={9} className="ml-auto text-purple-600" />
            </p>
            <p className="text-sm font-mono-sc text-purple-200">
              {m.blueprint_name ?? m.blueprint_output ?? 'Unknown Blueprint'}
            </p>
          </Link>
        )}

        {/* Description */}
        {m.description && (
          <div className="sci-panel p-2.5">
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-1">
              <BookOpen size={9} /> Description
            </p>
            <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{m.description}</p>
          </div>
        )}

        {/* Technical footer */}
        <div className="sci-panel p-2 border-slate-800/40 bg-slate-900/30">
          <p className="text-[10px] font-mono-sc text-slate-600 break-all">{m.class_name}</p>
        </div>
      </div>
    </ScifiPanel>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MissionsPage() {
  const searchParams = useSearchParams();
  const { env } = useEnv();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [type, setType] = useState('');
  const [legal, setLegal] = useState('');
  const [faction, setFaction] = useState('');
  const [category, setCategory] = useState('');
  const [sharing, setSharing] = useState('');
  const [availability, setAvailability] = useState('');
  const [blueprintOnly, setBlueprintOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'reward_desc' | 'reward_asc' | 'danger_desc'>('default');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(searchParams?.get('selected') ?? null);
  const debouncedSearch = useDebounce(search, 350);

  const { data: types } = useQuery({
    queryKey: ['missions.types', env],
    queryFn: () => api.missions.types(env),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { data: factions } = useQuery({
    queryKey: ['missions.factions', env],
    queryFn: () => api.missions.factions(env),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { data: categories } = useQuery({
    queryKey: ['missions.categories', env],
    queryFn: () => api.missions.categories(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'missions.list',
      env,
      { page, search: debouncedSearch, type, legal, sharing, faction, category, availability },
    ],
    queryFn: () =>
      api.missions.list({
        env,
        page,
        limit: LIMIT,
        search: debouncedSearch || undefined,
        type: type || undefined,
        legal: legal || undefined,
        shared: sharing || undefined,
        faction: faction || undefined,
        category: category || undefined,
        unique: availability === 'unique' ? 'true' : availability === 'repeatable' ? 'false' : undefined,
      }),
  });

  const hasFilters = !!(type || debouncedSearch || legal || sharing || faction || category || availability || blueprintOnly);

  const { data: selectedMissionFallback } = useQuery({
    queryKey: ['missions.single', selectedUuid, env],
    queryFn: () => api.missions.single(selectedUuid!, env),
    enabled: !!selectedUuid && !data?.data?.find((m) => m.uuid === selectedUuid),
  });

  const sel: Mission | null = data?.data?.find((m) => m.uuid === selectedUuid) ?? selectedMissionFallback ?? null;

  const summary = useMemo(() => {
    if (!data) return null;
    return { total: data.total, showing: data.data.length };
  }, [data]);

  const displayedMissions = useMemo(() => {
    let list = data?.data ?? [];
    if (blueprintOnly) list = list.filter((m) => m.has_blueprint_reward);
    switch (sortBy) {
      case 'reward_desc': return [...list].sort((a, b) => (b.reward_max ?? b.reward_min ?? 0) - (a.reward_max ?? a.reward_min ?? 0));
      case 'reward_asc': return [...list].sort((a, b) => (a.reward_max ?? a.reward_min ?? 0) - (b.reward_max ?? b.reward_min ?? 0));
      case 'danger_desc': return [...list].sort((a, b) => (b.danger_level ?? 0) - (a.danger_level ?? 0));
      default: return list;
    }
  }, [data?.data, blueprintOnly, sortBy]);

  const blueprintCount = useMemo(() => data?.data?.filter((m) => m.has_blueprint_reward).length ?? 0, [data?.data]);
  const avgReward = useMemo(() => {
    const missions = data?.data ?? [];
    const withReward = missions.filter((m) => m.reward_max != null || m.reward_min != null);
    if (!withReward.length) return null;
    const total = withReward.reduce((s, m) => s + (m.reward_max ?? m.reward_min ?? 0), 0);
    return Math.round(total / withReward.length);
  }, [data?.data]);

  useEffect(() => {
    if (displayedMissions.length && !selectedUuid) setSelectedUuid(displayedMissions[0].uuid);
  }, [displayedMissions, selectedUuid]);

  const resetAll = () => {
    setType(''); setSearch(''); setLegal(''); setFaction('');
    setCategory(''); setAvailability(''); setSharing(''); setBlueprintOnly(false); setSortBy('default'); setPage(1);
  };

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      <PageHeader
        title="Mission Database"
        count={summary?.total}
        countLabel="missions"
        search={search}
        searchPlaceholder="Search mission, giver, class name…"
        onSearch={(v) => { setSearch(v); setPage(1); }}
      />

      {/* Stats bar + quick actions */}
      {data && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-slate-500">
            <ClipboardList size={10} /> {data?.total.toLocaleString()} missions
          </div>
          {avgReward != null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-slate-500">
              <Coins size={10} /> avg {avgReward.toLocaleString()} aUEC
            </div>
          )}
          {blueprintCount > 0 && (
            <button
              type="button"
              onClick={() => setBlueprintOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[10px] font-mono-sc transition-colors ${
                blueprintOnly
                  ? 'bg-purple-950/40 border-purple-800/60 text-purple-400'
                  : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <FlaskConical size={10} /> {blueprintCount} blueprint reward{blueprintCount > 1 ? 's' : ''}
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[10px] font-mono-sc text-slate-600 mr-1">Sort:</span>
            {([
              ['default', 'Default'] as const,
              ['reward_desc', 'Reward ↓'] as const,
              ['reward_asc', 'Reward ↑'] as const,
              ['danger_desc', 'Danger ↓'] as const,
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setSortBy(val)}
                className={`px-2 py-1 rounded-sm text-[10px] font-mono-sc border transition-colors ${
                  sortBy === val
                    ? 'bg-cyan-950/40 border-cyan-800/60 text-cyan-400'
                    : 'border-slate-800 text-slate-600 hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex gap-4">
        <div className="w-44 shrink-0">
          <MobileFilterWrapper hasFilters={hasFilters}>
            <FilterPanel
              hasFilters={hasFilters}
              onReset={resetAll}
              groups={[
                {
                  key: 'type',
                  label: 'Mission Type',
                  options: (types ?? []).map((t) => ({ label: getTypeMeta(t).label, value: t })),
                  value: type,
                  onChange: (v) => { setType(v); setPage(1); },
                },
                {
                  key: 'faction',
                  label: 'Faction',
                  options: (factions ?? []).map((f) => ({ label: f, value: f })),
                  value: faction,
                  onChange: (v) => { setFaction(v); setPage(1); },
                },
                {
                  key: 'category',
                  label: 'Category',
                  options: (categories ?? []).map((c) => ({ label: c, value: c })),
                  value: category,
                  onChange: (v) => { setCategory(v); setPage(1); },
                },
                {
                  key: 'legal',
                  label: 'Legality',
                  options: [{ label: 'Legal', value: 'true' }, { label: 'Illegal', value: 'false' }],
                  value: legal,
                  onChange: (v) => { setLegal(v); setPage(1); },
                },
                {
                  key: 'sharing',
                  label: 'Group Play',
                  options: [{ label: 'Group', value: 'true' }, { label: 'Solo', value: 'false' }],
                  value: sharing,
                  onChange: (v) => { setSharing(v); setPage(1); },
                },
                {
                  key: 'availability',
                  label: 'Recurrence',
                  options: [{ label: 'Unique', value: 'unique' }, { label: 'Repeatable', value: 'repeatable' }],
                  value: availability,
                  onChange: (v) => { setAvailability(v); setPage(1); },
                },
              ]}
            />
          </MobileFilterWrapper>
        </div>
        <div className="flex-1 min-w-0">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Mission list */}
        <div>
          {isLoading ? (
            <LoadingGrid message="LOADING MISSIONS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : !displayedMissions.length ? (
            <EmptyState icon="📋" title="No missions found" />
          ) : (
            <>
              <div className="space-y-1.5">
                {displayedMissions.map((m, i) => (
                  <motion.div
                    key={m.uuid}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  >
                    <MissionCard
                      m={m}
                      isSelected={selectedUuid === m.uuid}
                      onClick={() => setSelectedUuid(m.uuid)}
                    />
                  </motion.div>
                ))}
              </div>
              {(data?.pages ?? 0) > 1 && (
                <div className="mt-4">
                  <Pagination page={page} totalPages={data!.pages} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail panel */}
        <div className="xl:sticky xl:top-6">
          {sel ? (
            <DetailPanel m={sel} />
          ) : (
            <ScifiPanel title="Mission Detail" subtitle="Select a mission">
              <p className="text-xs text-slate-500">Click a mission in the list to view its details.</p>
            </ScifiPanel>
          )}
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}

