'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Clock,
  Coins,
  FlaskConical,
  MapPin,
  Scale,
  Search,
  Share2,
  Shield,
  Skull,
  Star,
  X,
} from 'lucide-react';
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

function rankLabel(rep: number | null): string {
  if (rep == null) return '—';
  if (rep <= 0) return '0';
  if (rep <= 50) return '1';
  if (rep <= 100) return '2';
  if (rep <= 200) return '3';
  if (rep <= 400) return '4';
  if (rep <= 800) return '5';
  return '6';
}

// ── Color maps ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate'> = {
  Bounty: 'amber',
  Combat: 'red',
  Delivery: 'cyan',
  Escort: 'green',
  Infiltration: 'purple',
  Salvage: 'slate',
  Mining: 'cyan',
  Investigation: 'slate',
  Recovery: 'green',
  Trade: 'cyan',
  Patrol: 'green',
  Race: 'amber',
  Espionage: 'purple',
  Siege: 'red',
  Construction: 'slate',
  Maintenance: 'slate',
  Misc: 'slate',
};

const CATEGORY_COLORS: Record<string, 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate'> = {
  Career: 'cyan',
  Story: 'amber',
  Wikelo: 'purple',
  ASD: 'green',
  ACE: 'red',
  Event: 'amber',
};

// ── ChipGroup ────────────────────────────────────────────────────────────────

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
        className={`px-2 py-1 rounded text-xs font-mono-sc transition-colors ${!value ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-border'}`}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-2 py-1 rounded text-xs font-mono-sc transition-colors ${value === opt ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-border'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── ToggleGroup ──────────────────────────────────────────────────────────────

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

// ── MissionCard ──────────────────────────────────────────────────────────────

function MissionCard({
  m,
  isSelected,
  onClick,
}: { m: Mission; isSelected: boolean; onClick: () => void }) {
  const reward = formatReward(m.reward_min, m.reward_max, m.reward_currency);
  const typeColor = TYPE_COLORS[m.mission_type ?? ''] ?? 'slate';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`sci-panel w-full text-left px-4 py-3 transition-colors ${isSelected ? 'border-cyan-600' : 'hover:border-cyan-800'}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Row 1: faction prefix + title */}
          <div className="flex items-center gap-2 flex-wrap">
            {m.faction && (
              <span className="text-[10px] font-mono-sc text-purple-400 uppercase tracking-wider flex-shrink-0">
                {m.faction}
              </span>
            )}
            <span className="font-orbitron text-sm text-slate-200 truncate">
              {m.title ?? m.class_name}
            </span>
          </div>
          {/* Row 2: system + type + badges */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {m.location_system && (
              <span className="text-[10px] font-mono-sc text-slate-500 bg-slate-800/40 px-1.5 py-0.5 rounded">
                {m.location_system}
              </span>
            )}
            {m.mission_type && (
              <GlowBadge color={typeColor} size="xs">
                {m.display_mission_type ?? m.mission_type}
              </GlowBadge>
            )}
            {!m.is_legal && (
              <GlowBadge color="red" size="xs">
                Illegal
              </GlowBadge>
            )}
            {m.has_blueprint_reward && (
              <GlowBadge color="purple" size="xs">
                <FlaskConical size={9} className="inline -mt-0.5" /> Blueprint
              </GlowBadge>
            )}
            {m.is_unique && (
              <GlowBadge color="slate" size="xs">
                Unique
              </GlowBadge>
            )}
          </div>
        </div>
        {/* Right column: reward + XP */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {reward && (
            <div className="text-right">
              <p className="text-[10px] font-mono-sc text-slate-600 uppercase">Reward</p>
              <p className="text-sm font-orbitron text-amber-400">{reward}</p>
            </div>
          )}
          {m.base_xp != null && (
            <div className="text-right">
              <p className="text-[10px] font-mono-sc text-slate-600 uppercase">Base XP</p>
              <p className="text-xs font-mono-sc text-green-400">
                {m.base_xp.toLocaleString('en-US')}
              </p>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function MissionsPage() {
  const searchParams = useSearchParams();
  const { env } = useEnv();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [type, setType] = useState('');
  const [legal, setLegal] = useState('');
  const [faction, setFaction] = useState('');
  const [system, setSystem] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [sharing, setSharing] = useState('');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
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
  const { data: systems } = useQuery({
    queryKey: ['missions.systems', env],
    queryFn: () => api.missions.systems(env),
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
      { page, search: debouncedSearch, type, legal, sharing, faction, system, category, availability },
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
        system: system || undefined,
        category: category || undefined,
        unique: availability === 'unique' ? 'true' : availability === 'repeatable' ? 'false' : undefined,
      }),
  });

  const hasFilters = !!(type || debouncedSearch || legal || sharing || faction || system || category || availability);
  const sel: Mission | null = (data?.data?.find((m) => m.uuid === selectedUuid) ?? null);

  useEffect(() => {
    if (data?.data?.length && !selectedUuid) setSelectedUuid(data.data[0].uuid);
  }, [data?.data, selectedUuid]);

  const summary = useMemo(() => {
    if (!data) return null;
    return { total: data.total, showing: data.data.length };
  }, [data]);

  const resetAll = () => {
    setType('');
    setSearch('');
    setLegal('');
    setFaction('');
    setSystem('');
    setCategory('');
    setAvailability('');
    setSharing('');
    setPage(1);
  };

  return (
    <div className="max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
              Mission Database
            </h1>
            {summary && (
              <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
                {summary.showing} of {summary.total.toLocaleString('en-US')} missions
              </p>
            )}
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search mission, class, description…"
              className="sci-input w-full pl-8 text-xs"
            />
          </div>
        </div>

        {/* ── Filter bar (SCMDB style) ─────────────── */}
        <div className="sci-panel p-3 space-y-3">
          {/* Category chips */}
          {categories && categories.length > 0 && (
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Category</p>
              <ChipGroup
                options={categories}
                value={category}
                onChange={(v) => {
                  setCategory(v);
                  setPage(1);
                }}
              />
            </div>
          )}
          {/* System chips */}
          {systems && systems.length > 0 && (
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">
                Star System
              </p>
              <ChipGroup
                options={systems}
                value={system}
                onChange={(v) => {
                  setSystem(v);
                  setPage(1);
                }}
              />
            </div>
          )}
          {/* Selects row */}
          <div className="flex flex-wrap gap-6">
            {types && types.length > 0 && (
              <div>
                <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">
                  Mission Type
                </p>
                <select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    setPage(1);
                  }}
                  className="sci-select text-xs w-44"
                >
                  <option value="">All types</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {factions && factions.length > 0 && (
              <div>
                <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Faction</p>
                <select
                  value={faction}
                  onChange={(e) => {
                    setFaction(e.target.value);
                    setPage(1);
                  }}
                  className="sci-select text-xs w-44"
                >
                  <option value="">All factions</option>
                  {factions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {/* Toggles row */}
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Legality</p>
              <ToggleGroup
                options={[
                  { label: 'Legal', value: 'true' },
                  { label: 'Illegal', value: 'false' },
                ]}
                value={legal}
                onChange={(v) => {
                  setLegal(v);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Sharing</p>
              <ToggleGroup
                options={[
                  { label: 'Sharable', value: 'true' },
                  { label: 'Solo', value: 'false' },
                ]}
                value={sharing}
                onChange={(v) => {
                  setSharing(v);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">
                Availability
              </p>
              <ToggleGroup
                options={[
                  { label: 'Unique', value: 'unique' },
                  { label: 'Repeatable', value: 'repeatable' },
                ]}
                value={availability}
                onChange={(v) => {
                  setAvailability(v);
                  setPage(1);
                }}
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

      {/* ── Content ────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
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

        {/* ── Detail Panel ─────────────────────────── */}
        <div className="xl:sticky xl:top-6">
          {sel ? (
            <ScifiPanel title="Mission Detail" subtitle={sel.title ?? sel.class_name}>
              <div className="grid grid-cols-1 gap-2">
                {/* Reward */}
                {(sel.reward_min != null || sel.reward_max != null) && (
                  <div className="sci-panel p-3 bg-amber-950/20 border-amber-900/30">
                    <p className="text-xs text-amber-600 font-mono-sc uppercase flex items-center gap-1">
                      <Coins size={11} /> Reward
                    </p>
                    <p className="text-lg font-orbitron text-amber-400 mt-1">
                      {formatReward(sel.reward_min, sel.reward_max, sel.reward_currency)}
                    </p>
                  </div>
                )}
                {/* XP + Rep row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="sci-panel p-2.5">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase flex items-center gap-1">
                      <Star size={10} /> Base XP
                    </p>
                    <p className="text-sm font-mono-sc text-green-400 mt-0.5">
                      {sel.base_xp != null ? sel.base_xp.toLocaleString('en-US') : '—'}
                    </p>
                  </div>
                  <div className="sci-panel p-2.5">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase">Rep Reward</p>
                    <p className="text-sm font-mono-sc text-green-400 mt-0.5">
                      {sel.reputation_reward != null ? `+${sel.reputation_reward}` : '—'}
                    </p>
                  </div>
                </div>
                {/* Faction / Giver */}
                {(sel.mission_giver || sel.faction) && (
                  <div className="sci-panel p-2.5">
                    {sel.faction && (
                      <>
                        <p className="text-xs text-slate-600 font-mono-sc uppercase">Faction</p>
                        <p className="text-sm font-mono-sc text-purple-400">{sel.faction}</p>
                      </>
                    )}
                    {sel.mission_giver && (
                      <>
                        <p className="text-xs text-slate-600 font-mono-sc uppercase mt-1">Mission Giver</p>
                        <p className="text-sm font-mono-sc text-slate-300">{sel.mission_giver}</p>
                      </>
                    )}
                  </div>
                )}
                {/* Location */}
                {(sel.location_system || sel.location_name) && (
                  <div className="sci-panel p-2.5">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase flex items-center gap-1">
                      <MapPin size={10} /> Location
                    </p>
                    <p className="text-sm font-mono-sc text-slate-300 mt-0.5">
                      {[sel.location_system, sel.location_planet, sel.location_name].filter(Boolean).join(' › ')}
                    </p>
                  </div>
                )}
                {/* Properties */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="sci-panel p-2.5 text-center">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase">
                      <Skull size={10} className="inline -mt-0.5" /> Danger
                    </p>
                    <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{sel.danger_level ?? '—'}</p>
                  </div>
                  <div className="sci-panel p-2.5 text-center">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase">Rank</p>
                    <p className="text-sm font-mono-sc text-cyan-400 mt-0.5">
                      {rankLabel(sel.required_reputation)}
                    </p>
                  </div>
                  <div className="sci-panel p-2.5 text-center">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase">
                      <Clock size={10} className="inline -mt-0.5" /> Duration
                    </p>
                    <p className="text-sm font-mono-sc text-slate-300 mt-0.5">
                      {formatDuration(sel.completion_time_s) || '—'}
                    </p>
                  </div>
                </div>
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {sel.mission_type && (
                    <GlowBadge color={TYPE_COLORS[sel.mission_type] ?? 'slate'}>{sel.display_mission_type ?? sel.mission_type}</GlowBadge>
                  )}
                  {sel.category && (
                    <GlowBadge color={CATEGORY_COLORS[sel.category] ?? 'slate'}>{sel.display_category ?? sel.category}</GlowBadge>
                  )}
                  <GlowBadge color={sel.is_legal ? 'green' : 'red'}>
                    {sel.is_legal ? (
                      <>
                        <Shield size={10} /> Legal
                      </>
                    ) : (
                      <>
                        <Scale size={10} /> Illegal
                      </>
                    )}
                  </GlowBadge>
                  <GlowBadge color={sel.can_be_shared ? 'cyan' : 'slate'}>
                    <Share2 size={10} /> {sel.can_be_shared ? 'Sharable' : 'Solo'}
                  </GlowBadge>
                  <GlowBadge color={sel.is_unique ? 'amber' : 'slate'}>
                    {sel.is_unique ? 'Unique' : 'Repeatable'}
                  </GlowBadge>
                  {sel.has_blueprint_reward && (
                    <GlowBadge color="purple">
                      <FlaskConical size={10} /> Blueprint
                    </GlowBadge>
                  )}
                </div>
                {/* Description */}
                {sel.description && (
                  <div className="sci-panel p-2.5">
                    <p className="text-xs text-slate-600 font-mono-sc uppercase flex items-center gap-1">
                      <BookOpen size={10} /> Description
                    </p>
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed whitespace-pre-wrap">
                      {sel.description}
                    </p>
                  </div>
                )}
                {/* Class name */}
                <div className="sci-panel p-2.5 border-slate-800/50">
                  <p className="text-xs text-slate-600 font-mono-sc uppercase">Class Name</p>
                  <p className="text-[10px] font-mono-sc text-slate-500 mt-0.5 break-all">{sel.class_name}</p>
                </div>
              </div>
            </ScifiPanel>
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
