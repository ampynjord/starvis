import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { useDebounce } from '@/hooks/useDebounce';

type Tab = 'minerals' | 'commodities' | 'consumables';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'minerals', label: 'Minéraux', icon: '⛏' },
  { key: 'commodities', label: 'Matières premières', icon: '📦' },
  { key: 'consumables', label: 'Consommables', icon: '💊' },
];

const CONSUMABLE_TYPES = ['Food', 'Medical', 'Drug', 'Consumable'];

export default function ResourcesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('minerals');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  // ─── Minerals (mining elements) ────────────────────────
  const { data: minerals, isLoading: loadingMinerals, error: errorMinerals } = useQuery({
    queryKey: ['resources.minerals'],
    queryFn: api.mining.elements,
    staleTime: 5 * 60_000,
    enabled: activeTab === 'minerals',
  });

  // ─── Raw commodities ───────────────────────────────────
  const { data: commoditiesData, isLoading: loadingCommodities, error: errorCommodities } = useQuery({
    queryKey: ['resources.commodities', { search: debouncedSearch }],
    queryFn: () => api.commodities.list({ limit: 200, search: debouncedSearch || undefined }),
    staleTime: 5 * 60_000,
    enabled: activeTab === 'commodities',
  });

  // ─── Consumables (items filtered by type) ──────────────
  const { data: consumablesData, isLoading: loadingConsumables, error: errorConsumables } = useQuery({
    queryKey: ['resources.consumables', { search: debouncedSearch }],
    queryFn: () => api.items.list({ limit: 200, search: debouncedSearch || undefined }),
    staleTime: 5 * 60_000,
    enabled: activeTab === 'consumables',
  });

  const filteredMinerals = (minerals ?? []).filter(
    (m) => !debouncedSearch || m.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const filteredConsumables = (consumablesData?.data ?? []).filter((item) =>
    CONSUMABLE_TYPES.some((t) => item.type === t),
  );

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
            Ressources
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
            Minéraux, matières premières et consommables
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="sci-input w-full pl-8 text-xs"
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-800/60 pb-3 mb-5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-sc rounded border transition-colors',
              activeTab === tab.key
                ? 'bg-cyan-950/40 border-cyan-700/50 text-cyan-300'
                : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300',
            ].join(' ')}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Minerals ─── */}
      {activeTab === 'minerals' && (
        <>
          {loadingMinerals ? (
            <LoadingGrid message="CHARGEMENT ÉLÉMENTS…" />
          ) : errorMinerals ? (
            <ErrorState error={errorMinerals as Error} />
          ) : !filteredMinerals.length ? (
            <EmptyState icon="⛏" title="Aucun minéral trouvé" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {filteredMinerals.map((el, i) => (
                <motion.div
                  key={el.uuid}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.4) }}
                >
                  <Link to={`/mining?element=${el.uuid}`} className="block">
                    <div className="sci-panel px-4 py-3 hover:border-cyan-700 transition-colors h-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-orbitron text-sm text-slate-200 truncate">{el.name}</p>
                          <p className="text-xs font-mono-sc text-slate-700 mt-0.5 truncate">{el.class_name}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {el.instability != null && (
                            <p className="text-xs font-mono-sc text-amber-500/80">
                              Instab. {(el.instability * 100).toFixed(0)}%
                            </p>
                          )}
                          {el.resistance != null && (
                            <p className="text-xs font-mono-sc text-slate-500">
                              Rés. {(el.resistance * 100).toFixed(0)}%
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] font-mono-sc text-cyan-600 flex items-center gap-1">
                        <span>⛏ Voir dans le Solver</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── Raw commodities ─── */}
      {activeTab === 'commodities' && (
        <>
          {loadingCommodities ? (
            <LoadingGrid message="CHARGEMENT MATIÈRES…" />
          ) : errorCommodities ? (
            <ErrorState error={errorCommodities as Error} />
          ) : !commoditiesData?.data?.length ? (
            <EmptyState icon="📦" title="Aucune matière première trouvée" />
          ) : (
            <div className="space-y-1.5">
              {commoditiesData.data.map((c, i) => (
                <motion.div
                  key={c.uuid}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <div className="sci-panel px-4 py-2.5 hover:border-cyan-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-orbitron text-sm text-slate-200">{c.name}</span>
                          {c.type && <GlowBadge color="slate">{c.type}</GlowBadge>}
                          {c.sub_type && <GlowBadge color="slate" size="xs">{c.sub_type}</GlowBadge>}
                        </div>
                        {c.symbol && (
                          <p className="text-xs font-mono-sc text-slate-600 mt-0.5">{c.symbol}</p>
                        )}
                      </div>
                      {c.occupancy_scu != null && (
                        <span className="text-xs font-mono-sc text-slate-600">{c.occupancy_scu} μSCU</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── Consumables ─── */}
      {activeTab === 'consumables' && (
        <>
          {loadingConsumables ? (
            <LoadingGrid message="CHARGEMENT CONSOMMABLES…" />
          ) : errorConsumables ? (
            <ErrorState error={errorConsumables as Error} />
          ) : !filteredConsumables.length ? (
            <EmptyState icon="💊" title="Aucun consommable trouvé" />
          ) : (
            <div className="space-y-1.5">
              {filteredConsumables.map((item, i) => (
                <motion.div
                  key={item.uuid}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <div className="sci-panel px-4 py-2.5 hover:border-cyan-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-orbitron text-sm text-slate-200">{item.name}</span>
                          {item.type && <GlowBadge color="cyan">{item.type}</GlowBadge>}
                          {item.sub_type && (
                            <GlowBadge color="slate" size="xs">{item.sub_type}</GlowBadge>
                          )}
                        </div>
                        <p className="text-xs font-mono-sc text-slate-700 mt-0.5">{item.class_name}</p>
                      </div>
                      {item.manufacturer_name && (
                        <span className="text-xs font-mono-sc text-slate-600 flex-shrink-0">
                          {item.manufacturer_name}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
