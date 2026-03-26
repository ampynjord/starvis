import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Clock, FlaskConical, Minus, Package, Plus, Search, Settings2, Swords, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useDebounce } from '@/hooks/useDebounce';
import type { CraftingRecipe } from '@/types/api';

/* --- Constants --- */
type Tab = 'blueprint' | 'mission' | 'resources';

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

/* --- Formatters --- */
function formatTime(secs: number | null): string {
  if (!secs) return '\u2014';
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

/* --- Sidebar accordion group --- */
function SidebarGroup({
  label,
  count,
  items,
  expanded,
  onToggle,
  selectedUuid,
  onSelect,
}: {
  label: string;
  count: number;
  items: { uuid: string; displayName: string }[];
  expanded: boolean;
  onToggle: () => void;
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
}) {
  const color = CATEGORY_COLORS[label] ?? 'slate';
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-3 py-2 text-left hover:bg-white/5 transition-colors group"
      >
        {expanded ? (
          <ChevronDown size={11} className="text-slate-600 flex-shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-slate-600 flex-shrink-0" />
        )}
        <span className={`text-[11px] font-mono-sc uppercase tracking-wider flex-1 truncate ${expanded ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
          {label}
        </span>
        <GlowBadge color={color} size="xs">{count}</GlowBadge>
      </button>
      {expanded && (
        <div className="pb-1 max-h-[50vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-6 py-2 text-[10px] font-mono-sc text-slate-700 animate-pulse">Loading\u2026</div>
          ) : (
            items.map((item) => (
              <button
                key={item.uuid}
                type="button"
                onClick={() => onSelect(item.uuid)}
                className={`w-full text-left pl-6 pr-3 py-1.5 text-xs transition-colors truncate ${
                  selectedUuid === item.uuid
                    ? 'text-cyan-400 bg-cyan-950/40'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                }`}
              >
                {item.displayName}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* --- Part card (sccrafter style) --- */
function PartCard({ name, quantity, isOptional, batchCount }: { name: string; quantity: number; isOptional: boolean; batchCount: number }) {
  return (
    <div className="sci-panel border-l-2 border-cyan-700 overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-200 truncate">{formatItemName(name)}</span>
        </div>
        <p className="text-[10px] font-mono-sc text-slate-600 pl-4">
          Required: <span className="text-slate-400">{quantity * batchCount}</span>
          {isOptional && <span className="ml-2 text-amber-500">(optional)</span>}
        </p>
      </div>
      <div className="px-4 py-2 bg-slate-900/50 border-t border-slate-800/40">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono-sc text-slate-600 uppercase">Resource</span>
          <span className="text-[10px] font-mono-sc text-slate-700">\u2014</span>
        </div>
      </div>
    </div>
  );
}

/* --- Main page --- */
export default function CraftingPage() {
  const searchParams = useSearchParams();
  const { env } = useEnv();

  const [tab, setTab] = useState<Tab>('blueprint');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [rewardsOnly, setRewardsOnly] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedRecipeUuid, setSelectedRecipeUuid] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(1);

  const debouncedSearch = useDebounce(search, 350);

  /* --- Data: categories --- */
  const { data: categories } = useQuery({
    queryKey: ['crafting.categories', env],
    queryFn: () => api.crafting.categories(env),
    staleTime: Infinity,
  });

  const totalRecipes = useMemo(() => (categories ?? []).reduce((s, c) => s + c.count, 0), [categories]);

  /* --- Data: recipes for expanded category (or search) --- */
  const { data: groupRecipes } = useQuery({
    queryKey: ['crafting.groupRecipes', env, expandedGroup, tab],
    queryFn: () => api.crafting.recipes({ env, category: expandedGroup!, limit: 1000 }),
    enabled: !!expandedGroup && tab === 'blueprint' && !debouncedSearch,
    staleTime: 60_000,
  });

  /* --- Data: search results --- */
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['crafting.search', env, debouncedSearch],
    queryFn: () => api.crafting.recipes({ env, search: debouncedSearch, limit: 500 }),
    enabled: !!debouncedSearch,
    staleTime: 30_000,
  });

  /* Group search results by category */
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

  /* --- Data: selected recipe detail --- */
  const { data: selectedRecipe } = useQuery({
    queryKey: ['crafting.recipe', selectedRecipeUuid, env],
    queryFn: () => api.crafting.recipe(selectedRecipeUuid!, env),
    enabled: !!selectedRecipeUuid,
  });

  /* Auto-expand first category on load */
  useEffect(() => {
    if (categories?.length && !expandedGroup && !debouncedSearch && tab === 'blueprint') {
      setExpandedGroup(categories[0].category);
    }
  }, [categories, expandedGroup, debouncedSearch, tab]);

  /* Auto-select first recipe when group recipes load */
  useEffect(() => {
    if (groupRecipes?.data?.length && !debouncedSearch) {
      if (!selectedRecipeUuid || !groupRecipes.data.some((r) => r.uuid === selectedRecipeUuid)) {
        setSelectedRecipeUuid(groupRecipes.data[0].uuid);
      }
    }
  }, [groupRecipes?.data, selectedRecipeUuid, debouncedSearch]);

  /* Auto-select first search result */
  useEffect(() => {
    if (searchGrouped && searchGrouped.size > 0) {
      const firstCat = searchGrouped.keys().next().value!;
      setExpandedGroup(firstCat);
      const firstRecipe = searchGrouped.get(firstCat)?.[0];
      if (firstRecipe) setSelectedRecipeUuid(firstRecipe.uuid);
    }
  }, [searchGrouped]);

  /* Build sidebar items */
  const sidebarGroups = useMemo(() => {
    if (debouncedSearch && searchGrouped) {
      return Array.from(searchGrouped.entries()).map(([cat, recipes]) => ({
        key: cat,
        label: cat,
        count: recipes.length,
        items: recipes.map((r) => ({ uuid: r.uuid, displayName: formatName(r) })),
      }));
    }
    if (tab === 'blueprint' && categories) {
      return categories.map((c) => ({
        key: c.category,
        label: c.category,
        count: c.count,
        items: expandedGroup === c.category ? (groupRecipes?.data ?? []).map((r) => ({ uuid: r.uuid, displayName: formatName(r) })) : [],
      }));
    }
    return [];
  }, [tab, categories, expandedGroup, groupRecipes, debouncedSearch, searchGrouped]);

  const hasIngredients = selectedRecipe?.ingredients && selectedRecipe.ingredients.length > 0;

  return (
    <div className="flex h-[calc(100vh-64px)]">

      {/* LEFT SIDEBAR */}
      <div className="w-52 xl:w-60 flex-shrink-0 border-r border-slate-800/60 flex flex-col bg-slate-950/50">

        {/* Tabs: BLUEPRINT / MISSION / RESOURCES */}
        <div className="flex border-b border-slate-800/60">
          {([
            { id: 'blueprint' as Tab, label: 'Blueprint' },
            { id: 'mission' as Tab, label: 'Mission' },
            { id: 'resources' as Tab, label: 'Resources' },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setExpandedGroup(null); setSearch(''); }}
              className={`flex-1 py-2 text-[10px] font-mono-sc uppercase tracking-wider text-center transition-colors ${
                tab === t.id
                  ? 'text-cyan-400 bg-cyan-950/30 border-b-2 border-cyan-500'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-2 border-b border-slate-800/40">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" size={11} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab === 'blueprint' ? 'blueprints' : tab === 'mission' ? 'missions' : 'resources'}\u2026`}
              className="sci-input w-full pl-6 text-[11px] h-7"
            />
          </div>
        </div>

        {/* Rewards Only toggle */}
        <div className="px-2 py-1.5 border-b border-slate-800/40">
          <button
            type="button"
            onClick={() => setRewardsOnly(!rewardsOnly)}
            className={`w-full py-1.5 text-[10px] font-mono-sc uppercase tracking-wider rounded border transition-colors text-center ${
              rewardsOnly
                ? 'border-amber-600 bg-amber-950/40 text-amber-400'
                : 'border-slate-800 text-slate-600 hover:border-slate-700 hover:text-slate-500'
            }`}
          >
            Rewards Only
          </button>
        </div>

        {/* Category/Group tree */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'blueprint' ? (
            searchLoading && debouncedSearch ? (
              <div className="p-4 text-xs font-mono-sc text-slate-600 animate-pulse">Searching\u2026</div>
            ) : sidebarGroups.length > 0 ? (
              sidebarGroups.map((g) => (
                <SidebarGroup
                  key={g.key}
                  label={g.label}
                  count={g.count}
                  items={g.items}
                  expanded={expandedGroup === g.key}
                  onToggle={() => setExpandedGroup(expandedGroup === g.key ? null : g.key)}
                  selectedUuid={selectedRecipeUuid}
                  onSelect={(uuid) => { setSelectedRecipeUuid(uuid); setBatchCount(1); }}
                />
              ))
            ) : debouncedSearch ? (
              <div className="p-4 text-xs font-mono-sc text-slate-600">No results</div>
            ) : null
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
              {tab === 'mission' ? (
                <Swords size={24} className="text-slate-800" />
              ) : (
                <Package size={24} className="text-slate-800" />
              )}
              <p className="text-xs font-mono-sc text-slate-700 text-center">
                {tab === 'mission' ? 'Mission rewards' : 'Resource grouping'} coming soon
              </p>
              <p className="text-[9px] font-mono-sc text-slate-800 text-center">
                Data extraction in progress
              </p>
            </div>
          )}
        </div>

        {/* Blueprint count */}
        <div className="px-3 py-2 border-t border-slate-800/40 flex items-center justify-between">
          <span className="text-[9px] font-mono-sc text-slate-700">{totalRecipes} blueprints</span>
        </div>
      </div>

      {/* MAIN DETAIL PANEL */}
      <div className="flex-1 overflow-y-auto">
        {selectedRecipe ? (
          <div className="max-w-5xl mx-auto px-6 py-5">

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 flex-wrap text-xs mb-1">
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
            </div>

            {/* Recipe Title */}
            <h1 className="font-orbitron text-2xl lg:text-3xl font-bold text-slate-100 tracking-wide mt-1">
              {formatName(selectedRecipe)}
            </h1>

            {/* PARTS */}
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-5 justify-center">
                <Settings2 size={16} className="text-slate-500" />
                <h2 className="font-orbitron text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">Parts</h2>
              </div>

              {hasIngredients ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {selectedRecipe.ingredients!.map((ing) => (
                    <PartCard
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
                  <Package size={24} className="text-slate-800 mx-auto mb-2" />
                  <p className="text-xs text-slate-600 font-mono-sc">No ingredient data available yet</p>
                </div>
              )}
            </div>

            {/* OUTPUT + BATCH */}
            <div className="mt-8 sci-panel p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-wider mb-1">Output</p>
                  <p className="text-lg text-slate-200 font-medium">
                    {formatItemName(selectedRecipe.output_item_name ?? selectedRecipe.name ?? '\u2014')}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => setBatchCount((v) => Math.max(1, v - 1))} className="w-7 h-7 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors"><Minus size={12} /></button>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={batchCount}
                    onChange={(e) => setBatchCount(Math.max(1, Number(e.target.value) || 1))}
                    className="sci-input w-14 text-sm text-center font-mono-sc h-7"
                  />
                  <button type="button" onClick={() => setBatchCount((v) => Math.min(999, v + 1))} className="w-7 h-7 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors"><Plus size={12} /></button>
                  <span className="font-mono-sc text-xl font-bold text-cyan-400 ml-1">
                    {'\u00d7'}{(selectedRecipe.output_quantity ?? 1) * batchCount}
                  </span>
                </div>
              </div>

              <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-800/30">
                {[1, 5, 10, 25, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBatchCount(n)}
                    className={`px-2.5 py-1 text-[10px] font-mono-sc rounded border transition-colors ${
                      batchCount === n
                        ? 'border-cyan-500 bg-cyan-950/50 text-cyan-400'
                        : 'border-slate-800 text-slate-600 hover:border-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {'\u00d7'}{n}
                  </button>
                ))}
              </div>
            </div>

            {/* CRAFTING DETAILS */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
              <div className="sci-panel p-4">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Total Crafting Time</p>
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  <span className="text-lg font-mono-sc text-slate-200 font-medium">
                    {formatTime(selectedRecipe.crafting_time_s ? selectedRecipe.crafting_time_s * batchCount : null)}
                  </span>
                </div>
                {batchCount > 1 && selectedRecipe.crafting_time_s && (
                  <p className="text-[10px] text-slate-700 font-mono-sc mt-1">{formatTime(selectedRecipe.crafting_time_s)} per unit</p>
                )}
              </div>

              <div className="sci-panel p-4">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Station</p>
                <div className="flex items-center gap-2">
                  <FlaskConical size={16} className="text-purple-500" />
                  <span className="text-lg font-mono-sc text-slate-200 font-medium">{selectedRecipe.station_type ?? '\u2014'}</span>
                </div>
              </div>

              {selectedRecipe.skill_level != null && (
                <div className="sci-panel p-4">
                  <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Skill Level</p>
                  <div className="flex items-center gap-2">
                    <Settings2 size={16} className="text-green-500" />
                    <span className="text-lg font-mono-sc text-slate-200 font-medium">{selectedRecipe.skill_level}</span>
                  </div>
                </div>
              )}
            </div>

            {/* REWARD MISSIONS */}
            <div className="mt-8 sci-panel p-5">
              <div className="flex items-center gap-2 mb-3 justify-center">
                <Trophy size={16} className="text-amber-500" />
                <h2 className="font-orbitron text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">Reward Missions</h2>
              </div>
              <p className="text-xs text-slate-700 font-mono-sc text-center py-4">
                Mission reward data coming soon
              </p>
            </div>

            {/* Class name */}
            <div className="mt-6 pt-4 border-t border-slate-800/20">
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
