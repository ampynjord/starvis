'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Archive,
  Bell,
  Calendar,
  ChevronRight,
  Clock,
  Crosshair,
  Eye,
  FlaskConical,
  Gauge,
  Link as LinkIcon,
  Package,
  Radio,
  Search,
  Share2,
  Shield,
  Skull,
  Truck,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Mission } from '@/types/api';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ScifiPanel } from '@/components/ui/ScifiPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    return `${min.toLocaleString('en-US')}–${max.toLocaleString('en-US')} ${c}`;
  if (max != null) return `${max.toLocaleString('en-US')} ${c}`;
  if (min != null) return `${min.toLocaleString('en-US')} ${c}`;
  return '';
}

// ── Faction color assignment ──────────────────────────────────────────────────

type BadgeColor = 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate';

const FACTION_COLORS: BadgeColor[] = ['cyan', 'amber', 'green', 'red', 'purple', 'slate'];

function factionColor(name: string): BadgeColor {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FACTION_COLORS[hash % FACTION_COLORS.length];
}

// ── Mission type meta (reused from Missions page) ─────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  Hauling:              <Truck size={10} />,
  Hauling_Interstellar: <Truck size={10} />,
  Hauling_Planetary:    <Truck size={10} />,
  Hauling_Solar:        <Truck size={10} />,
  Collection:           <Archive size={10} />,
  Mercenary:            <Crosshair size={10} />,
  Delivery:             <Package size={10} />,
  Investigation:        <Eye size={10} />,
  Priority:             <AlertTriangle size={10} />,
  Salvage:              <Wrench size={10} />,
  'Service Beacons':    <Radio size={10} />,
  'Bounty Hunter':      <Skull size={10} />,
  Racing:               <Gauge size={10} />,
  Maintenance:          <Wrench size={10} />,
  Appointment:          <Calendar size={10} />,
  'ECN Alert':          <Bell size={10} />,
};

const TYPE_COLORS: Record<string, BadgeColor> = {
  Hauling: 'cyan', Hauling_Interstellar: 'cyan', Hauling_Planetary: 'cyan', Hauling_Solar: 'cyan',
  Collection: 'amber', Mercenary: 'red', Delivery: 'cyan', Investigation: 'purple',
  Priority: 'amber', Salvage: 'slate', 'Service Beacons': 'green', 'Bounty Hunter': 'amber',
  Racing: 'green', Maintenance: 'slate', Appointment: 'slate', 'ECN Alert': 'red',
};

function typeColor(t: string | null): BadgeColor {
  return TYPE_COLORS[t ?? ''] ?? 'slate';
}

function typeIcon(t: string | null): React.ReactNode {
  return TYPE_ICONS[t ?? ''] ?? <Zap size={10} />;
}

// ── FactionCard ───────────────────────────────────────────────────────────────

function FactionCard({
  name,
  isSelected,
  missionCount,
  onClick,
}: { name: string; isSelected: boolean; missionCount: number; onClick: () => void }) {
  const color = factionColor(name);
  const borderColors: Record<BadgeColor, string> = {
    cyan:   'border-l-cyan-600',   amber: 'border-l-amber-500',
    green:  'border-l-green-500',  red:   'border-l-red-500',
    purple: 'border-l-purple-500', slate: 'border-l-slate-600',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group w-full text-left px-4 py-3 rounded-sm border border-l-2 transition-all duration-150',
        borderColors[color],
        isSelected
          ? `bg-${color}-950/20 border-t-${color}-900/60 border-r-${color}-900/60 border-b-${color}-900/60`
          : 'bg-panel/60 border-t-border border-r-border border-b-border hover:border-t-slate-700 hover:border-r-slate-700 hover:border-b-slate-700 hover:bg-white/[0.02]',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-sm bg-${color}-950/60 border border-${color}-900/60 text-${color}-400`}>
          <Shield size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-rajdhani font-bold text-sm uppercase tracking-wide truncate ${isSelected ? `text-${color}-200` : 'text-slate-200 group-hover:text-slate-100'}`}>
            {name}
          </p>
          <p className="text-[10px] font-mono-sc text-slate-600 mt-0.5">
            {missionCount} mission{missionCount !== 1 ? 's' : ''}
          </p>
        </div>
        <ChevronRight size={14} className={`shrink-0 ${isSelected ? `text-${color}-400` : 'text-slate-700 group-hover:text-slate-500'}`} />
      </div>
    </button>
  );
}

// ── MissionRow ────────────────────────────────────────────────────────────────

function MissionRow({ m }: { m: Mission }) {
  const color = typeColor(m.mission_type);
  const reward = formatReward(m.reward_min, m.reward_max, m.reward_currency);

  return (
    <Link
      href={`/missions?selected=${m.uuid}`}
      className="group flex items-start gap-3 px-4 py-3 rounded-sm border border-l-2 transition-all duration-150 bg-panel/60 border-t-border border-r-border border-b-border hover:border-t-slate-700 hover:border-r-slate-700 hover:border-b-slate-700 hover:bg-white/[0.02] border-l-slate-600"
    >
      <div className={`shrink-0 mt-0.5 flex items-center justify-center w-6 h-6 rounded-sm bg-${color}-950/60 border border-${color}-900/60 text-${color}-400`}>
        {typeIcon(m.mission_type)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-rajdhani font-semibold text-sm text-slate-200 group-hover:text-slate-100 truncate leading-tight">
          {m.title ?? m.class_name}
        </p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {m.mission_type && (
            <span className={`text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-${color}-950/40 border-${color}-900/60 text-${color}-400`}>
              {m.mission_type.replace(/_/g, ' ')}
            </span>
          )}
          {!m.is_legal && (
            <span className="text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-red-950/40 border-red-900/60 text-red-400">
              <Skull size={8} className="inline mr-0.5" />Illegal
            </span>
          )}
          {!!m.can_be_shared && (
            <span className="text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-cyan-950/40 border-cyan-900/60 text-cyan-400">
              <Share2 size={8} className="inline mr-0.5" />Group
            </span>
          )}
          {!!m.has_blueprint_reward && (
            <span className="text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-purple-950/40 border-purple-900/60 text-purple-400">
              <FlaskConical size={8} className="inline mr-0.5" />Blueprint
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {reward && (
          <p className="text-sm font-orbitron text-amber-400 whitespace-nowrap">{reward}</p>
        )}
        <div className="flex items-center gap-2">
          {m.danger_level != null && (
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={`w-1 h-1 rounded-full ${i < m.danger_level! ? 'bg-red-500' : 'bg-slate-700'}`} />
              ))}
            </div>
          )}
          {m.completion_time_s != null && (
            <span className="text-[10px] font-mono-sc text-slate-600 flex items-center gap-0.5">
              <Clock size={9} />{formatDuration(m.completion_time_s)}
            </span>
          )}
        </div>
        <LinkIcon size={10} className="text-slate-700 group-hover:text-cyan-500" />
      </div>
    </Link>
  );
}

// ── FactionDetail ─────────────────────────────────────────────────────────────

function FactionDetail({ faction, env }: { faction: string; env: string }) {
  const color = factionColor(faction);

  const { data, isLoading } = useQuery({
    queryKey: ['factions.missions', faction, env],
    queryFn: () => api.missions.list({ env, faction, limit: 200 }),
    staleTime: 2 * 60_000,
  });

  const missions = data?.data ?? [];
  const legalCount = missions.filter((m) => m.is_legal).length;
  const illegalCount = missions.filter((m) => !m.is_legal).length;
  const blueprintCount = missions.filter((m) => m.has_blueprint_reward).length;
  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of missions) {
      if (m.mission_type) map[m.mission_type] = (map[m.mission_type] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [missions]);

  return (
    <ScifiPanel
      title={faction}
      subtitle={`${missions.length} missions`}
    >
      {/* Faction header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-800">
        <div className={`w-12 h-12 rounded-sm border border-${color}-800 bg-${color}-950/40 flex items-center justify-center`}>
          <Shield size={24} className={`text-${color}-400`} />
        </div>
        <div>
          <h3 className={`font-orbitron text-lg font-bold text-${color}-400 tracking-widest uppercase`}>
            {faction}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <GlowBadge color={color}><Users size={10} /> Faction</GlowBadge>
          </div>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && missions.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="sci-panel p-2 text-center">
            <p className="text-lg font-orbitron text-slate-200">{missions.length}</p>
            <p className="text-[10px] font-mono-sc text-slate-600 uppercase">Total</p>
          </div>
          <div className="sci-panel p-2 text-center">
            <p className="text-lg font-orbitron text-green-400">{legalCount}</p>
            <p className="text-[10px] font-mono-sc text-slate-600 uppercase">Legal</p>
          </div>
          <div className="sci-panel p-2 text-center">
            <p className="text-lg font-orbitron text-red-400">{illegalCount}</p>
            <p className="text-[10px] font-mono-sc text-slate-600 uppercase">Illegal</p>
          </div>
        </div>
      )}

      {/* Type breakdown */}
      {typeCounts.length > 0 && (
        <div className="mb-4 sci-panel p-3">
          <p className="text-[10px] font-mono-sc text-slate-600 uppercase mb-2">Mission Types</p>
          <div className="flex flex-wrap gap-1.5">
            {typeCounts.map(([type, count]) => {
              const c = typeColor(type);
              return (
                <span key={type} className={`inline-flex items-center gap-1 text-[10px] font-mono-sc px-2 py-1 rounded-sm border bg-${c}-950/40 border-${c}-900/60 text-${c}-400`}>
                  {typeIcon(type)} {type.replace(/_/g, ' ')}
                  <span className="ml-0.5 text-slate-500">({count})</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Blueprint missions highlight */}
      {blueprintCount > 0 && (
        <div className="mb-4 sci-panel p-2.5 bg-purple-950/20 border-purple-900/30">
          <p className="text-[10px] text-purple-500 font-mono-sc uppercase flex items-center gap-1">
            <FlaskConical size={9} /> {blueprintCount} blueprint reward{blueprintCount > 1 ? 's' : ''} available
          </p>
        </div>
      )}

      {/* Mission list */}
      {isLoading ? (
        <LoadingGrid message="LOADING MISSIONS…" />
      ) : missions.length === 0 ? (
        <EmptyState icon="📋" title="No missions found for this faction" />
      ) : (
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
          {missions.map((m, i) => (
            <motion.div
              key={m.uuid}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.01, 0.25) }}
            >
              <MissionRow m={m} />
            </motion.div>
          ))}
        </div>
      )}
    </ScifiPanel>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FactionsPage() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');
  const [selectedFaction, setSelectedFaction] = useState<string | null>(null);

  // All factions
  const { data: factions, isLoading, error, refetch } = useQuery({
    queryKey: ['factions.list', env],
    queryFn: () => api.missions.factions(env),
    staleTime: 5 * 60_000,
  });

  // Mission counts per faction
  const { data: allMissions } = useQuery({
    queryKey: ['factions.overview', env],
    queryFn: () => api.missions.list({ env, limit: 1000 }),
    staleTime: 5 * 60_000,
  });

  const missionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of allMissions?.data ?? []) {
      if (m.faction) map[m.faction] = (map[m.faction] ?? 0) + 1;
    }
    return map;
  }, [allMissions]);

  const filtered = useMemo(() => {
    if (!factions) return [];
    if (!search) return factions;
    const q = search.toLowerCase();
    return factions.filter((f) => f.toLowerCase().includes(q));
  }, [factions, search]);

  // Auto-select first
  useEffect(() => {
    if (filtered.length && !selectedFaction) setSelectedFaction(filtered[0]);
  }, [filtered, selectedFaction]);

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-start gap-4 flex-wrap justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm border border-amber-800 bg-amber-950/40 flex items-center justify-center shrink-0">
            <Shield size={18} className="text-amber-400" />
          </div>
          <div>
            <h1 className="font-orbitron text-xl font-bold text-amber-400 tracking-widest uppercase leading-none">
              Factions
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-mono-sc">
              {factions?.length ?? 0} factions · {(allMissions?.total ?? 0).toLocaleString('en-US')} missions
            </p>
          </div>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter factions…"
            className="sci-input w-full pl-8 text-xs"
          />
        </div>
      </div>

      {/* Content: faction list + detail */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4 items-start">
        {/* Faction list */}
        <div className="xl:sticky xl:top-6">
          {isLoading ? (
            <LoadingGrid message="LOADING FACTIONS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : !filtered.length ? (
            <EmptyState icon="🛡️" title="No factions found" />
          ) : (
            <div className="space-y-1">
              {filtered.map((name, i) => (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <FactionCard
                    name={name}
                    isSelected={selectedFaction === name}
                    missionCount={missionCounts[name] ?? 0}
                    onClick={() => setSelectedFaction(name)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div>
          {selectedFaction ? (
            <FactionDetail faction={selectedFaction} env={env} />
          ) : (
            <ScifiPanel title="Faction Detail" subtitle="Select a faction">
              <p className="text-xs text-slate-500">Select a faction on the left to view their missions, mission types and stats.</p>
            </ScifiPanel>
          )}
        </div>
      </div>
    </div>
  );
}
