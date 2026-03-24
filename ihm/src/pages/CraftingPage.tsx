import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, FlaskConical, Layers, Minus, Package, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import type { CraftingRecipe } from '@/types/api';

const LIMIT = 40;

const CATEGORY_COLORS: Record<string, 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate'> = {
  Food: 'green',
  Drink: 'cyan',
  Medicine: 'purple',
  Armor: 'amber',
  Weapon: 'red',
  Ammunition: 'red',
  Component: 'slate',
  Refining: 'amber',
  Explosive: 'red',
  Tool: 'slate',
  Misc: 'slate',
};

function formatTime(secs: number | null): string {
  if (!secs) return '—';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function CraftingPage() {
  const [searchParams] = useSearchParams();
  const { env } = useEnv();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [category, setCategory] = useState('');
  const [stationType, setStationType] = useState('');
  const [selectedRecipeUuid, setSelectedRecipeUuid] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(1);

  const debouncedSearch = useDebounce(search, 350);

  const { data: categories } = useQuery({
    queryKey: ['crafting.categories', env],
    queryFn: () => api.crafting.categories(env),
    staleTime: Infinity,
  });

  const { data: stationTypes } = useQuery({
    queryKey: ['crafting.stationTypes', env],
    queryFn: () => api.crafting.stationTypes(env),
    staleTime: Infinity,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['crafting.recipes', env, { page, search: debouncedSearch, category, stationType }],
    queryFn: () =>
      api.crafting.recipes({
        env,
        page,
        limit: LIMIT,
        search: debouncedSearch || undefined,
        category: category || undefined,
        stationType: stationType || undefined,
      }),
  });

  const { data: selectedRecipe } = useQuery({
    queryKey: ['crafting.recipe', selectedRecipeUuid, env],
    queryFn: () => api.crafting.recipe(selectedRecipeUuid!, env),
    enabled: !!selectedRecipeUuid,
  });

  const hasFilters = !!(category || debouncedSearch || stationType);

  useEffect(() => {
    if (!data?.data?.length) return;
    if (!selectedRecipeUuid) {
      setSelectedRecipeUuid(data.data[0].uuid);
    }
  }, [data?.data, selectedRecipeUuid]);

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Crafting</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.total.toLocaleString('en-US')} recettes</p>}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher recette, ingrédient…"
            className="sci-input w-full pl-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-4">
        <div className="w-full lg:w-44">
          <FilterPanel
            hasFilters={hasFilters}
            onReset={() => {
              setCategory('');
              setStationType('');
              setSearch('');
              setPage(1);
            }}
            groups={[
              {
                key: 'category',
                label: 'Catégorie',
                options: (categories ?? []).map((c) => ({ label: `${c.category} (${c.count})`, value: c.category })),
                value: category,
                onChange: (v: string) => {
                  setCategory(v);
                  setPage(1);
                },
              },
              {
                key: 'stationType',
                label: 'Station',
                options: (stationTypes ?? []).map((t) => ({ label: t, value: t })),
                value: stationType,
                onChange: (v: string) => {
                  setStationType(v);
                  setPage(1);
                },
              },
            ]}
          />
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
            <div>
              {isLoading ? (
                <LoadingGrid message="CHARGEMENT RECETTES…" />
              ) : error ? (
                <ErrorState error={error as Error} onRetry={() => void refetch()} />
              ) : !data?.data?.length ? (
                <EmptyState icon="🔧" title="Aucune recette trouvée" />
              ) : (
                <>
                  <div className="space-y-1.5">
                    {data.data.map((r: CraftingRecipe, i: number) => {
                      const color = CATEGORY_COLORS[r.category ?? ''] ?? 'slate';
                      return (
                        <motion.div
                          key={r.uuid}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i * 0.02, 0.3) }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedRecipeUuid(r.uuid)}
                            className={`sci-panel w-full text-left px-4 py-3 transition-colors ${selectedRecipeUuid === r.uuid ? 'border-cyan-600' : 'hover:border-cyan-800'}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-orbitron text-sm text-slate-200 truncate">{r.name ?? r.class_name}</span>
                                  {r.category && <GlowBadge color={color}>{r.category}</GlowBadge>}
                                  {r.output_quantity > 1 && <GlowBadge color="cyan" size="xs">×{r.output_quantity}</GlowBadge>}
                                </div>
                                {r.output_item_name && <p className="text-xs text-slate-500 mt-1">Produit : {r.output_item_name}</p>}
                                <p className="text-xs font-mono-sc text-slate-700 mt-0.5">{r.class_name}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                {r.crafting_time_s != null && (
                                  <span className="flex items-center gap-1 text-xs font-mono-sc text-slate-500">
                                    <Clock size={10} />
                                    {formatTime(r.crafting_time_s)}
                                  </span>
                                )}
                                {r.station_type && (
                                  <span className="text-[10px] font-mono-sc text-slate-600">{r.station_type}</span>
                                )}
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
              {selectedRecipe ? (
                <ScifiPanel title="Détail recette" subtitle={selectedRecipe.name ?? selectedRecipe.class_name}>
                  <div className="grid grid-cols-1 gap-2">
                    {/* Batch multiplier */}
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase mb-1">Batch (×N)</p>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setBatchCount((v) => Math.max(1, v - 1))} className="sci-btn sci-btn-ghost p-1"><Minus size={12} /></button>
                        <input type="number" min={1} max={999} value={batchCount} onChange={(e) => setBatchCount(Math.max(1, Number(e.target.value) || 1))} className="sci-input w-16 text-xs text-center" />
                        <button type="button" onClick={() => setBatchCount((v) => Math.min(999, v + 1))} className="sci-btn sci-btn-ghost p-1"><Plus size={12} /></button>
                        {[1, 5, 10, 25].map((n) => (
                          <button key={n} type="button" onClick={() => setBatchCount(n)} className={`px-2 py-0.5 text-[10px] font-mono-sc rounded border transition-colors ${batchCount === n ? 'border-cyan-500 bg-cyan-950/50 text-cyan-400' : 'border-slate-700 text-slate-600 hover:border-slate-600'}`}>×{n}</button>
                        ))}
                      </div>
                    </div>

                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Catégorie</p>
                      <p className="text-sm font-mono-sc text-slate-300 mt-0.5">{selectedRecipe.category ?? '—'}</p>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Produit</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Package size={14} className="text-cyan-500" />
                        <span className="text-sm font-mono-sc text-slate-300">{selectedRecipe.output_item_name ?? '—'}</span>
                        <GlowBadge color="cyan" size="xs">×{(selectedRecipe.output_quantity ?? 1) * batchCount}</GlowBadge>
                      </div>
                    </div>
                    <div className="sci-panel p-2.5">
                      <p className="text-xs text-slate-600 font-mono-sc uppercase">Temps total</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock size={14} className="text-amber-500" />
                        <span className="text-sm font-mono-sc text-slate-300">
                          {formatTime(selectedRecipe.crafting_time_s ? selectedRecipe.crafting_time_s * batchCount : null)}
                        </span>
                        {batchCount > 1 && selectedRecipe.crafting_time_s && (
                          <span className="text-[10px] text-slate-600">({formatTime(selectedRecipe.crafting_time_s)} × {batchCount})</span>
                        )}
                      </div>
                    </div>
                    {selectedRecipe.station_type && (
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase">Station</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <FlaskConical size={14} className="text-purple-500" />
                          <span className="text-sm font-mono-sc text-slate-300">{selectedRecipe.station_type}</span>
                        </div>
                      </div>
                    )}
                    {selectedRecipe.skill_level != null && (
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase">Niveau requis</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Layers size={14} className="text-green-500" />
                          <span className="text-sm font-mono-sc text-slate-300">{selectedRecipe.skill_level}</span>
                        </div>
                      </div>
                    )}

                    {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 && (
                      <div className="sci-panel p-2.5">
                        <p className="text-xs text-slate-600 font-mono-sc uppercase mb-2">
                          Ingrédients {batchCount > 1 && <span className="text-cyan-500">(×{batchCount})</span>}
                        </p>
                        <div className="space-y-1.5">
                          {selectedRecipe.ingredients.map((ing) => (
                            <div key={ing.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-slate-300 truncate">{ing.item_name}</span>
                                {ing.is_optional && <GlowBadge color="slate" size="xs">opt.</GlowBadge>}
                              </div>
                              <span className="font-mono-sc text-cyan-400 flex-shrink-0">×{ing.quantity * batchCount}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScifiPanel>
              ) : (
                <ScifiPanel title="Détail recette" subtitle="Sélectionnez une recette">
                  <p className="text-xs text-slate-600 text-center py-8">Aucune recette sélectionnée</p>
                </ScifiPanel>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
