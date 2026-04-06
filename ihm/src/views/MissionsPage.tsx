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
  Search,
  Share2,
  Shield,
  Skull,
  Truck,
  User,
  Users,
  Wrench,
  X,
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
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
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

// ── ChipGroup ─────────────────────────────────────────────────────────────────

function ChipGroup({
  options,
  value,
  onChange,
}: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors ${!value ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-border'}`}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors ${value === opt ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-border'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── TypeChipGroup ─────────────────────────────────────────────────────────────

function TypeChipGroup({
  options,
  value,
  onChange,
}: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors ${!value ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-border'}`}
      >
        All
      </button>
      {options.map((opt) => {
        const meta = getTypeMeta(opt);
        const active = value === opt;
        const activeCls = active
          ? `bg-${meta.color}-950/60 text-${meta.color}-400 border-${meta.color}-800`
          : 'text-slate-500 hover:text-slate-300 border-transparent hover:border-border';
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? '' : opt)}
            className={`flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors border ${activeCls}`}
          >
            {meta.icon}
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ── ToggleGroup ───────────────────────────────────────────────────────────────

function ToggleGroup({
  options,
  value,
  onChange,
}: { options: { label: string; value: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-0.5">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`px-2.5 py-1.5 rounded-l text-xs font-mono-sc transition-colors border ${!value ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800' : 'text-slate-500 border-border hover:text-slate-300'}`}
      >
        All
      </button>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(value === opt.value ? '' : opt.value)}
          className={`px-2.5 py-1.5 text-xs font-mono-sc transition-colors border ${i === options.length - 1 ? 'rounded-r' : ''} ${value === opt.value ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800' : 'text-slate-500 border-border hover:text-slate-300'}`}
        >
          {opt.label}
        </button>
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

  const hasFilters = !!(type || debouncedSearch || legal || sharing || faction || category || availability);

  const { data: selectedMissionFallback } = useQuery({
    queryKey: ['missions.single', selectedUuid, env],
    queryFn: () => api.missions.single(selectedUuid!, env),
    enabled: !!selectedUuid && !data?.data?.find((m) => m.uuid === selectedUuid),
  });

  const sel: Mission | null = data?.data?.find((m) => m.uuid === selectedUuid) ?? selectedMissionFallback ?? null;

  useEffect(() => {
    if (data?.data?.length && !selectedUuid) setSelectedUuid(data.data[0].uuid);
  }, [data?.data, selectedUuid]);

  const summary = useMemo(() => {
    if (!data) return null;
    return { total: data.total, showing: data.data.length };
  }, [data]);

  const resetAll = () => {
    setType(''); setSearch(''); setLegal(''); setFaction('');
    setCategory(''); setAvailability(''); setSharing(''); setPage(1);
  };

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm border border-cyan-800 bg-cyan-950/40 flex items-center justify-center shrink-0">
              <ClipboardList size={18} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase leading-none">
                Mission Database
              </h1>
              {summary && (
                <p className="text-xs text-slate-500 mt-0.5 font-mono-sc">
                  {summary.showing.toLocaleString('en-US')} / {summary.total.toLocaleString('en-US')} missions
                  {data && (
                    <span className="ml-3 text-slate-600">
                      ·{' '}
                      <span className="text-green-600">{data.data.filter(m => m.is_legal).length} legal</span>
                      {' '}·{' '}
                      <span className="text-red-600">{data.data.filter(m => !m.is_legal).length} illegal</span>
                      {data.data.some(m => m.has_blueprint_reward) && (
                        <>
                          {' '}·{' '}
                          <span className="text-purple-500">{data.data.filter(m => m.has_blueprint_reward).length} blueprints</span>
                        </>
                      )}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search mission, giver, class name…"
              className="sci-input w-full pl-8 text-xs"
            />
          </div>
        </div>

        {/* Filter bar */}
        <div className="sci-panel p-3 space-y-3">
          {/* Mission type chips with icons */}
          {types && types.length > 0 && (
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">
                Mission Type
              </p>
              <TypeChipGroup
                options={types}
                value={type}
                onChange={(v) => { setType(v); setPage(1); }}
              />
            </div>
          )}

          {/* Faction chips */}
          {factions && factions.length > 0 && (
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">
                <Shield size={9} className="inline mr-1" />Faction
              </p>
              <ChipGroup
                options={factions}
                value={faction}
                onChange={(v) => { setFaction(v); setPage(1); }}
              />
            </div>
          )}

          {/* Category + toggles row */}
          <div className="flex flex-wrap gap-4 items-end">
            {categories && categories.length > 0 && (
              <div>
                <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Category</p>
                <ChipGroup
                  options={categories}
                  value={category}
                  onChange={(v) => { setCategory(v); setPage(1); }}
                />
              </div>
            )}
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Legality</p>
              <ToggleGroup
                options={[{ label: 'Legal', value: 'true' }, { label: 'Illegal', value: 'false' }]}
                value={legal}
                onChange={(v) => { setLegal(v); setPage(1); }}
              />
            </div>
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Group play</p>
              <ToggleGroup
                options={[{ label: 'Group', value: 'true' }, { label: 'Solo', value: 'false' }]}
                value={sharing}
                onChange={(v) => { setSharing(v); setPage(1); }}
              />
            </div>
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Recurrence</p>
              <ToggleGroup
                options={[{ label: 'Unique', value: 'unique' }, { label: 'Repeatable', value: 'repeatable' }]}
                value={availability}
                onChange={(v) => { setAvailability(v); setPage(1); }}
              />
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors ml-auto"
              >
                <X size={12} /> Reset filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Mission list */}
        <div>
          {isLoading ? (
            <LoadingGrid message="LOADING MISSIONS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState icon="📋" title="No missions found" />
          ) : (
            <>
              <div className="space-y-1.5">
                {data.data.map((m, i) => (
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
              {data.pages > 1 && (
                <div className="mt-4">
                  <Pagination page={page} totalPages={data.pages} onPageChange={setPage} />
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
  );
}

