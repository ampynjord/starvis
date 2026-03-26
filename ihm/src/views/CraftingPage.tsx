import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Clock, FlaskConical, Minus, Package, Plus, Search, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useDebounce } from '@/hooks/useDebounce';
import type { CraftingRecipe } from '@/types/api';

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

function formatItemName(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Sidebar category group ─── */
function CategoryGroup({
  name,
  count,
  recipes,
  isLoading,
  expanded,
  onToggle,
  selectedUuid,
  onSelect,
  search,
}: {
  name: string;
  count: number;
  recipes: CraftingRecipe[];
  isLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  search: string;
}) {
  const filtered = search
    ? recipes.filter((r) => formatName(r).toLowerCase().includes(search.toLowerCase()))
    : recipes;
  const color = CATEGORY_COLORS[name] ?? 'slate';

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-white/5 transition-colors group"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-slate-600 flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />
        )}
        <span className={`text-xs font-mono-sc uppercase tracking-wider flex-1 truncate ${expanded ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
          {name}
        </span>
        <GlowBadge color={color} size="xs">{count}</GlowBadge>
      </button>
      {expanded && (
        <div className="pb-1">
          {isLoading ? (
            <div className="px-6 py-2 text-[10px] font-mono-sc text-slate-700 animate-pulse">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-2 text-[10px] font-mono-sc text-slate-700">No results</div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.uuid}
                type="button"
                onClick={() => onSelect(r.uuid)}
                className={`w-full text-left pl-7 pr-3 py-1.5 text-xs transition-colors truncate ${
                  selectedUuid === r.uuid
                    ? 'text-cyan-400 bg-cyan-950/40'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                }`}
              >
                {formatName(r)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Ingredient card (sccrafter-style) ─── */
function IngredientCard({ name, quantity, isOptional, batchCount }: { name: string; quantity: number; isOptional: boolean; batchCount: number }) {
  return (
    <div className="sci-panel p-4 border-l-2 border-cyan-700">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <span className="text-sm font-medium text-slate-200">{formatItemName(name)}</span>
        </div>
        {isOptional && <GlowBadge color="slate" size="xs">Optional</GlowBadge>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono-sc text-slate-600 uppercase">Required</span>
        <span className="text-sm font-mono-sc font-bold text-cyan-400">×{quantity * batchCount}</span>
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function CraftingPage() {
  const searchParams = useSearchParams();
  const { env } = useEnv();

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedRecipeUuid, setSelectedRecipeUuid] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(1);

  const debouncedSearch = useDebounce(search, 350);

  // All categories
  const { data: categories } = useQuery({
    queryKey: ['crafting.categories', env],
    queryFn: () => api.crafting.categories(env),
    staleTime: Infinity,
  });

  const totalRecipes = useMemo(() => (categories ?? []).reduce((s, c) => s + c.count, 0), [categories]);

  // Recipes for the expanded category
  const { data: categoryRecipes, isLoading: catLoading } = useQuery({
    queryKey: ['crafting.catRecipes', env, expandedCategory],
    queryFn: () => api.crafting.recipes({ env, category: expandedCategory!, limit: 1000 }),
    enabled: !!expandedCategory && !debouncedSearch,
    staleTime: 60_000,
  });

  // Search across all categories
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['crafting.search', env, debouncedSearch],
    queryFn: () => api.crafting.recipes({ env, search: debouncedSearch, limit: 500 }),
    enabled: !!debouncedSearch,
    staleTime: 30_000,
  });

  // Group search results by category
  const searchGrouped = useMemo(() => {
    if (!debouncedSearch || !searchResults?.data) return null;
    const map = new Map<string, CraftingRecipe[]>();
    for (const r of searchResults.data) {
      const cat = r.category ?? 'Unknown';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    return map;
  }, [debouncedSearch, searchResults]);

  // Selected recipe detail
  const { data: selectedRecipe } = useQuery({
    queryKey: ['crafting.recipe', selectedRecipeUuid, env],
    queryFn: () => api.crafting.recipe(selectedRecipeUuid!, env),
    enabled: !!selectedRecipeUuid,
  });

  // Auto-select first recipe when category expands
  useEffect(() => {
    if (categoryRecipes?.data?.length && !debouncedSearch) {
      if (!selectedRecipeUuid || !categoryRecipes.data.some((r) => r.uuid === selectedRecipeUuid)) {
        setSelectedRecipeUuid(categoryRecipes.data[0].uuid);
      }
    }
  }, [categoryRecipes?.data, selectedRecipeUuid, debouncedSearch]);

  // Auto-expand first category with results on search, auto-select first recipe
  useEffect(() => {
    if (searchGrouped && searchGrouped.size > 0) {
      const firstCat = searchGrouped.keys().next().value!;
      setExpandedCategory(firstCat);
      const firstRecipe = searchGrouped.get(firstCat)?.[0];
      if (firstRecipe) setSelectedRecipeUuid(firstRecipe.uuid);
    }
  }, [searchGrouped]);

  // Auto-expand first category on initial load
  useEffect(() => {
    if (categories?.length && !expandedCategory && !debouncedSearch) {
      setExpandedCategory(categories[0].category);
    }
  }, [categories, expandedCategory, debouncedSearch]);

  return (
    <div className="flex h-[calc(100vh-64px)]">

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div className="w-56 xl:w-64 flex-shrink-0 border-r border-slate-800/60 flex flex-col bg-slate-950/50">
        {/* Search */}
        <div className="p-2.5 border-b border-slate-800/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" size={12} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blueprints…"
              className="sci-input w-full pl-7 text-xs h-7"
            />
          </div>
        </div>

        {/* Category tree */}
        <div className="flex-1 overflow-y-auto">
          {debouncedSearch ? (
            // Search mode: show grouped results
            searchLoading ? (
              <div className="p-4 text-xs font-mono-sc text-slate-600 animate-pulse">Searching…</div>
            ) : searchGrouped && searchGrouped.size > 0 ? (
              Array.from(searchGrouped.entries()).map(([cat, recipes]) => (
                <CategoryGroup
                  key={cat}
                  name={cat}
                  count={recipes.length}
                  recipes={recipes}
                  isLoading={false}
                  expanded={expandedCategory === cat}
                  onToggle={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                  selectedUuid={selectedRecipeUuid}
                  onSelect={(uuid) => { setSelectedRecipeUuid(uuid); setBatchCount(1); }}
                  search=""
                />
              ))
            ) : (
              <div className="p-4 text-xs font-mono-sc text-slate-600">No results for "{debouncedSearch}"</div>
            )
          ) : (
            // Browse mode: show all categories
            (categories ?? []).map((c) => (
              <CategoryGroup
                key={c.category}
                name={c.category}
                count={c.count}
                recipes={expandedCategory === c.category ? (categoryRecipes?.data ?? []) : []}
                isLoading={expandedCategory === c.category && catLoading}
                expanded={expandedCategory === c.category}
                onToggle={() => {
                  setExpandedCategory(expandedCategory === c.category ? null : c.category);
                }}
                selectedUuid={selectedRecipeUuid}
                onSelect={(uuid) => { setSelectedRecipeUuid(uuid); setBatchCount(1); }}
                search=""
              />
            ))
          )}
        </div>

        {/* Counter */}
        <div className="px-3 py-2 border-t border-slate-800/40">
          <span className="text-[10px] font-mono-sc text-slate-700">{totalRecipes} blueprints</span>
        </div>
      </div>

      {/* ═══ MAIN DETAIL PANEL ═══ */}
      <div className="flex-1 overflow-y-auto">
        {selectedRecipe ? (
          <div className="max-w-4xl mx-auto px-6 py-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 flex-wrap text-xs mb-2">
              {selectedRecipe.category && (
                <GlowBadge color={CATEGORY_COLORS[selectedRecipe.category] ?? 'slate'}>
                  {selectedRecipe.category}
                </GlowBadge>
              )}
              {selectedRecipe.crafting_time_s != null && (
                <span className="flex items-center gap-1 text-slate-500 font-mono-sc">
                  <Clock size={10} />
                  {formatTime(selectedRecipe.crafting_time_s)}
                </span>
              )}
              {selectedRecipe.station_type && (
                <span className="flex items-center gap-1 text-slate-500 font-mono-sc">
                  <FlaskConical size={10} />
                  {selectedRecipe.station_type}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="font-orbitron text-2xl lg:text-3xl font-bold text-slate-100 tracking-wide">
              {formatName(selectedRecipe)}
            </h1>

            {/* ─── PARTS Section ─── */}
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 size={16} className="text-cyan-500" />
                <h2 className="font-orbitron text-sm font-bold text-cyan-400 tracking-widest uppercase">Parts</h2>
              </div>

              {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {selectedRecipe.ingredients.map((ing) => (
                    <IngredientCard
                      key={ing.id}
                      name={ing.item_name}
                      quantity={ing.quantity}
                      isOptional={ing.is_optional}
                      batchCount={batchCount}
                    />
                  ))}
                </div>
              ) : (
                <div className="sci-panel p-8 text-center">
                  <Package size={28} className="text-slate-800 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 font-mono-sc">No ingredient data available</p>
                  <p className="text-[10px] text-slate-700 mt-1">Ingredient extraction coming soon</p>
                </div>
              )}
            </div>

            {/* ─── Output & Crafting Info ─── */}
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <Package size={16} className="text-cyan-500" />
                <h2 className="font-orbitron text-sm font-bold text-cyan-400 tracking-widest uppercase">Output</h2>
              </div>

              <div className="sci-panel p-5">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-lg text-slate-200 font-medium">
                      {formatItemName(selectedRecipe.output_item_name ?? selectedRecipe.name ?? '—')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Batch count */}
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setBatchCount((v) => Math.max(1, v - 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors"><Minus size={12} /></button>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={batchCount}
                        onChange={(e) => setBatchCount(Math.max(1, Number(e.target.value) || 1))}
                        className="sci-input w-12 text-sm text-center font-mono-sc h-7"
                      />
                      <button type="button" onClick={() => setBatchCount((v) => Math.min(999, v + 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors"><Plus size={12} /></button>
                    </div>

                    <span className="font-mono-sc text-xl font-bold text-cyan-400">
                      ×{(selectedRecipe.output_quantity ?? 1) * batchCount}
                    </span>
                  </div>
                </div>

                {/* Quick batch presets */}
                <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-800/40">
                  {[1, 5, 10, 25, 50, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setBatchCount(n)}
                      className={`px-2.5 py-1 text-[10px] font-mono-sc rounded border transition-colors ${
                        batchCount === n
                          ? 'border-cyan-500 bg-cyan-950/50 text-cyan-400'
                          : 'border-slate-700/60 text-slate-600 hover:border-slate-500 hover:text-slate-400'
                      }`}
                    >
                      ×{n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ─── Crafting Details Grid ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
              <div className="sci-panel p-4">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1.5">Total Crafting Time</p>
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  <span className="text-lg font-mono-sc text-slate-200 font-medium">
                    {formatTime(selectedRecipe.crafting_time_s ? selectedRecipe.crafting_time_s * batchCount : null)}
                  </span>
                </div>
                {batchCount > 1 && selectedRecipe.crafting_time_s && (
                  <p className="text-[10px] text-slate-700 font-mono-sc mt-1">
                    {formatTime(selectedRecipe.crafting_time_s)} per unit
                  </p>
                )}
              </div>

              <div className="sci-panel p-4">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1.5">Station</p>
                <div className="flex items-center gap-2">
                  <FlaskConical size={16} className="text-purple-500" />
                  <span className="text-lg font-mono-sc text-slate-200 font-medium">{selectedRecipe.station_type ?? '—'}</span>
                </div>
              </div>

              {selectedRecipe.skill_level != null && (
                <div className="sci-panel p-4">
                  <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1.5">Skill Level</p>
                  <div className="flex items-center gap-2">
                    <Settings2 size={16} className="text-green-500" />
                    <span className="text-lg font-mono-sc text-slate-200 font-medium">{selectedRecipe.skill_level}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Class name reference */}
            <div className="mt-6 pt-4 border-t border-slate-800/30">
              <p className="text-[9px] font-mono-sc text-slate-800 break-all">{selectedRecipe.class_name}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FlaskConical size={40} className="text-slate-800 mx-auto mb-3" />
              <p className="text-sm text-slate-700 font-mono-sc">Select a blueprint</p>
              <p className="text-[10px] text-slate-800 mt-1">Choose a recipe from the sidebar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
