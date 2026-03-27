import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown, ChevronRight, Clock, FlaskConical,
  Minus, Package, Plus, Search, Settings2, Swords, Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useDebounce } from '@/hooks/useDebounce';
import type { CraftingIngredient, CraftingRecipe, CraftingSlotModifier, Mission } from '@/types/api';

/* ---------- constants ---------- */
type Tab = 'blueprint' | 'mission' | 'resources';

const CAT_COLORS: Record<string, 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate'> = {
  FPSArmours: 'amber', FPSWeapons: 'red', Misc: 'slate', Tool: 'cyan',
  Food: 'green', Drink: 'cyan', Medicine: 'purple', Ammunition: 'red',
  Component: 'slate', Refining: 'amber', Explosive: 'red',
};
const Q_MAX = 1000;

/** Linear interpolation of modifier value based on quality (0-1000) */
function computeModifier(mod: CraftingSlotModifier, quality: number): number {
  const t = Math.max(0, Math.min(1, (quality - mod.start_quality) / (mod.end_quality - mod.start_quality)));
  return mod.modifier_at_start + t * (mod.modifier_at_end - mod.modifier_at_start);
}

/** Format modifier as percentage string like "+20.00%" or "-5.00%" */
function fmtModPct(multiplier: number): string {
  const pct = (multiplier - 1) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/** Color class for a modifier multiplier */
function modColor(multiplier: number): string {
  const pct = (multiplier - 1) * 100;
  if (pct > 0.5) return 'text-green-400';
  if (pct < -0.5) return 'text-red-400';
  return 'text-slate-400';
}

/* ---------- formatters ---------- */
function fmtTime(s: number | null): string {
  if (!s) return '\u2014';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function fmtName(r: CraftingRecipe): string {
  return r.display_name ?? r.name ?? r.class_name;
}

function fmtItem(raw: string): string {
  return raw;
}

function fmtScu(scu: number | null): string {
  if (!scu) return '\u2014';
  if (scu >= 1) return `${scu.toFixed(1)} SCU`;
  if (scu >= 0.01) return `${(scu * 100).toFixed(0)} cSCU`;
  return `${(scu * 10000).toFixed(0)} \u00b5SCU`;
}

function fmtReward(min: number | null, max: number | null): string {
  if (min == null && max == null) return '\u2014';
  if (min != null && max != null && min !== max) return `${min.toLocaleString()}\u2013${max.toLocaleString()} aUEC`;
  return `${(max ?? min ?? 0).toLocaleString()} aUEC`;
}

/* ---------- sidebar group ---------- */
function SidebarGroup({
  label, count, items, expanded, onToggle, selectedId, onSelect,
}: {
  label: string;
  count: number;
  items: { id: string; displayName: string }[];
  expanded: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const color = CAT_COLORS[label] ?? 'slate';
  return (
    <div>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-1 px-3 py-2 text-left hover:bg-white/5 transition-colors group">
        {expanded
          ? <ChevronDown size={11} className="text-slate-600 flex-shrink-0" />
          : <ChevronRight size={11} className="text-slate-600 flex-shrink-0" />}
        <span className={`text-[11px] font-mono-sc uppercase tracking-wider flex-1 truncate ${expanded ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{label}</span>
        <GlowBadge color={color} size="xs">{count}</GlowBadge>
      </button>
      {expanded && (
        <div className="pb-1 max-h-[50vh] overflow-y-auto">
          {items.length === 0
            ? <div className="px-6 py-2 text-[10px] font-mono-sc text-slate-700 animate-pulse">Loading\u2026</div>
            : items.map((it) => (
              <button key={it.id} type="button" onClick={() => onSelect(it.id)}
                className={`w-full text-left pl-6 pr-3 py-1.5 text-xs transition-colors truncate ${
                  selectedId === it.id ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                }`}>{it.displayName}</button>
            ))}
        </div>
      )}
    </div>
  );
}

/* ---------- flat sidebar item (no group) ---------- */
function SidebarItem({ label, selected, onClick, badge }: { label: string; selected: boolean; onClick: () => void; badge?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-4 py-2 text-xs transition-colors flex items-center gap-2 ${
        selected ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
      }`}>
      <span className="flex-1 truncate">{label}</span>
      {badge && <span className="text-[9px] font-mono-sc text-slate-600">{badge}</span>}
    </button>
  );
}

/* ---------- part card ---------- */
function PartCard({ ingredient, batch, quality, onQuality, modifiers }: {
  ingredient: CraftingIngredient; batch: number; quality: number; onQuality: (v: number) => void; modifiers: CraftingSlotModifier[];
}) {
  const scu = ingredient.scu ? Number(ingredient.scu) : 0;
  const totalScu = scu * batch;
  const slot = ingredient.display_slot_name ?? (ingredient.slot_name ? fmtItem(ingredient.slot_name) : null);
  const clampQ = useCallback((v: number) => Math.max(0, Math.min(Q_MAX, Math.round(v))), []);

  return (
    <div className="sci-panel border-l-2 border-cyan-700 overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        {slot && <p className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-wider mb-1">{slot}</p>}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-200 truncate">{ingredient.display_item_name ?? fmtItem(ingredient.item_name)}</span>
        </div>
        <p className="text-[10px] font-mono-sc text-slate-600 pl-4">
          Required: <span className="text-slate-400">{ingredient.quantity * batch}</span>
          {ingredient.is_optional && <span className="ml-2 text-amber-500">(optional)</span>}
        </p>
      </div>
      <div className="px-4 py-2 bg-slate-900/50 border-t border-slate-800/40">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono-sc text-slate-500">{ingredient.display_item_name ?? fmtItem(ingredient.item_name)}</span>
          <span className="text-[10px] font-mono-sc text-cyan-400 font-medium">{scu > 0 ? fmtScu(totalScu) : '\u2014'}</span>
        </div>
      </div>
      {modifiers.length > 0 ? (
        <div className="px-4 py-2 bg-slate-950/50 border-t border-slate-800/30 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-wider">Quality Adjustment</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => onQuality(clampQ(quality - 10))}
              className="w-5 h-5 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"><Minus size={9} /></button>
            <input type="range" min={0} max={Q_MAX} value={quality} onChange={(e) => onQuality(clampQ(Number(e.target.value)))}
              className="flex-1 h-1 accent-cyan-500 bg-slate-800 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
                [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-900" />
            <button type="button" onClick={() => onQuality(clampQ(quality + 10))}
              className="w-5 h-5 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"><Plus size={9} /></button>
            <input type="number" min={0} max={Q_MAX} value={quality}
              onChange={(e) => onQuality(clampQ(Number(e.target.value) || 0))}
              className="sci-input w-14 text-[11px] text-center py-0.5 font-mono-sc" />
          </div>
          <div className="flex flex-wrap gap-1">
            {modifiers.map((m) => {
              const val = computeModifier(m, quality);
              return (
                <span key={m.id}
                  className={`inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900/50 px-1.5 py-0.5 text-[10px] font-mono-sc ${modColor(val)}`}
                  title={`${m.property_name} \u2014 ${m.unit_format}`}
                >{m.display_property_name ?? m.property_name} {fmtModPct(val)}</span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-4 py-2 bg-slate-950/50 border-t border-slate-800/30">
          <span className="text-[9px] font-mono-sc text-slate-700">No quality modifiers</span>
        </div>
      )}
    </div>
  );
}

/* ---------- mission card (inline) ---------- */
function MissionRow({ m }: { m: Mission }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/40 rounded border border-slate-800/30 hover:bg-slate-900/60 transition-colors">
      <Swords size={14} className={m.is_legal ? 'text-green-500' : 'text-red-500'} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-200 truncate">{m.title ?? m.class_name}</p>
        <div className="flex items-center gap-3 mt-0.5">
          {m.mission_type && <span className="text-[9px] font-mono-sc text-slate-600">{m.mission_type}</span>}
          {m.faction && <span className="text-[9px] font-mono-sc text-slate-600">{m.faction}</span>}
          {m.location_system && <span className="text-[9px] font-mono-sc text-slate-700">{m.location_system}</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-mono-sc text-amber-400">{fmtReward(m.reward_min, m.reward_max)}</p>
        {m.danger_level != null && <p className="text-[9px] font-mono-sc text-red-900">Danger {m.danger_level}</p>}
      </div>
    </div>
  );
}

/* ========== MAIN PAGE ========== */
export default function CraftingPage() {
  const searchParams = useSearchParams();
  const { env } = useEnv();

  const [tab, setTab] = useState<Tab>('blueprint');
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedRecipeUuid, setSelectedRecipeUuid] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(1);
  const [qualityMap, setQualityMap] = useState<Record<number, number>>({});
  const [missionPage, setMissionPage] = useState(1);

  const debouncedSearch = useDebounce(search, 350);
  const setIngredientQuality = useCallback((id: number, v: number) => setQualityMap((p) => ({ ...p, [id]: v })), []);

  /* ---- data: categories ---- */
  const { data: categories } = useQuery({
    queryKey: ['crafting.categories', env],
    queryFn: () => api.crafting.categories(env),
    staleTime: Infinity,
  });
  const totalRecipes = useMemo(() => (categories ?? []).reduce((s, c) => s + c.count, 0), [categories]);

  /* ---- data: group recipes ---- */
  const { data: groupRecipes } = useQuery({
    queryKey: ['crafting.groupRecipes', env, expandedGroup, tab],
    queryFn: () => api.crafting.recipes({ env, category: expandedGroup!, limit: 1000 }),
    enabled: !!expandedGroup && tab === 'blueprint' && !debouncedSearch,
    staleTime: 60_000,
  });

  /* ---- data: search results ---- */
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['crafting.search', env, debouncedSearch],
    queryFn: () => api.crafting.recipes({ env, search: debouncedSearch, limit: 500 }),
    enabled: !!debouncedSearch && tab === 'blueprint',
    staleTime: 30_000,
  });

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

  /* ---- data: selected recipe detail ---- */
  const { data: selectedRecipe } = useQuery({
    queryKey: ['crafting.recipe', selectedRecipeUuid, env],
    queryFn: () => api.crafting.recipe(selectedRecipeUuid!, env),
    enabled: !!selectedRecipeUuid,
  });

  /* ---- data: resources ---- */
  const { data: resources } = useQuery({
    queryKey: ['crafting.resources', env],
    queryFn: () => api.crafting.resources(env),
    enabled: tab === 'resources',
    staleTime: Infinity,
  });

  /* ---- data: recipes for selected resource ---- */
  const { data: resourceRecipes } = useQuery({
    queryKey: ['crafting.resourceRecipes', env, selectedResource],
    queryFn: () => api.crafting.recipesByResource(selectedResource!, env),
    enabled: !!selectedResource && tab === 'resources',
    staleTime: 60_000,
  });

  /* ---- data: missions ---- */
  const { data: missionTypes } = useQuery({
    queryKey: ['missions.types', env],
    queryFn: () => api.missions.types(env),
    enabled: tab === 'mission',
    staleTime: Infinity,
  });

  const { data: missionResults } = useQuery({
    queryKey: ['crafting.missions', env, debouncedSearch, missionPage],
    queryFn: () => api.missions.list({
      env,
      search: debouncedSearch || undefined,
      page: missionPage,
      limit: 50,
    }),
    enabled: tab === 'mission',
    staleTime: 30_000,
  });

  /* ---- auto-expand first category ---- */
  useEffect(() => {
    if (categories?.length && !expandedGroup && !debouncedSearch && tab === 'blueprint') {
      setExpandedGroup(categories[0].category);
    }
  }, [categories, expandedGroup, debouncedSearch, tab]);

  /* ---- auto-select first recipe in group ---- */
  useEffect(() => {
    if (groupRecipes?.data?.length && !debouncedSearch && tab === 'blueprint') {
      if (!selectedRecipeUuid || !groupRecipes.data.some((r) => r.uuid === selectedRecipeUuid)) {
        setSelectedRecipeUuid(groupRecipes.data[0].uuid);
      }
    }
  }, [groupRecipes?.data, selectedRecipeUuid, debouncedSearch, tab]);

  /* ---- auto-select first search result ---- */
  useEffect(() => {
    if (searchGrouped && searchGrouped.size > 0) {
      const firstCat = searchGrouped.keys().next().value!;
      setExpandedGroup(firstCat);
      const first = searchGrouped.get(firstCat)?.[0];
      if (first) setSelectedRecipeUuid(first.uuid);
    }
  }, [searchGrouped]);

  /* ---- auto-select first resource ---- */
  useEffect(() => {
    if (resources?.length && !selectedResource && tab === 'resources') {
      setSelectedResource(resources[0].item_name);
    }
  }, [resources, selectedResource, tab]);

  /* ---- reset quality on recipe change ---- */
  useEffect(() => { setQualityMap({}); }, [selectedRecipeUuid]);

  /* ---- group modifiers by slot ---- */
  const modifiersBySlot = useMemo(() => {
    const map: Record<string, CraftingSlotModifier[]> = {};
    if (selectedRecipe?.modifiers) {
      for (const m of selectedRecipe.modifiers) {
        (map[m.slot_name] ??= []).push(m);
      }
    }
    return map;
  }, [selectedRecipe?.modifiers]);

  /* ---- combined modifiers across all slots ---- */
  const combinedModifiers = useMemo(() => {
    if (!selectedRecipe?.modifiers?.length) return [];
    const map = new Map<string, { propertyName: string; unitFormat: string; totalMultiplier: number }>();
    for (const ing of selectedRecipe.ingredients ?? []) {
      const slotMods = modifiersBySlot[ing.slot_name ?? ''] ?? [];
      const q = qualityMap[ing.id] ?? 500;
      for (const m of slotMods) {
        const val = computeModifier(m, q);
        const existing = map.get(m.property_name);
        if (existing) {
          existing.totalMultiplier *= val;
        } else {
          map.set(m.property_name, {
            propertyName: m.display_property_name ?? m.property_name,
            unitFormat: m.unit_format,
            totalMultiplier: val,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [selectedRecipe?.modifiers, selectedRecipe?.ingredients, modifiersBySlot, qualityMap]);

  /* ---- sidebar groups ---- */
  const sidebarGroups = useMemo(() => {
    if (debouncedSearch && searchGrouped) {
      return Array.from(searchGrouped.entries()).map(([cat, recs]) => ({
        key: cat, label: cat, count: recs.length,
        items: recs.map((r) => ({ id: r.uuid, displayName: fmtName(r) })),
      }));
    }
    if (tab === 'blueprint' && categories) {
      return categories.map((c) => ({
        key: c.category, label: c.category, count: c.count,
        items: expandedGroup === c.category ? (groupRecipes?.data ?? []).map((r) => ({ id: r.uuid, displayName: fmtName(r) })) : [],
      }));
    }
    return [];
  }, [tab, categories, expandedGroup, groupRecipes, debouncedSearch, searchGrouped]);

  /* ---- filtered resources sidebar ---- */
  const filteredResources = useMemo(() => {
    if (!resources) return [];
    if (!debouncedSearch) return resources;
    const q = debouncedSearch.toLowerCase();
    return resources.filter((r) => r.item_name.toLowerCase().includes(q));
  }, [resources, debouncedSearch]);

  /* ---- computed ---- */
  const hasIngredients = selectedRecipe?.ingredients && selectedRecipe.ingredients.length > 0;
  const totalScu = useMemo(() => {
    if (!hasIngredients) return 0;
    return selectedRecipe!.ingredients!.reduce((a, i) => a + (i.scu ? Number(i.scu) : 0) * batchCount, 0);
  }, [selectedRecipe, batchCount, hasIngredients]);

  return (
    <div className="flex h-[calc(100vh-64px)]">

      {/* === LEFT SIDEBAR === */}
      <div className="w-52 xl:w-60 flex-shrink-0 border-r border-slate-800/60 flex flex-col bg-slate-950/50">

        {/* tabs */}
        <div className="flex border-b border-slate-800/60">
          {([
            { id: 'blueprint' as Tab, label: 'Blueprint' },
            { id: 'mission' as Tab, label: 'Mission' },
            { id: 'resources' as Tab, label: 'Resources' },
          ]).map((t) => (
            <button key={t.id} type="button"
              onClick={() => { setTab(t.id); setExpandedGroup(null); setSearch(''); setMissionPage(1); }}
              className={`flex-1 py-2 text-[10px] font-mono-sc uppercase tracking-wider text-center transition-colors ${
                tab === t.id ? 'text-cyan-400 bg-cyan-950/30 border-b-2 border-cyan-500' : 'text-slate-600 hover:text-slate-400'
              }`}>{t.label}</button>
          ))}
        </div>

        {/* search */}
        <div className="p-2 border-b border-slate-800/40">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" size={11} />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setMissionPage(1); }}
              placeholder={`Search ${tab === 'blueprint' ? 'blueprints' : tab === 'mission' ? 'missions' : 'resources'}\u2026`}
              className="sci-input w-full pl-6 text-[11px] h-7" />
          </div>
        </div>

        {/* tree / list */}
        <div className="flex-1 overflow-y-auto">

          {/* BLUEPRINT TAB */}
          {tab === 'blueprint' && (
            searchLoading && debouncedSearch
              ? <div className="p-4 text-xs font-mono-sc text-slate-600 animate-pulse">Searching\u2026</div>
              : sidebarGroups.length > 0
                ? sidebarGroups.map((g) => (
                    <SidebarGroup key={g.key} label={g.label} count={g.count} items={g.items}
                      expanded={expandedGroup === g.key}
                      onToggle={() => setExpandedGroup(expandedGroup === g.key ? null : g.key)}
                      selectedId={selectedRecipeUuid}
                      onSelect={(id) => { setSelectedRecipeUuid(id); setBatchCount(1); }} />
                  ))
                : debouncedSearch ? <div className="p-4 text-xs font-mono-sc text-slate-600">No results</div> : null
          )}

          {/* MISSION TAB */}
          {tab === 'mission' && (
            missionResults?.data?.length
              ? <>
                  {missionResults.data.map((m) => (
                    <SidebarItem key={m.uuid} label={m.title ?? m.class_name}
                      selected={false} onClick={() => {}} badge={m.mission_type ?? undefined} />
                  ))}
                  {(missionResults as any).pages > 1 && (
                    <div className="flex items-center justify-center gap-2 py-2 border-t border-slate-800/40">
                      <button type="button" disabled={missionPage <= 1} onClick={() => setMissionPage((p) => p - 1)}
                        className="text-[10px] font-mono-sc text-slate-600 hover:text-slate-400 disabled:opacity-30">\u25c0</button>
                      <span className="text-[9px] font-mono-sc text-slate-700">{missionPage}/{(missionResults as any).pages}</span>
                      <button type="button" disabled={missionPage >= (missionResults as any).pages} onClick={() => setMissionPage((p) => p + 1)}
                        className="text-[10px] font-mono-sc text-slate-600 hover:text-slate-400 disabled:opacity-30">\u25b6</button>
                    </div>
                  )}
                </>
              : <div className="p-4 text-xs font-mono-sc text-slate-600">{debouncedSearch ? 'No results' : 'Loading\u2026'}</div>
          )}

          {/* RESOURCES TAB */}
          {tab === 'resources' && (
            filteredResources.length > 0
              ? filteredResources.map((r) => (
                  <SidebarItem key={r.item_name} label={r.display_item_name ?? fmtItem(r.item_name)}
                    selected={selectedResource === r.item_name}
                    onClick={() => setSelectedResource(r.item_name)}
                    badge={String(r.recipe_count)} />
                ))
              : <div className="p-4 text-xs font-mono-sc text-slate-600">{resources ? 'No results' : 'Loading\u2026'}</div>
          )}
        </div>

        <div className="px-3 py-2 border-t border-slate-800/40 flex items-center justify-between">
          <span className="text-[9px] font-mono-sc text-slate-700">
            {tab === 'blueprint' ? `${totalRecipes} blueprints`
              : tab === 'mission' ? `${(missionResults as any)?.total ?? 0} missions`
              : `${resources?.length ?? 0} resources`}
          </span>
        </div>
      </div>

      {/* === MAIN PANEL === */}
      <div className="flex-1 overflow-y-auto">

        {/* --- BLUEPRINT detail --- */}
        {tab === 'blueprint' && selectedRecipe && (
          <div className="max-w-5xl mx-auto px-6 py-5">
            <div className="flex items-center gap-2 flex-wrap text-xs mb-1">
                {selectedRecipe.category && (
                  <GlowBadge color={CAT_COLORS[selectedRecipe.category] ?? 'slate'}>
                    {selectedRecipe.display_category ?? selectedRecipe.category}
                  </GlowBadge>
                )}
              {selectedRecipe.crafting_time_s != null && (
                <span className="flex items-center gap-1 text-slate-500 font-mono-sc"><Clock size={10} />{fmtTime(selectedRecipe.crafting_time_s)}</span>
              )}
            </div>
            <h1 className="font-orbitron text-2xl lg:text-3xl font-bold text-slate-100 tracking-wide mt-1">{fmtName(selectedRecipe)}</h1>

            {/* Parts */}
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-5 justify-center">
                <Settings2 size={16} className="text-slate-500" />
                <h2 className="font-orbitron text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">Parts</h2>
              </div>
              {hasIngredients ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {selectedRecipe.ingredients!.map((ing) => (
                    <PartCard key={ing.id} ingredient={ing} batch={batchCount}
                      quality={qualityMap[ing.id] ?? 500} onQuality={(v) => setIngredientQuality(ing.id, v)}
                      modifiers={modifiersBySlot[ing.slot_name ?? ''] ?? []} />
                  ))}
                </div>
              ) : (
                <div className="sci-panel p-8 text-center">
                  <Package size={24} className="text-slate-800 mx-auto mb-2" />
                  <p className="text-xs text-slate-600 font-mono-sc">No ingredient data available yet</p>
                </div>
              )}
            </div>

            {/* Combined modifiers */}
            {combinedModifiers.length > 0 && (
              <div className="mt-6 sci-panel p-5">
                <h3 className="font-orbitron text-xs font-bold text-slate-400 tracking-[0.2em] uppercase text-center mb-4">Final Combined Modifiers</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {combinedModifiers.map((cm) => {
                    const pct = (cm.totalMultiplier - 1) * 100;
                    const sign = pct >= 0 ? '+' : '';
                    return (
                      <div key={cm.propertyName} className="bg-slate-900/60 rounded p-3 border border-slate-800/30">
                        <p className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-wider truncate mb-1">
                          {cm.propertyName}
                        </p>
                        <p className={`text-sm font-mono-sc font-bold ${pct > 0.5 ? 'text-green-400' : pct < -0.5 ? 'text-red-400' : 'text-slate-400'}`}>
                          {sign}{pct.toFixed(2)}%
                        </p>
                        {cm.unitFormat && cm.unitFormat !== 'LOC_EMPTY' && (
                          <p className="text-[9px] font-mono-sc text-slate-700">{cm.unitFormat}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Output + Batch */}
            <div className="mt-6 sci-panel p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-wider mb-1">Output</p>
                  <p className="text-lg text-slate-200 font-medium">
                    {selectedRecipe.display_output_item_name ?? fmtItem(selectedRecipe.output_item_name ?? selectedRecipe.name ?? '\u2014')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => setBatchCount((v) => Math.max(1, v - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors"><Minus size={12} /></button>
                  <input type="number" min={1} max={999} value={batchCount}
                    onChange={(e) => setBatchCount(Math.max(1, Number(e.target.value) || 1))}
                    className="sci-input w-14 text-sm text-center font-mono-sc h-7" />
                  <button type="button" onClick={() => setBatchCount((v) => Math.min(999, v + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors"><Plus size={12} /></button>
                  <span className="font-mono-sc text-xl font-bold text-cyan-400 ml-1">{'\u00d7'}{(selectedRecipe.output_quantity ?? 1) * batchCount}</span>
                </div>
              </div>
              <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-800/30">
                {[1, 5, 10, 25, 50, 100].map((n) => (
                  <button key={n} type="button" onClick={() => setBatchCount(n)}
                    className={`px-2.5 py-1 text-[10px] font-mono-sc rounded border transition-colors ${
                      batchCount === n ? 'border-cyan-500 bg-cyan-950/50 text-cyan-400' : 'border-slate-800 text-slate-600 hover:border-slate-600 hover:text-slate-400'
                    }`}>{'\u00d7'}{n}</button>
                ))}
              </div>
            </div>

            {/* Crafting details */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              <div className="sci-panel p-4">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Total Crafting Time</p>
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  <span className="text-lg font-mono-sc text-slate-200 font-medium">{fmtTime(selectedRecipe.crafting_time_s ? selectedRecipe.crafting_time_s * batchCount : null)}</span>
                </div>
                {batchCount > 1 && selectedRecipe.crafting_time_s && <p className="text-[10px] text-slate-700 font-mono-sc mt-1">{fmtTime(selectedRecipe.crafting_time_s)} per unit</p>}
              </div>
              <div className="sci-panel p-4">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Station</p>
                <div className="flex items-center gap-2">
                  <FlaskConical size={16} className="text-purple-500" />
                  <span className="text-lg font-mono-sc text-slate-200 font-medium">
                    {selectedRecipe.display_station_type ?? selectedRecipe.station_type ?? '\u2014'}
                  </span>
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
              <div className="sci-panel p-4">
                <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Total Resources</p>
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-cyan-500" />
                  <span className="text-lg font-mono-sc text-slate-200 font-medium">{totalScu > 0 ? fmtScu(totalScu) : '\u2014'}</span>
                </div>
              </div>
            </div>

            {/* Reward Missions */}
            <div className="mt-8 sci-panel p-5">
              <div className="flex items-center gap-2 mb-4 justify-center">
                <Trophy size={16} className="text-amber-500" />
                <h2 className="font-orbitron text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">Reward Missions</h2>
              </div>
              <p className="text-xs text-slate-600 font-mono-sc text-center py-3">
                Blueprint mission rewards are not yet available in Star Citizen 4.0 game data.
                <br />
                <span className="text-slate-700 text-[10px]">This section will populate automatically when CIG adds blueprint rewards to mission data.</span>
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/20">
              <p className="text-[9px] font-mono-sc text-slate-800 break-all">{selectedRecipe.class_name}</p>
            </div>
          </div>
        )}

        {/* --- MISSION detail --- */}
        {tab === 'mission' && (
          <div className="max-w-5xl mx-auto px-6 py-5">
            <div className="flex items-center gap-2 mb-6 justify-center">
              <Swords size={20} className="text-slate-500" />
              <h1 className="font-orbitron text-lg font-bold text-slate-300 tracking-[0.15em] uppercase">Missions</h1>
              <GlowBadge color="amber">{(missionResults as any)?.total ?? 0}</GlowBadge>
            </div>

            {/* Mission type pills */}
            {missionTypes?.length && (
              <div className="flex flex-wrap gap-1.5 mb-5 justify-center">
                {missionTypes.map((t) => (
                  <button key={t} type="button"
                    onClick={() => setSearch(search === t ? '' : t)}
                    className={`px-3 py-1 text-[10px] font-mono-sc rounded-full border transition-colors ${
                      search === t ? 'border-cyan-500 bg-cyan-950/50 text-cyan-400' : 'border-slate-800 text-slate-600 hover:border-slate-600'
                    }`}>{t}</button>
                ))}
              </div>
            )}

            {missionResults?.data?.length ? (
              <div className="space-y-2">
                {missionResults.data.map((m) => <MissionRow key={m.uuid} m={m} />)}
              </div>
            ) : (
              <div className="sci-panel p-8 text-center">
                <Swords size={28} className="text-slate-800 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-mono-sc">No missions found</p>
              </div>
            )}

            {(missionResults as any)?.pages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <button type="button" disabled={missionPage <= 1} onClick={() => setMissionPage((p) => p - 1)}
                  className="sci-btn text-xs disabled:opacity-30">\u25c0 Previous</button>
                <span className="text-xs font-mono-sc text-slate-600">Page {missionPage} / {(missionResults as any).pages}</span>
                <button type="button" disabled={missionPage >= (missionResults as any).pages} onClick={() => setMissionPage((p) => p + 1)}
                  className="sci-btn text-xs disabled:opacity-30">Next \u25b6</button>
              </div>
            )}
          </div>
        )}

        {/* --- RESOURCES detail --- */}
        {tab === 'resources' && selectedResource && (
          <div className="max-w-5xl mx-auto px-6 py-5">
            {/* Resource header */}
            {(() => {
              const res = resources?.find((r) => r.item_name === selectedResource);
              return res ? (
                <div className="sci-panel p-5 mb-6">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Package size={20} className="text-cyan-500" />
                    <h1 className="font-orbitron text-2xl font-bold text-slate-100 tracking-wide">{res.display_item_name ?? fmtItem(res.item_name)}</h1>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div>
                      <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-wider">Used In</p>
                      <p className="text-lg font-mono-sc text-slate-200 font-medium">{res.recipe_count} <span className="text-xs text-slate-500">recipes</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-wider">Total Quantity</p>
                      <p className="text-lg font-mono-sc text-slate-200 font-medium">{res.total_quantity}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-wider">Total SCU</p>
                      <p className="text-lg font-mono-sc text-cyan-400 font-medium">{fmtScu(res.total_scu ? Number(res.total_scu) : null)}</p>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Recipes using this resource */}
            <div className="flex items-center gap-2 mb-4 justify-center">
              <FlaskConical size={16} className="text-slate-500" />
              <h2 className="font-orbitron text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">Recipes Using {fmtItem(selectedResource)}</h2>
            </div>

            {resourceRecipes?.length ? (
              <div className="space-y-2">
                {resourceRecipes.map((r: any) => (
                  <button key={r.uuid} type="button"
                    onClick={() => { setTab('blueprint'); setSelectedRecipeUuid(r.uuid); setExpandedGroup(r.category); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/40 rounded border border-slate-800/30 hover:bg-slate-900/60 hover:border-cyan-900/40 transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-200 truncate">{r.display_output_item_name ?? fmtItem(r.output_item_name ?? r.name ?? r.class_name)}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {r.category && (
                          <GlowBadge color={CAT_COLORS[r.category] ?? 'slate'} size="xs">
                            {r.display_category ?? r.category}
                          </GlowBadge>
                        )}
                        {(r.display_slot_name ?? r.slot_name) && (
                          <span className="text-[9px] font-mono-sc text-slate-600">{r.display_slot_name ?? fmtItem(r.slot_name)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-mono-sc text-cyan-400">{r.quantity}x</p>
                      {r.scu && <p className="text-[9px] font-mono-sc text-slate-600">{fmtScu(Number(r.scu))}</p>}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="sci-panel p-8 text-center">
                <Package size={24} className="text-slate-800 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-mono-sc">Loading recipes\u2026</p>
              </div>
            )}
          </div>
        )}

        {/* --- empty state --- */}
        {tab === 'blueprint' && !selectedRecipe && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FlaskConical size={40} className="text-slate-800 mx-auto mb-3" />
              <p className="text-sm text-slate-700 font-mono-sc">Select a blueprint</p>
            </div>
          </div>
        )}
        {tab === 'resources' && !selectedResource && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Package size={40} className="text-slate-800 mx-auto mb-3" />
              <p className="text-sm text-slate-700 font-mono-sc">Select a resource</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
