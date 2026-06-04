'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Banknote, ClipboardList, Filter, Loader2, Scale, Search, Shield, Skull, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useEnv } from '@/contexts/EnvContext';
import { api } from '@/services/api';
import type { FactionSummary } from '@/types/api';

function formatUec(value: number | null) {
  return value == null ? 'N/A' : `${Math.round(value).toLocaleString('en-US')} aUEC`;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="sci-panel border border-slate-800/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-slate-600">
        {icon}
        <span className="font-mono-sc text-[9px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-1 font-orbitron text-lg font-bold text-slate-100">{value}</div>
    </div>
  );
}

function FactionCard({ faction }: { faction: FactionSummary }) {
  const illegalRatio = faction.mission_count > 0 ? faction.illegal_missions / faction.mission_count : 0;
  const badge = illegalRatio > 0.5 ? 'Hostile' : faction.illegal_missions > 0 ? 'Mixed' : 'Lawful';
  const color = badge === 'Hostile' ? 'red' : badge === 'Mixed' ? 'amber' : 'cyan';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="sci-panel border border-slate-800/70 p-4 hover:border-cyan-900/60 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-orbitron text-base font-bold tracking-wider text-white truncate">{faction.name}</h2>
          <p className="mt-1 font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
            {faction.mission_count} missions - {faction.shareable_missions} shareable
          </p>
        </div>
        <GlowBadge color={color as 'cyan' | 'amber' | 'red'}>{badge}</GlowBadge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat icon={<Scale size={11} />} label="Legal" value={faction.legal_missions} />
        <Stat icon={<Skull size={11} />} label="Illegal" value={faction.illegal_missions} />
        <Stat icon={<Banknote size={11} />} label="Avg" value={<span className="text-sm">{formatUec(faction.reward_average)}</span>} />
      </div>

      <div className="mt-4 space-y-2">
        {faction.mission_types.length > 0 && <Chips label="Types" values={faction.mission_types} />}
        {faction.categories.length > 0 && <Chips label="Categories" values={faction.categories} />}
        {faction.systems.length > 0 && <Chips label="Systems" values={faction.systems} />}
        {faction.mission_givers.length > 0 && <Chips label="Givers" values={faction.mission_givers} />}
      </div>
    </motion.article>
  );
}

function Chips({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="mb-1 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">{label}</div>
      <div className="flex flex-wrap gap-1">
        {values.slice(0, 8).map((value) => (
          <span key={value} className="rounded-sm border border-slate-800 bg-slate-950/60 px-1.5 py-0.5 font-mono-sc text-[10px] text-slate-400">
            {value}
          </span>
        ))}
        {values.length > 8 && <span className="font-mono-sc text-[10px] text-slate-600">+{values.length - 8}</span>}
      </div>
    </div>
  );
}

export default function FactionsPage() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'all' | 'lawful' | 'mixed' | 'hostile'>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['factions', env],
    queryFn: () => api.factions.list(env),
    staleTime: 5 * 60_000,
  });

  const factions = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return factions.filter((faction) => {
      const illegalRatio = faction.mission_count > 0 ? faction.illegal_missions / faction.mission_count : 0;
      const modeMatch =
        mode === 'all' ||
        (mode === 'lawful' && faction.illegal_missions === 0) ||
        (mode === 'mixed' && faction.illegal_missions > 0 && illegalRatio <= 0.5) ||
        (mode === 'hostile' && illegalRatio > 0.5);
      const searchMatch =
        !q ||
        faction.name.toLowerCase().includes(q) ||
        faction.mission_givers.some((giver) => giver.toLowerCase().includes(q)) ||
        faction.mission_types.some((type) => type.toLowerCase().includes(q));
      return modeMatch && searchMatch;
    });
  }, [factions, mode, search]);

  const totals = useMemo(
    () => ({
      missions: factions.reduce((sum, faction) => sum + faction.mission_count, 0),
      legal: factions.reduce((sum, faction) => sum + faction.legal_missions, 0),
      illegal: factions.reduce((sum, faction) => sum + faction.illegal_missions, 0),
      blueprints: factions.reduce((sum, faction) => sum + faction.blueprint_reward_missions, 0),
    }),
    [factions],
  );

  if (error) return <ErrorState error={error as Error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-400">
            <Shield size={20} />
            <h1 className="font-orbitron text-2xl font-bold uppercase tracking-widest text-white">Factions</h1>
          </div>
          <p className="mt-1 font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
            Mission organizations, legality profile and reward bands
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search faction, giver or type..." className="sci-input w-full pl-9 pr-9" />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="sci-input">
            <option value="all">All profiles</option>
            <option value="lawful">Lawful</option>
            <option value="mixed">Mixed</option>
            <option value="hostile">Hostile</option>
          </select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Users size={12} />} label="Factions" value={factions.length} />
        <Stat icon={<ClipboardList size={12} />} label="Missions" value={totals.missions} />
        <Stat icon={<Scale size={12} />} label="Legal" value={totals.legal} />
        <Stat icon={<Skull size={12} />} label="Illegal" value={totals.illegal} />
      </div>

      <ScifiPanel
        title="Faction Index"
        subtitle={`${filtered.length} visible`}
        actions={<Filter size={14} className="text-cyan-600" />}
        className="p-4"
      >
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-cyan-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center font-mono-sc text-sm text-slate-600">No factions match the current filters.</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((faction) => (
              <FactionCard key={faction.name} faction={faction} />
            ))}
          </div>
        )}
      </ScifiPanel>
    </div>
  );
}
