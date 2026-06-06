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
  Trophy,
  Truck,
  User,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Mission } from '@/types/api';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { ListFilterBar, ListFilterResetButton, ListFilterSelect } from '@/components/ui/ListFilters';
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

function DetailPanel({ m, env }: { m: Mission; env: string }) {
  const { data: full } = useQuery({
    queryKey: ['missions.detail', m.uuid, env],
    queryFn: () => api.missions.single(m.uuid, env),
    staleTime: 5 * 60_000,
    initialData: m.blueprint_rewards ? m : undefined,
  });
  const mission = full ?? m;
  const meta = getTypeMeta(mission.mission_type);
  const reward = formatReward(mission.reward_min, mission.reward_max, mission.reward_currency);
  const blueprintRewards = mission.blueprint_rewards ?? [];
  const blueprintCount = mission.blueprint_reward_count ?? mission.blueprintRewardCount ?? blueprintRewards.length;

  return (
    <ScifiPanel
      title="Mission Detail"
      subtitle={mission.class_name}
    >
      {/* Mission title + type */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <GlowBadge color={meta.color}>{meta.icon} {meta.label}</GlowBadge>
          {mission.category && <GlowBadge color="slate">{mission.display_category ?? mission.category}</GlowBadge>}
          <GlowBadge color={mission.is_legal ? 'green' : 'red'}>
            <Scale size={10} /> {mission.is_legal ? 'Legal' : 'Illegal'}
          </GlowBadge>
          <GlowBadge color={mission.can_be_shared ? 'cyan' : 'slate'}>
            <Share2 size={10} /> {mission.can_be_shared ? 'Group' : 'Solo'}
          </GlowBadge>
          {!!mission.only_owner_complete && <GlowBadge color="slate">Owner Complete</GlowBadge>}
          {!!mission.is_unique && <GlowBadge color="amber">Unique</GlowBadge>}
          {!!mission.has_blueprint_reward && (
            <GlowBadge color="purple"><FlaskConical size={10} /> {blueprintCount > 1 ? `${blueprintCount} Blueprints` : 'Blueprint'}</GlowBadge>
          )}
        </div>
        {mission.title && (
          <h3 className="font-orbitron text-base text-slate-100 leading-snug">{mission.title}</h3>
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
        {mission.buy_in_amount != null && mission.buy_in_amount > 0 && (
          <div className="sci-panel p-3 bg-orange-950/20 border-orange-900/30">
            <p className="text-[10px] font-mono-sc text-orange-500 uppercase flex items-center gap-1 mb-1">
              <Coins size={10} /> Buy-In Required
            </p>
            <p className="text-lg font-orbitron text-orange-400">
              {mission.buy_in_amount.toLocaleString('en-US')} {mission.reward_currency ?? 'aUEC'}
            </p>
          </div>
        )}

        {/* Faction / Giver */}
        {(mission.faction || mission.mission_giver) && (
          <div className="grid grid-cols-2 gap-2">
            {mission.faction && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <Users size={9} /> Faction
                </p>
                <p className="text-sm font-mono-sc text-purple-400">{mission.faction}</p>
              </div>
            )}
            {mission.mission_giver && mission.mission_giver !== mission.faction && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <User size={9} /> Mission Giver
                </p>
                <p className="text-sm font-mono-sc text-slate-300">{mission.mission_giver}</p>
              </div>
            )}
          </div>
        )}

        {/* Danger + Duration */}
        {(mission.danger_level != null ||
          mission.completion_time_s != null ||
          mission.required_reputation != null ||
          mission.reputation_reward != null ||
          mission.base_xp != null) && (
          <div className="grid grid-cols-2 gap-2">
            {mission.danger_level != null && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-1.5">
                  <Skull size={9} /> Danger Level
                </p>
                <div className="flex items-center gap-2">
                  <DangerPips level={mission.danger_level} />
                  <span className="text-sm font-orbitron text-red-400">{mission.danger_level}/5</span>
                </div>
              </div>
            )}
            {mission.completion_time_s != null && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <Clock size={9} /> Time Limit
                </p>
                <p className="text-sm font-orbitron text-slate-300">{formatDuration(mission.completion_time_s)}</p>
              </div>
            )}
            {mission.required_reputation != null && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <Users size={9} /> Required Reputation
                </p>
                <p className="text-sm font-orbitron text-purple-300">{mission.required_reputation}</p>
              </div>
            )}
            {mission.reputation_reward != null && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <Trophy size={9} /> Reputation Reward
                </p>
                <p className="text-sm font-orbitron text-green-300">+{mission.reputation_reward}</p>
              </div>
            )}
            {mission.base_xp != null && (
              <div className="sci-panel p-2.5">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                  <Zap size={9} /> Base XP
                </p>
                <p className="text-sm font-orbitron text-cyan-300">{mission.base_xp.toLocaleString('en-US')}</p>
              </div>
            )}
          </div>
        )}

        {/* Location: shown only when non-null (currently always null — runtime data) */}
        {(mission.location_system || mission.location_planet || mission.location_name) && (
          <div className="sci-panel p-2.5">
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
              <MapPin size={9} /> Location
            </p>
            <p className="text-sm font-mono-sc text-slate-300">
              {[mission.location_system, mission.location_planet, mission.location_name].filter(Boolean).join(' > ')}
            </p>
          </div>
        )}

        {/* Blueprint reward */}
        {!!mission.has_blueprint_reward && (
          <div className="sci-panel p-2.5 bg-purple-950/20 border-purple-900/30">
            <p className="text-[10px] text-purple-500 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
              <FlaskConical size={9} /> Blueprint Reward
            </p>
            {blueprintRewards.length > 0 ? (
              <div className="space-y-1.5 mt-2">
                {blueprintRewards.map((bp) => (
                  <Link
                    key={bp.uuid}
                    href={`/crafting-calculator?recipe=${bp.uuid}`}
                    className="flex items-center justify-between gap-2 rounded-sm border border-purple-900/40 bg-slate-950/30 px-2 py-1.5 text-xs font-mono-sc text-purple-200 transition-colors hover:border-purple-500/60 hover:text-purple-100"
                  >
                    <span className="truncate">{bp.output_item_name ?? bp.name ?? bp.class_name}</span>
                    <LinkIcon size={9} className="shrink-0 text-purple-500" />
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                href={mission.blueprint_reward_uuid ? `/crafting-calculator?recipe=${mission.blueprint_reward_uuid}` : '/crafting-calculator'}
                className="mt-1 inline-flex items-center gap-1 text-sm font-mono-sc text-purple-200 hover:text-purple-100"
              >
                {mission.blueprint_name ?? mission.blueprint_output ?? 'Unknown Blueprint'}
                <LinkIcon size={9} />
              </Link>
            )}
          </div>
        )}

        {/* Description */}
        {mission.description && (
          <div className="sci-panel p-2.5">
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-1">
              <BookOpen size={9} /> Description
            </p>
            <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{mission.description}</p>
          </div>
        )}

        {/* Technical footer */}
        <div className="sci-panel p-2 border-slate-800/40 bg-slate-900/30">
          <p className="text-[10px] font-mono-sc text-slate-600 break-all">{mission.class_name}</p>
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
      { page, search: debouncedSearch, type, legal, sharing, faction, category, availability, blueprintOnly, sortBy },
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
        blueprintReward: blueprintOnly ? 'true' : undefined,
        sort: sortBy === 'default' ? undefined : sortBy,
      }),
  });

  const hasFilters = !!(type || debouncedSearch || legal || sharing || faction || category || availability || blueprintOnly);

  const { data: selectedMissionFallback } = useQuery({
    queryKey: ['missions.single', selectedUuid, env],
    queryFn: () => api.missions.single(selectedUuid!, env),
    enabled: !!selectedUuid && !data?.data?.find((m) => m.uuid === selectedUuid),
  });

  const sel: Mission | null = data?.data?.find((m) => m.uuid === selectedUuid) ?? selectedMissionFallback ?? null;

  const displayedMissions = data?.data ?? [];
  const blueprintCount = data?.summary?.blueprintRewards ?? 0;
  const avgReward = data?.summary?.averageReward ?? null;
  const legalCount = data?.summary?.legalMissions ?? 0;
  const illegalCount = data?.summary?.illegalMissions ?? 0;
  const shareableCount = data?.summary?.shareableMissions ?? 0;
  const uniqueCount = data?.summary?.uniqueMissions ?? 0;
  const avgDanger = data?.summary?.averageDanger ?? null;

  useEffect(() => {
    if (displayedMissions.length && !selectedUuid) setSelectedUuid(displayedMissions[0].uuid);
  }, [displayedMissions, selectedUuid]);

  const resetAll = () => {
    setType(''); setSearch(''); setLegal(''); setFaction('');
    setCategory(''); setAvailability(''); setSharing(''); setBlueprintOnly(false); setSortBy('default'); setPage(1);
  };

  return (
    <PageShell>
      <PageHeader
        title="Mission Database"
        count={data?.total}
        countLabel="missions"
        search={search}
        searchPlaceholder="Search mission, giver, class name…"
        onSearch={(v) => { setSearch(v); setPage(1); }}
      />

      {/* Stats bar + quick actions */}
      {data && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {faction && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/30 rounded-sm border border-purple-900/50 text-[10px] font-mono-sc text-purple-300">
              <Users size={10} /> faction {faction}
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-slate-500">
            <ClipboardList size={10} /> {data?.total.toLocaleString()} missions
          </div>
          {avgReward != null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-slate-500">
              <Coins size={10} /> avg {avgReward.toLocaleString()} aUEC
            </div>
          )}
          {legalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-green-500">
              <Scale size={10} /> {legalCount.toLocaleString()} legal
            </div>
          )}
          {illegalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-red-500">
              <Skull size={10} /> {illegalCount.toLocaleString()} illegal
            </div>
          )}
          {shareableCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-cyan-500">
              <Share2 size={10} /> {shareableCount.toLocaleString()} group
            </div>
          )}
          {uniqueCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-amber-500">
              <Trophy size={10} /> {uniqueCount.toLocaleString()} unique
            </div>
          )}
          {avgDanger != null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded-sm border border-slate-800 text-[10px] font-mono-sc text-slate-500">
              <Skull size={10} /> danger avg {avgDanger}
            </div>
          )}
          {blueprintCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setBlueprintOnly((v) => !v);
                setPage(1);
              }}
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
                onClick={() => {
                  setSortBy(val);
                  setPage(1);
                }}
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

      <ListFilterBar>
        <ListFilterSelect
          value={type}
          onChange={(v) => { setType(v); setPage(1); }}
          options={(types ?? []).map((t) => ({ label: getTypeMeta(t).label, value: t }))}
          allLabel="All mission types"
        />
        <ListFilterSelect
          value={faction}
          onChange={(v) => { setFaction(v); setPage(1); }}
          options={(factions ?? []).map((f) => ({ label: f, value: f }))}
          allLabel="All factions"
        />
        <ListFilterSelect
          value={category}
          onChange={(v) => { setCategory(v); setPage(1); }}
          options={(categories ?? []).map((c) => ({ label: c, value: c }))}
          allLabel="All categories"
        />
        <ListFilterSelect
          value={legal}
          onChange={(v) => { setLegal(v); setPage(1); }}
          options={[{ label: 'Legal', value: 'true' }, { label: 'Illegal', value: 'false' }]}
          allLabel="All legality"
        />
        <ListFilterSelect
          value={sharing}
          onChange={(v) => { setSharing(v); setPage(1); }}
          options={[{ label: 'Group', value: 'true' }, { label: 'Solo', value: 'false' }]}
          allLabel="All play"
        />
        <ListFilterSelect
          value={availability}
          onChange={(v) => { setAvailability(v); setPage(1); }}
          options={[{ label: 'Unique', value: 'unique' }, { label: 'Repeatable', value: 'repeatable' }]}
          allLabel="All recurrence"
        />
        {hasFilters && (
          <ListFilterResetButton onClick={resetAll} />
        )}
      </ListFilterBar>

      {/* Content */}
      <div className="min-w-0">
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
            <DetailPanel m={sel} env={env} />
          ) : (
            <ScifiPanel title="Mission Detail" subtitle="Select a mission">
              <p className="text-xs text-slate-500">Click a mission in the list to view its details.</p>
            </ScifiPanel>
          )}
      </div>
        </div>
      </div>
    </PageShell>
  );
}
