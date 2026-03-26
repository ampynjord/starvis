import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, FlaskConical, Layers, Minus, Package, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import type { CraftingRecipe } from '@/types/api';

const LIMIT = 50;

const CATEGORY_COLORS: Record<string, 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate'> = {
  FPSArmours: 'amber',
  FPSWeapons: 'red',
  Misc: 'slate',
  Tool: 'cyan',
  Food: 'green',
  Drink: 'cyan',
  Medicine: 'purple',
  Ammunition: 'red',
  Component: 'slate',
  Refining: 'amber',
  Explosive: 'red',
};

const CATEGORY_ICONS: Record<string, string> = {
  FPSArmours: '🛡️',
  FPSWeapons: '🔫',
  Misc: '📦',
  Tool: '🔧',
  Food: '🍗',
  Drink: '🥤',
  Medicine: '💊',
  Ammunition: '🎯',
  Explosive: '💥',
};

function formatTime(secs: number | null): string {
  if (!secs) return '—';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}min`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatName(recipe: CraftingRecipe): string {
  if (recipe.name) {
    return recipe.name
      .replace(/^bp[_ ]craft[_ ]/i, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return recipe.class_name
    .replace(/^CraftingBlueprintRecord\.BP_CRAFT_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CraftingPage() {
  const searchParams = useSearchParams();
  const { env } = useEnv();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [category, setCategory] = useState('');
  const [selectedRecipeUuid, setSelectedRecipeUuid] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(1);

  const debouncedSearch = useDebounce(search, 350);

  const { data: categories } = useQuery({
    queryKey: ['crafting.categories', env],
    queryFn: () => api.crafting.categories(env),
    staleTime: Infinity,
  });

  const totalRecipes = useMemo(() => (categories ?? []).reduce((s, c) => s + c.count, 0), [categories]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['crafting.recipes', env, { page, search: debouncedSearch, category }],
    queryFn: () =>
      api.crafting.recipes({
        env,
        page,
        limit: LIMIT,
        search: debouncedSearch || undefined,
        category: category || undefined,
      }),
  });

  const { data: selectedRecipe } = useQuery({
    queryKey: ['crafting.recipe', selectedRecipeUuid, env],
    queryFn: () => api.crafting.recipe(selectedRecipeUuid!, env),
    enabled: !!selectedRecipeUuid,
  });

  useEffect(() => {
    if (!data?.data?.length) return;
    if (!selectedRecipeUuid || !data.data.some((r) => r.uuid === selectedRecipeUuid)) {
      setSelectedRecipeUuid(data.data[0].uuid);
    }
  }, [data?.data, selectedRecipeUuid]);

  return (
    <div className="max-w-screen-2xl mx-auto flex flex-col h-[calc(100vh-64px)]">
      {/* ─── Top Bar ─── */}
      <div className="flex items-center gap-4 flex-wrap px-1 py-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <FlaskConical size={18} className="text-cyan-400" />
          <h1 className="font-orbitron text-base font-bold text-cyan-400 tracking-widest uppercase">Crafting</h1>
          <span className="text-[10px] font-mono-sc text-slate-600 border border-slate-800 rounded px-1.5 py-0.5">
            {totalRecipes} blueprints
          </span>
        </div>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search blueprint…"
            className="sci-input w-full pl-8 text-xs h-8"
          />
        </div>
      </div>

      {/* ─── 3-Column Layout ─── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[160px_1fr_380px] gap-0 min-h-0 overflow-hidden">

        {/* ── Left: Category Sidebar ── */}
        <div className="border-r border-slate-800/60 overflow-y-auto py-2">
          <button
            type="button"
            onClick={() => { setCategory(''); setPage(1); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs font-mono-sc transition-colors ${
              !category ? 'text-cyan-400 bg-cyan-950/30 border-r-2 border-cyan-500' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>ALL</span>
            <span className="text-[10px] text-slate-600">{totalRecipes}</span>
          </button>
          {(categories ?? []).map((c) => {
            const color = CATEGORY_COLORS[c.category] ?? 'slate';
            const icon = CATEGORY_ICONS[c.category] ?? '📄';
            const active = category === c.category;
            return (
              <button
                key={c.category}
                type="button"
                onClick={() => { setCategory(active ? '' : c.category); setPage(1); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs font-mono-sc transition-colors ${
                  active ? 'text-cyan-400 bg-cyan-950/30 border-r-2 border-cyan-500' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span>{icon}</span>
                  <span className="uppercase truncate">{c.category}</span>
                </span>
                <GlowBadge color={color} size="xs">{c.count}</GlowBadge>
              </button>
            );
          })}
        </div>

        {/* ── Center: Recipe List ── */}
        <div className="border-r border-slate-800/60 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="p-4"><LoadingGrid message="LOADING BLUEPRINTS…" /></div>
          ) : error ? (
            <div className="p-4"><ErrorState error={error as Error} onRetry={() => void refetch()} /></div>
          ) : !data?.data?.length ? (
            <div className="p-4"><EmptyState icon="🔧" title="No blueprints found" /></div>
          ) : (
            <>
              <div className="divide-y divide-slate-800/40">
                {data.data.map((r, i) => {
                  const active = selectedRecipeUuid === r.uuid;
                  const color = CATEGORY_COLORS[r.category ?? ''] ?? 'slate';
                  return (
                    <motion.button
                      key={r.uuid}
                      type="button"
                      onClick={() => { setSelectedRecipeUuid(r.uuid); setBatchCount(1); }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.01, 0.2) }}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        active
                          ? 'bg-cyan-950/30 border-l-2 border-cyan-500'
                          : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${active ? 'text-cyan-300 font-medium' : 'text-slate-300'}`}>
                          {formatName(r)}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {r.crafting_time_s != null && (
                            <span className="flex items-center gap-0.5 text-[10px] font-mono-sc text-slate-600">
                              <Clock size={9} />
                              {formatTime(r.crafting_time_s)}
                            </span>
                          )}
                          {r.output_quantity > 1 && (
                            <span className="text-[10px] font-mono-sc text-cyan-500">×{r.output_quantity}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {r.category && <GlowBadge color={color} size="xs">{r.category}</GlowBadge>}
                        {r.station_type && (
                          <span className="text-[9px] font-mono-sc text-slate-700 uppercase">{r.station_type}</span>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              {data.pages > 1 && (
                <div className="p-3 border-t border-slate-800/40">
                  <Pagination page={page} totalPages={data.pages} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: Recipe Detail ── */}
        <div className="overflow-y-auto min-h-0 bg-slate-950/30">
          {selectedRecipe ? (
            <div className="p-4 space-y-4">
              {/* Title + quantity */}
              <div>
                <h2 className="font-orbitron text-lg font-bold text-slate-100 tracking-wide">
                  {formatName(selectedRecipe)}
                </h2>
                {selectedRecipe.category && (
                  <div className="mt-1.5">
                    <GlowBadge color={CATEGORY_COLORS[selectedRecipe.category] ?? 'slate'}>
                      {selectedRecipe.category}
                    </GlowBadge>
                  </div>
                )}
              </div>

              {/* Quantity selector */}
              <div className="sci-panel p-3">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-2">Quantity</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setBatchCount((v) => Math.max(1, v - 1))} className="sci-btn sci-btn-ghost p-1.5 rounded"><Minus size={14} /></button>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={batchCount}
                    onChange={(e) => setBatchCount(Math.max(1, Number(e.target.value) || 1))}
                    className="sci-input w-14 text-sm text-center font-mono-sc"
                  />
                  <button type="button" onClick={() => setBatchCount((v) => Math.min(999, v + 1))} className="sci-btn sci-btn-ghost p-1.5 rounded"><Plus size={14} /></button>
                  <div className="flex gap-1 ml-2">
                    {[1, 5, 10, 25, 100].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setBatchCount(n)}
                        className={`px-2 py-1 text-[10px] font-mono-sc rounded border transition-colors ${
                          batchCount === n
                            ? 'border-cyan-500 bg-cyan-950/50 text-cyan-400'
                            : 'border-slate-700 text-slate-600 hover:border-slate-500 hover:text-slate-400'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Output */}
              <div className="sci-panel p-3">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-2">Output</p>
                <div className="flex items-center gap-3">
                  <Package size={16} className="text-cyan-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">
                      {(selectedRecipe.output_item_name ?? selectedRecipe.name ?? '—').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                  </div>
                  <span className="font-mono-sc text-cyan-400 text-sm font-bold">
                    ×{(selectedRecipe.output_quantity ?? 1) * batchCount}
                  </span>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="sci-panel p-3">
                  <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider">Crafting Time</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Clock size={14} className="text-amber-500" />
                    <span className="text-sm font-mono-sc text-slate-200">
                      {formatTime(selectedRecipe.crafting_time_s ? selectedRecipe.crafting_time_s * batchCount : null)}
                    </span>
                  </div>
                  {batchCount > 1 && selectedRecipe.crafting_time_s && (
                    <p className="text-[10px] text-slate-700 font-mono-sc mt-1">
                      {formatTime(selectedRecipe.crafting_time_s)} × {batchCount}
                    </p>
                  )}
                </div>
                <div className="sci-panel p-3">
                  <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider">Station</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <FlaskConical size={14} className="text-purple-500" />
                    <span className="text-sm font-mono-sc text-slate-200">{selectedRecipe.station_type ?? '—'}</span>
                  </div>
                </div>
                {selectedRecipe.skill_level != null && (
                  <div className="sci-panel p-3">
                    <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider">Skill Level</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Layers size={14} className="text-green-500" />
                      <span className="text-sm font-mono-sc text-slate-200">{selectedRecipe.skill_level}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Ingredients / Parts */}
              <div className="sci-panel p-3">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-3">
                  Parts {batchCount > 1 && <span className="text-cyan-500">(×{batchCount})</span>}
                </p>
                {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 ? (
                  <div className="space-y-2">
                    {selectedRecipe.ingredients.map((ing) => (
                      <div key={ing.id} className="flex items-center gap-3 py-1.5 border-b border-slate-800/40 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-300 truncate">
                            {ing.item_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </p>
                          {ing.is_optional && (
                            <span className="text-[9px] font-mono-sc text-slate-600 uppercase">Optional</span>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-mono-sc font-bold text-cyan-400">
                            ×{ing.quantity * batchCount}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-xs text-slate-600 font-mono-sc">No ingredient data available</p>
                    <p className="text-[10px] text-slate-700 mt-1">Ingredient extraction not yet supported for this blueprint</p>
                  </div>
                )}
              </div>

              {/* Raw class name (debug / reference) */}
              <div className="pt-2 border-t border-slate-800/40">
                <p className="text-[9px] font-mono-sc text-slate-800 break-all">{selectedRecipe.class_name}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FlaskConical size={32} className="text-slate-800 mx-auto mb-2" />
                <p className="text-xs text-slate-700 font-mono-sc">Select a blueprint</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
