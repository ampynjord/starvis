import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, Coins, MapPin, Scale, Search, Share2, Shield, Skull, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 40;

const LEGAL_OPTIONS = [
  { label: 'Légale', value: 'true' },
  { label: 'Illégale', value: 'false' },
];

function formatDuration(secs: number | null): string {
  if (!secs) return '';
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatReward(min: number | null, max: number | null, currency?: string | null): string {
  const c = currency ?? 'aUEC';
  if (min != null && max != null && min !== max) return `${min.toLocaleString('en-US')} – ${max.toLocaleString('en-US')} ${c}`;
  if (max != null) return `${max.toLocaleString('en-US')} ${c}`;
  if (min != null) return `${min.toLocaleString('en-US')} ${c}`;
  return '';
}

function dangerBadge(level: number | null) {
  if (level == null) return null;
  const colors = ['green', 'green', 'amber', 'amber', 'red', 'red'] as const;
  const color = colors[Math.min(level, 5)] ?? 'red';
  return <GlowBadge color={color} size="xs">Danger {level}</GlowBadge>;
}

const TYPE_COLORS: Record<string, 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate'> = {
  Bounty: 'amber', Combat: 'red', Delivery: 'cyan', Escort: 'green',
  Infiltration: 'purple', Salvage: 'slate', Mining: 'cyan', Investigation: 'slate',
  Recovery: 'green', Trade: 'cyan', Patrol: 'green', Race: 'amber',
  Espionage: 'purple', Siege: 'red', Construction: 'slate', Misc: 'slate',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type M = Record<string, any>;

export default function MissionsPage() {
  const [searchParams] = useSearchParams();
  const { env } = useEnv();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [type, setType] = useState('');
  const [legal, setLegal] = useState('');
  const [faction, setFaction] = useState('');
  const [system, setSystem] = useState('');
  const [shared, setShared] = useState(false);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 350);

  const { data: types } = useQuery({ queryKey: ['missions.types', env], queryFn: () => api.missions.types(env), staleTime: Infinity });
  const { data: factions } = useQuery({ queryKey: ['missions.factions', env], queryFn: () => api.missions.factions(env), staleTime: Infinity });
  const { data: systems } = useQuery({ queryKey: ['missions.systems', env], queryFn: () => api.missions.systems(env), staleTime: Infinity });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['missions.list', env, { page, search: debouncedSearch, type, legal, shared, faction, system }],
    queryFn: () =>
      api.missions.list({
        env, page, limit: LIMIT,
        search: debouncedSearch || undefined,
        type: type || undefined,
        legal: legal || undefined,
        shared: shared ? 'true' : undefined,
        faction: faction || undefined,
        system: system || undefined,
      }),
  });

  const hasFilters = !!(type || debouncedSearch || legal || shared || faction || system);
  const sel: M | null = data?.data?.find((m: M) => m.uuid === selectedUuid) ?? null;

  useEffect(() => {
    if (data?.data?.length && !selectedUuid) setSelectedUuid(data.data[0].uuid);
  }, [data?.data, selectedUuid]);

  const summary = useMemo(() => {
    const rows: M[] = data?.data ?? [];
    return {
      total: data?.total ?? 0,
      legal: rows.filter((m) => m.is_legal).length,
      illegal: rows.filter((m) => !m.is_legal).length,
      shared: rows.filter((m) => m.can_be_shared).length,
      withReward: rows.filter((m) => m.reward_max != null).length,
    };
  }, [data]);

  const resetAll = () => { setType(''); setSearch(''); setLegal(''); setFaction(''); setSystem(''); setShared(false); setPage(1); };

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Mission Database</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.total.toLocaleString('en-US')} contrats indexés</p>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input type="checkbox" checked={shared} onChange={(e) => { setShared(e.target.checked); setPage(1); }} className="accent-cyan-500 w-3.5 h-3.5" />
            <Share2 size={12} /> Partageables
          </label>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher mission, class, description…" className="sci-input w-full pl-8 text-xs" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
        <FilterPanel hasFilters={hasFilters} onReset={resetAll} groups={[
          { key: 'type', label: 'Type', options: (types ?? []).map((t: string) => ({ label: t, value: t })), value: type, onChange: (v: string) => { setType(v); setPage(1); } },
          { key: 'legal', label: 'Légalité', options: LEGAL_OPTIONS, value: legal, onChange: (v: string) => { setLegal(v); setPage(1); } },
          { key: 'faction', label: 'Faction', options: (factions ?? []).map((f: string) => ({ label: f, value: f })), value: faction, onChange: (v: string) => { setFaction(v); setPage(1); } },
          { key: 'system', label: 'Système', options: (systems ?? []).map((s: string) => ({ label: s, value: s })), value: system, onChange: (v: string) => { setSystem(v); setPage(1); } },
        ]} />

        <div className="min-w-0">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
            <div>
              <div className="sci-panel p-3 mb-4 grid grid-cols-5 gap-2 text-xs font-mono-sc">
                <div className="text-slate-500">Total <span className="text-cyan-400">{summary.total}</span></div>
                <div className="text-slate-500">Legal <span className="text-green-400">{summary.legal}</span></div>
                <div className="text-slate-500">Illegal <span className="text-red-400">{summary.illegal}</span></div>
                <div className="text-slate-500">Shared <span className="text-cyan-400">{summary.shared}</span></div>
                <div className="text-slate-500">w/ Reward <span className="text-amber-400">{summary.withReward}</span></div>
              </div>

              {isLoading ? <LoadingGrid message="CHARGEMENT MISSIONS…" />
               : error ? <ErrorState error={error as Error} onRetry={() => void refetch()} />
               : !data?.data?.length ? <EmptyState icon="📋" title="Aucune mission trouvée" />
               : (
                <>
                  <div className="space-y-1.5">
                    {data.data.map((m: M, i: number) => {
                      const color = TYPE_COLORS[m.mission_type ?? ''] ?? 'slate';
                      const reward = formatReward(m.reward_min, m.reward_max, m.reward_currency);
                      return (
                        <motion.div key={m.uuid} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
                          <button type="button" onClick={() => setSelectedUuid(m.uuid)}
                            className={`sci-panel w-full text-left px-4 py-3 transition-colors ${selectedUuid === m.uuid ? 'border-cyan-600' : 'hover:border-cyan-800'}`}>
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-orbitron text-sm text-slate-200 truncate">{m.title ?? m.class_name}</span>
                                  {m.mission_type && <GlowBadge color={color}>{m.mission_type}</GlowBadge>}
                                  {!m.is_legal && <GlowBadge color="red" size="xs">Illégale</GlowBadge>}
                                  {m.can_be_shared && <GlowBadge color="green" size="xs">Partageable</GlowBadge>}
                                  {dangerBadge(m.danger_level)}
                                </div>
                                <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                                  {reward && <span className="flex items-center gap-1 text-amber-400 font-mono-sc"><Coins size={10} /> {reward}</span>}
                                  {m.faction && <span className="flex items-center gap-1 text-purple-400 font-mono-sc"><Star size={10} /> {m.faction}</span>}
                                  {(m.location_system || m.location_name) && (
                                    <span className="flex items-center gap-1 text-slate-500 font-mono-sc">
                                      <MapPin size={10} /> {[m.location_system, m.location_planet, m.location_name].filter(Boolean).join(' › ')}
                                    </span>
                                  )}
                                </div>
                                {m.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{m.description}</p>}
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                {m.completion_time_s != null && (
                                  <span className="flex items-center gap-1 text-xs font-mono-sc text-slate-500"><Clock size={10} /> {formatDuration(m.completion_time_s)}</span>
                                )}
                                {m.is_legal ? <Shield size={12} className="text-green-600" /> : <Scale size={12} className="text-red-600" />}
                              </div>
                            </div>
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                  {data.pages > 1 && <div className="mt-4"><Pagination page={page} totalPages={data.pages} onPageChange={setPage} /></div>}
                </>
              )}
            </div>

            {/* Detail Panel */}
            <div className="xl:sticky xl:top-6">
              {sel ? (
                <ScifiPanel title="Mission Detail" subtitle={sel.title ?? sel.class_name}>
                  <div className="grid grid-cols-1 gap-2">
                    {(sel.reward_min || sel.reward_max) && (
                      <div className="sci-panel p-3 bg-amber-950/20 border-amber-900/30">
                        <p className="text-xs text-amber-600 font-mono-sc uppercase flex items-center gap-1"><Coins size={11} /> Reward</p>
                        <p className="text-lg font-orbitron text-amber-400 mt-1">{formatReward(sel.reward_min, sel.reward_max, sel.reward_currency)}</p>
                      </div>
                    )}
                    {(sel.mission_giver || sel.faction) && (
                      <div className="sci-panel p-2.5">
                        {sel.mission_giver && <><p className="text-xs text-slate-600 font-mono-sc uppercase">Mission Giver</p><p className="text-sm font-mono-sc text-slate-300">{sel.mission_giver}</p></>}
                        {sel.faction && <><p className="text-xs text-slate-600 font-mono-sc uppercase mt-1">Faction</p><p className="text-sm font-mono-sc text-purple-400">{sel.faction}</p></>}
                      </div>
                    )}
                    {(sel.location_system || sel.location_name) && (
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase flex items-center gap-1"><MapPin size={10} /> Location</p>
                        <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{[sel.location_system, sel.location_planet, sel.location_name].filter(Boolean).join(' › ')}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase flex items-center gap-1"><Skull size={10} /> Danger</p>
                        <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{sel.danger_level ?? '—'}</p>
                      </div>
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase">Rep Required</p>
                        <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{sel.required_reputation ?? '—'}</p>
                      </div>
                    </div>
                    {sel.reputation_reward != null && (
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase">Reputation Reward</p>
                        <p className="text-sm font-mono-sc text-green-400 mt-0.5">+{sel.reputation_reward}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="sci-panel p-2.5"><p className="text-xs text-slate-600 font-mono-sc uppercase">Type</p><p className="text-sm font-mono-sc text-slate-300 mt-0.5">{sel.mission_type ?? '—'}</p></div>
                      <div className="sci-panel p-2.5"><p className="text-xs text-slate-600 font-mono-sc uppercase">Duration</p><p className="text-sm font-mono-sc text-slate-300 mt-0.5">{formatDuration(sel.completion_time_s) || '—'}</p></div>
                      <div className="sci-panel p-2.5"><p className="text-xs text-slate-600 font-mono-sc uppercase">Legal</p><p className={`text-sm font-mono-sc mt-0.5 ${sel.is_legal ? 'text-green-400' : 'text-red-400'}`}>{sel.is_legal ? 'Yes' : 'No'}</p></div>
                      <div className="sci-panel p-2.5"><p className="text-xs text-slate-600 font-mono-sc uppercase">Shareable</p><p className="text-sm font-mono-sc text-slate-300 mt-0.5">{sel.can_be_shared ? 'Yes' : 'No'}</p></div>
                    </div>
                    {sel.description && (
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase">Description</p>
                        <p className="text-sm text-slate-400 mt-1 leading-relaxed whitespace-pre-wrap">{sel.description}</p>
                      </div>
                    )}
                    <div className="sci-panel p-2.5 border-slate-800/50">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Class Name</p>
                      <p className="text-[10px] font-mono-sc text-slate-500 mt-0.5 break-all">{sel.class_name}</p>
                    </div>
                  </div>
                </ScifiPanel>
              ) : (
                <ScifiPanel title="Mission Detail" subtitle="Select a mission">
                  <p className="text-xs text-slate-500">Clique sur une mission dans la liste pour voir son détail complet.</p>
                </ScifiPanel>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
