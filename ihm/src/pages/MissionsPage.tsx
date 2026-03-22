import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, Scale, Search, Share2, Shield, User } from 'lucide-react';
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
  Misc: 'slate',
};

export default function MissionsPage() {
  const [searchParams] = useSearchParams();
  const { env } = useEnv();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [type, setType] = useState('');
  const [legal, setLegal] = useState('');
  const [shared, setShared] = useState(false);
  const [selectedMissionUuid, setSelectedMissionUuid] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  const { data: types } = useQuery({
    queryKey: ['missions.types', env],
    queryFn: () => api.missions.types(env),
    staleTime: Infinity,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['missions.list', env, { page, search: debouncedSearch, type, legal, shared }],
    queryFn: () =>
      api.missions.list({
        env,
        page,
        limit: LIMIT,
        search: debouncedSearch || undefined,
        type: type || undefined,
        legal: legal || undefined,
        shared: shared ? 'true' : undefined,
      }),
  });

  const hasFilters = !!(type || debouncedSearch || legal || shared);
  const selectedMission = data?.data?.find((m) => m.uuid === selectedMissionUuid) ?? null;

  useEffect(() => {
    if (!data?.data?.length) return;
    if (!selectedMissionUuid) {
      setSelectedMissionUuid(data.data[0].uuid);
    }
  }, [data?.data, selectedMissionUuid]);

  const summary = useMemo(() => {
    const rows = data?.data ?? [];
    return {
      legal: rows.filter((m) => m.is_legal).length,
      illegal: rows.filter((m) => !m.is_legal).length,
      shared: rows.filter((m) => m.can_be_shared).length,
    };
  }, [data?.data]);

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Missions</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.total.toLocaleString('en-US')} contrats</p>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => {
                setShared(e.target.checked);
                setPage(1);
              }}
              className="accent-cyan-500 w-3.5 h-3.5"
            />
            <Share2 size={12} />
            Partageables
          </label>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher mission, class, description…"
              className="sci-input w-full pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-4">
        <div className="w-full lg:w-44">
          <FilterPanel
            hasFilters={hasFilters}
            onReset={() => {
              setType('');
              setSearch('');
              setLegal('');
              setShared(false);
              setPage(1);
            }}
            groups={[
              {
                key: 'type',
                label: 'Type',
                options: (types ?? []).map((t: string) => ({ label: t, value: t })),
                value: type,
                onChange: (v: string) => {
                  setType(v);
                  setPage(1);
                },
              },
              {
                key: 'legal',
                label: 'Légalité',
                options: LEGAL_OPTIONS,
                value: legal,
                onChange: (v: string) => {
                  setLegal(v);
                  setPage(1);
                },
              },
            ]}
          />
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
            <div>
              <div className="sci-panel p-3 mb-4 grid grid-cols-3 gap-2 text-xs font-mono-sc">
                <div className="text-slate-500">Legal <span className="text-green-400">{summary.legal}</span></div>
                <div className="text-slate-500">Illegal <span className="text-red-400">{summary.illegal}</span></div>
                <div className="text-slate-500">Shareable <span className="text-cyan-400">{summary.shared}</span></div>
              </div>

              {isLoading ? (
                <LoadingGrid message="CHARGEMENT MISSIONS…" />
              ) : error ? (
                <ErrorState error={error as Error} onRetry={() => void refetch()} />
              ) : !data?.data?.length ? (
                <EmptyState icon="📋" title="Aucune mission trouvée" />
              ) : (
                <>
                  <div className="space-y-1.5">
                    {data.data.map((m, i) => {
                      const color = TYPE_COLORS[m.mission_type ?? ''] ?? 'slate';
                      return (
                        <motion.div
                          key={m.uuid}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i * 0.02, 0.3) }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedMissionUuid(m.uuid)}
                            className={`sci-panel w-full text-left px-4 py-3 transition-colors ${selectedMissionUuid === m.uuid ? 'border-cyan-600' : 'hover:border-cyan-800'}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-orbitron text-sm text-slate-200 truncate">{m.title ?? m.class_name}</span>
                                  {m.mission_type && <GlowBadge color={color}>{m.mission_type}</GlowBadge>}
                                  {!m.is_legal && <GlowBadge color="red" size="xs">Illégale</GlowBadge>}
                                  {m.can_be_shared && <GlowBadge color="green" size="xs">Partageable</GlowBadge>}
                                  {m.only_owner_complete && <GlowBadge color="amber" size="xs">Solo</GlowBadge>}
                                </div>
                                {m.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{m.description}</p>}
                                <p className="text-xs font-mono-sc text-slate-700 mt-0.5">{m.class_name}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                {m.completion_time_s != null && (
                                  <span className="flex items-center gap-1 text-xs font-mono-sc text-slate-500">
                                    <Clock size={10} />
                                    {formatDuration(m.completion_time_s)}
                                  </span>
                                )}
                                {m.is_legal ? <Shield size={12} className="text-green-600" /> : <Scale size={12} className="text-red-600" />}
                                {m.can_be_shared ? <Share2 size={12} className="text-cyan-600" /> : <User size={12} className="text-slate-600" />}
                              </div>
                            </div>
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>

                  {data.pages > 1 && (
                    <div className="mt-4">
                      <Pagination page={page} totalPages={data.pages} onPageChange={setPage} />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="xl:sticky xl:top-6">
              {selectedMission ? (
                <ScifiPanel title="Mission Detail" subtitle={selectedMission.title ?? selectedMission.class_name}>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Mission Type</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{selectedMission.mission_type ?? '—'}</p>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Legal</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{selectedMission.is_legal ? 'Yes' : 'No'}</p>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Shareable</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{selectedMission.can_be_shared ? 'Yes' : 'No'}</p>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Owner Only Completion</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{selectedMission.only_owner_complete ? 'Yes' : 'No'}</p>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Estimated Duration</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{formatDuration(selectedMission.completion_time_s) || '—'}</p>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Environment</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5 uppercase">{selectedMission.game_env}</p>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Class Name</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5 break-all">{selectedMission.class_name}</p>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">UUID</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5 break-all">{selectedMission.uuid}</p>
                    </div>
                    {selectedMission.description && (
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase">Description</p>
                        <p className="text-sm text-slate-400 mt-1 leading-relaxed whitespace-pre-wrap">{selectedMission.description}</p>
                      </div>
                    )}
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
